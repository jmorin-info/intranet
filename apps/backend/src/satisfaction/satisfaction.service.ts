import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SatisfactionService {
  constructor(private readonly prisma: PrismaService) {}

  async getSurveys(activeOnly = true) {
    const where: any = {};
    if (activeOnly) {
      where.isActive = true;
      where.OR = [{ expiresAt: null }, { expiresAt: { gt: new Date() } }];
    }
    return this.prisma.satisfactionSurvey.findMany({
      where,
      include: { _count: { select: { responses: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createSurvey(data: {
    title: string;
    description?: string;
    expiresAt?: string;
    isAnonymous?: boolean;
    questions?: Array<{ label: string; type: string; options?: string[]; isRequired?: boolean; description?: string }>;
  }) {
    const survey = await this.prisma.satisfactionSurvey.create({
      data: {
        title: data.title,
        description: data.description,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        isAnonymous: data.isAnonymous || false,
      },
    });

    // Create questions if provided (Google Forms-like)
    if (data.questions && data.questions.length > 0) {
      await this.prisma.surveyQuestion.createMany({
        data: data.questions.map((q, i) => ({
          surveyId: survey.id,
          label: q.label,
          type: q.type || 'rating',
          options: q.options ? JSON.stringify(q.options) : null,
          isRequired: q.isRequired !== false,
          order: i,
          description: q.description,
        })),
      });
    } else {
      // Legacy: create a default rating question
      await this.prisma.surveyQuestion.create({
        data: {
          surveyId: survey.id,
          label: 'Votre niveau de satisfaction global',
          type: 'rating',
          isRequired: true,
          order: 0,
        },
      });
    }

    return this.prisma.satisfactionSurvey.findUnique({
      where: { id: survey.id },
      include: { questions: { orderBy: { order: 'asc' } }, _count: { select: { responses: true } } },
    });
  }

  async getSurveyWithQuestions(surveyId: string) {
    const survey = await this.prisma.satisfactionSurvey.findUnique({
      where: { id: surveyId },
      include: {
        questions: { orderBy: { order: 'asc' } },
        _count: { select: { responses: true } },
      },
    });
    if (!survey) throw new NotFoundException('Survey not found');
    return survey;
  }

  async respond(surveyId: string, userId: string, rating: number, comment?: string, answers?: Array<{ questionId: string; value: string }>) {
    const survey = await this.prisma.satisfactionSurvey.findUnique({
      where: { id: surveyId },
      include: { questions: true },
    });
    if (!survey || !survey.isActive) throw new NotFoundException('Survey not found or inactive');

    // Upsert the main response
    const response = await this.prisma.satisfactionResponse.upsert({
      where: { surveyId_userId: { surveyId, userId } },
      create: { surveyId, userId, rating: Math.min(5, Math.max(1, rating || 0)), comment },
      update: { rating: Math.min(5, Math.max(1, rating || 0)), comment, createdAt: new Date() },
    });

    // Save individual question answers if provided
    if (answers && answers.length > 0) {
      for (const ans of answers) {
        await this.prisma.questionAnswer.upsert({
          where: { responseId_questionId: { responseId: response.id, questionId: ans.questionId } },
          create: { responseId: response.id, questionId: ans.questionId, value: ans.value },
          update: { value: ans.value },
        });
      }
    }

    return response;
  }

  async getResults(surveyId: string) {
    const survey = await this.prisma.satisfactionSurvey.findUnique({
      where: { id: surveyId },
      include: {
        questions: { orderBy: { order: 'asc' } },
        responses: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, departmentId: true } },
            answers: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!survey) throw new NotFoundException('Survey not found');

    const ratings = survey.responses.map((r) => r.rating);
    const avg = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
    const distribution = [1, 2, 3, 4, 5].map((n) => ({
      rating: n,
      count: ratings.filter((r) => r === n).length,
    }));

    // Aggregation by department
    const byDepartment: Record<string, { total: number; sum: number; count: number }> = {};
    for (const response of survey.responses) {
      const deptId = response.user?.departmentId || 'unknown';
      if (!byDepartment[deptId]) {
        byDepartment[deptId] = { total: 0, sum: 0, count: 0 };
      }
      byDepartment[deptId].total++;
      byDepartment[deptId].sum += response.rating;
      byDepartment[deptId].count++;
    }

    const departmentStats = Object.entries(byDepartment).map(([departmentId, stats]) => ({
      departmentId,
      responses: stats.total,
      averageRating: stats.count > 0 ? Math.round((stats.sum / stats.count) * 10) / 10 : 0,
    }));

    // Per-question aggregation
    const questionResults = survey.questions.map((q) => {
      const questionAnswers = survey.responses
        .flatMap((r) => r.answers)
        .filter((a) => a.questionId === q.id);

      const values = questionAnswers.map((a) => a.value);
      const aggregation: any = { total: values.length };

      if (q.type === 'rating') {
        const nums = values.map(Number).filter((n) => !isNaN(n));
        aggregation.distribution = [1, 2, 3, 4, 5].map((n) => ({ value: n, count: nums.filter((v) => v === n).length }));
        aggregation.average = nums.length > 0 ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10 : 0;
      } else if (q.type === 'scale') {
        const nums = values.map(Number).filter((n) => !isNaN(n));
        aggregation.distribution = Array.from({ length: 10 }, (_, i) => ({ value: i + 1, count: nums.filter((v) => v === i + 1).length }));
        aggregation.average = nums.length > 0 ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10 : 0;
      } else if (q.type === 'choice' || q.type === 'yesno') {
        const counts: Record<string, number> = {};
        for (const v of values) { counts[v] = (counts[v] || 0) + 1; }
        aggregation.choices = Object.entries(counts).map(([label, count]) => ({ label, count }));
      } else if (q.type === 'text') {
        aggregation.texts = values.filter((v) => v.trim());
      }

      return {
        questionId: q.id,
        label: q.label,
        type: q.type,
        options: q.options,
        aggregation,
      };
    });

    return {
      survey: { id: survey.id, title: survey.title, description: survey.description },
      stats: {
        totalResponses: ratings.length,
        averageRating: Math.round(avg * 10) / 10,
        distribution,
        byDepartment: departmentStats,
      },
      questionResults,
      responses: survey.responses,
    };
  }

  async getResponseRate() {
    const totalActiveUsers = await this.prisma.user.count({
      where: { isActive: true, deletedAt: null },
    });

    // Get active surveys
    const activeSurveys = await this.prisma.satisfactionSurvey.findMany({
      where: {
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      include: {
        _count: { select: { responses: true } },
      },
    });

    const surveyRates = activeSurveys.map((s) => ({
      surveyId: s.id,
      title: s.title,
      responses: s._count.responses,
      totalUsers: totalActiveUsers,
      rate: totalActiveUsers > 0
        ? Math.round((s._count.responses / totalActiveUsers) * 1000) / 10
        : 0,
    }));

    const totalResponses = surveyRates.reduce((sum, s) => sum + s.responses, 0);
    const globalRate = activeSurveys.length > 0 && totalActiveUsers > 0
      ? Math.round((totalResponses / (totalActiveUsers * activeSurveys.length)) * 1000) / 10
      : 0;

    return {
      totalActiveUsers,
      activeSurveys: activeSurveys.length,
      globalResponseRate: globalRate,
      surveys: surveyRates,
    };
  }

  async getResultsByDepartment(surveyId: string) {
    const survey = await this.prisma.satisfactionSurvey.findUnique({
      where: { id: surveyId },
      include: {
        responses: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                departmentId: true,
                role: true,
                department: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });
    if (!survey) throw new NotFoundException('Survey not found');

    // Group by department
    const byDepartment: Record<string, { name: string; ratings: number[]; responses: any[] }> = {};
    for (const response of survey.responses) {
      const deptName = response.user?.department?.name || 'Non attribue';
      const deptId = response.user?.departmentId || 'unknown';
      if (!byDepartment[deptId]) {
        byDepartment[deptId] = { name: deptName, ratings: [], responses: [] };
      }
      byDepartment[deptId].ratings.push(response.rating);
      byDepartment[deptId].responses.push(response);
    }

    // Group by role
    const byRole: Record<string, { ratings: number[]; count: number }> = {};
    for (const response of survey.responses) {
      const role = response.user?.role || 'UNKNOWN';
      if (!byRole[role]) {
        byRole[role] = { ratings: [], count: 0 };
      }
      byRole[role].ratings.push(response.rating);
      byRole[role].count++;
    }

    return {
      survey: { id: survey.id, title: survey.title },
      byDepartment: Object.entries(byDepartment).map(([id, dept]) => ({
        departmentId: id,
        departmentName: dept.name,
        totalResponses: dept.ratings.length,
        averageRating: dept.ratings.length > 0
          ? Math.round((dept.ratings.reduce((a, b) => a + b, 0) / dept.ratings.length) * 10) / 10
          : 0,
        distribution: [1, 2, 3, 4, 5].map((n) => ({
          rating: n,
          count: dept.ratings.filter((r) => r === n).length,
        })),
      })),
      byRole: Object.entries(byRole).map(([role, data]) => ({
        role,
        totalResponses: data.count,
        averageRating: data.ratings.length > 0
          ? Math.round((data.ratings.reduce((a, b) => a + b, 0) / data.ratings.length) * 10) / 10
          : 0,
      })),
    };
  }

  async updateSurvey(id: string, data: {
    title?: string;
    description?: string;
    expiresAt?: string;
    isAnonymous?: boolean;
    questions?: Array<{ id?: string; label: string; type: string; options?: string[]; isRequired?: boolean; description?: string }>;
  }) {
    const survey = await this.prisma.satisfactionSurvey.findUnique({ where: { id } });
    if (!survey) throw new NotFoundException('Survey not found');

    // Update survey fields
    await this.prisma.satisfactionSurvey.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.expiresAt !== undefined && { expiresAt: data.expiresAt ? new Date(data.expiresAt) : null }),
        ...(data.isAnonymous !== undefined && { isAnonymous: data.isAnonymous }),
      },
    });

    // Replace questions if provided
    if (data.questions) {
      // Delete existing questions
      await this.prisma.surveyQuestion.deleteMany({ where: { surveyId: id } });
      // Create new questions
      await this.prisma.surveyQuestion.createMany({
        data: data.questions.map((q, i) => ({
          surveyId: id,
          label: q.label,
          type: q.type || 'rating',
          options: q.options ? JSON.stringify(q.options) : null,
          isRequired: q.isRequired !== false,
          order: i,
          description: q.description,
        })),
      });
    }

    return this.prisma.satisfactionSurvey.findUnique({
      where: { id },
      include: { questions: { orderBy: { order: 'asc' } }, _count: { select: { responses: true } } },
    });
  }

  async deleteSurvey(id: string) {
    const survey = await this.prisma.satisfactionSurvey.findUnique({ where: { id } });
    if (!survey) throw new NotFoundException('Survey not found');
    await this.prisma.satisfactionSurvey.delete({ where: { id } });
    return { message: 'Survey deleted' };
  }

  async getGlobalStats() {
    const surveys = await this.prisma.satisfactionSurvey.findMany({
      include: { responses: true, _count: { select: { responses: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const allRatings = surveys.flatMap((s) => s.responses.map((r) => r.rating));
    const globalAvg = allRatings.length > 0 ? allRatings.reduce((a, b) => a + b, 0) / allRatings.length : 0;

    return {
      globalAverage: Math.round(globalAvg * 10) / 10,
      totalSurveys: surveys.length,
      totalResponses: allRatings.length,
      surveys: surveys.map((s) => ({
        id: s.id,
        title: s.title,
        isActive: s.isActive,
        responses: s._count.responses,
        avg: s.responses.length > 0
          ? Math.round((s.responses.reduce((a, b) => a + b.rating, 0) / s.responses.length) * 10) / 10
          : 0,
      })),
    };
  }
}
