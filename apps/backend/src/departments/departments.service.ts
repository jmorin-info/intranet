import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateDepartmentDto } from "./dto/create-department.dto";
import { UpdateDepartmentDto } from "./dto/update-department.dto";

@Injectable()
export class DepartmentsService {
  private readonly logger = new Logger(DepartmentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const departments = await this.prisma.department.findMany({
      include: {
        _count: {
          select: {
            users: true,
            userMemberships: true,
            tickets: true,
            calendarEvents: true,
            mediaAlbums: true,
          },
        },
        users: {
          where: {
            deletedAt: null,
            isActive: true,
            role: { in: ["DIRECTION", "ADMIN", "SUPER_ADMIN"] as any },
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
            avatarUrl: true,
          },
          take: 3,
          orderBy: { lastName: "asc" },
        },
      },
      orderBy: { name: "asc" },
    });

    // Expose les "managers" séparément (users est déjà la relation de base)
    return departments.map((d) => {
      const { users, ...rest } = d;
      return { ...rest, managers: users };
    });
  }

  async findById(id: string) {
    const department = await this.prisma.department.findUnique({
      where: { id },
      include: {
        users: {
          where: { deletedAt: null },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            isActive: true,
          },
        },
        _count: {
          select: { users: true },
        },
      },
    });

    if (!department) {
      throw new NotFoundException("Department not found");
    }

    return department;
  }

  async create(dto: CreateDepartmentDto) {
    const existingByCode = await this.prisma.department.findUnique({
      where: { code: dto.code.toUpperCase() },
    });

    if (existingByCode) {
      throw new ConflictException("Department code already exists");
    }

    const department = await this.prisma.department.create({
      data: {
        name: dto.name,
        code: dto.code.toUpperCase(),
      },
    });

    this.logger.log(
      `Department created: ${department.name} (${department.code})`,
    );
    return department;
  }

  async update(id: string, dto: UpdateDepartmentDto) {
    await this.findById(id);

    if (dto.code) {
      const existingByCode = await this.prisma.department.findFirst({
        where: {
          code: dto.code.toUpperCase(),
          NOT: { id },
        },
      });

      if (existingByCode) {
        throw new ConflictException("Department code already exists");
      }
    }

    const updated = await this.prisma.department.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.code && { code: dto.code.toUpperCase() }),
      },
    });

    this.logger.log(`Department updated: ${updated.name}`);
    return updated;
  }

  async delete(id: string) {
    const department = await this.findById(id);

    const userCount = await this.prisma.user.count({
      where: { departmentId: id, deletedAt: null },
    });

    if (userCount > 0) {
      throw new ConflictException(
        "Cannot delete department with active users. Reassign users first.",
      );
    }

    await this.prisma.department.delete({ where: { id } });

    this.logger.log(`Department deleted: ${department.name}`);
    return { message: "Department deleted successfully" };
  }

  async assignUser(departmentId: string, userId: string) {
    const dept = await this.prisma.department.findUnique({
      where: { id: departmentId },
    });
    if (!dept) throw new NotFoundException("Department not found");

    // Set as primary department (legacy field)
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");

    // Update legacy departmentId if user has none
    const updateData: any = {};
    if (!user.departmentId) updateData.departmentId = departmentId;

    if (Object.keys(updateData).length > 0) {
      await this.prisma.user.update({
        where: { id: userId },
        data: updateData,
      });
    }

    // Create multi-department membership
    const isPrimary = !user.departmentId || user.departmentId === departmentId;
    await this.prisma.userDepartment.upsert({
      where: { userId_departmentId: { userId, departmentId } },
      update: {},
      create: { userId, departmentId, isPrimary },
    });

    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        departmentId: true,
      },
    });
  }

  async removeUser(departmentId: string, userId: string) {
    // Remove from junction table
    await this.prisma.userDepartment.deleteMany({
      where: { userId, departmentId },
    });

    // If this was the primary department, set to another or null
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user?.departmentId === departmentId) {
      const remaining = await this.prisma.userDepartment.findFirst({
        where: { userId },
        orderBy: { isPrimary: "desc" },
      });
      await this.prisma.user.update({
        where: { id: userId },
        data: { departmentId: remaining?.departmentId || null },
      });
    }

    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        departmentId: true,
      },
    });
  }

  /**
   * Get all departments a user belongs to
   */
  async getUserDepartments(userId: string) {
    return this.prisma.userDepartment.findMany({
      where: { userId },
      include: { department: true },
      orderBy: { isPrimary: "desc" },
    });
  }

  /**
   * Get users in a department (via junction table for multi-dept support)
   */
  async getDepartmentUsers(departmentId: string) {
    const memberships = await this.prisma.userDepartment.findMany({
      where: { departmentId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            isActive: true,
          },
        },
      },
    });
    // Also include users with legacy departmentId
    const legacyUsers = await this.prisma.user.findMany({
      where: { departmentId, deletedAt: null },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
      },
    });
    // Merge and deduplicate
    const seen = new Set<string>();
    const result: any[] = [];
    for (const m of memberships) {
      if (!seen.has(m.user.id)) {
        seen.add(m.user.id);
        result.push(m.user);
      }
    }
    for (const u of legacyUsers) {
      if (!seen.has(u.id)) {
        seen.add(u.id);
        result.push(u);
      }
    }
    return result;
  }
}
