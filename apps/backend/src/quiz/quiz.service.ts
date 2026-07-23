import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CacheService } from "../common/cache/cache.service";

interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  category: string;
}

const DEFAULT_QUESTIONS: QuizQuestion[] = [
  {
    id: "q1",
    question: "Quelle est la longueur minimale recommandée pour un mot de passe sécurisé ?",
    options: ["6 caractères", "8 caractères", "12 caractères", "4 caractères"],
    correctIndex: 2,
    explanation:
      "La politique OMNITECH exige un minimum de 12 caractères avec majuscules, minuscules, chiffres et caractères spéciaux.",
    category: "Mots de passe",
  },
  {
    id: "q2",
    question: "Que faire si vous recevez un email suspect demandant vos identifiants ?",
    options: [
      "Répondre avec vos identifiants",
      "Cliquer sur le lien pour vérifier",
      "Signaler au RSSI et supprimer l'email",
      "Transférer à un collègue",
    ],
    correctIndex: 2,
    explanation:
      "Ne jamais cliquer sur les liens suspects. Signaler immédiatement au RSSI via un ticket de type SECURITY.",
    category: "Phishing",
  },
  {
    id: "q3",
    question: 'Que signifie la classification "CONFIDENTIEL" d\'un document ?',
    options: [
      "Accessible à tous",
      "Réservé aux collaborateurs",
      "Accès restreint aux personnes autorisées",
      "Uniquement la direction",
    ],
    correctIndex: 2,
    explanation:
      "Les documents CONFIDENTIEL ne sont accessibles qu'aux personnes explicitement autorisées selon la politique de classification.",
    category: "Classification",
  },
  {
    id: "q4",
    question: "Quand devez-vous verrouiller votre poste de travail ?",
    options: [
      "En fin de journée uniquement",
      "Dès que vous quittez votre bureau",
      "Jamais",
      "Uniquement en réunion",
    ],
    correctIndex: 1,
    explanation:
      "Verrouillez votre poste (Windows+L) dès que vous quittez votre bureau, même brièvement. Le verrouillage automatique est configuré après 5 minutes.",
    category: "Poste de travail",
  },
  {
    id: "q5",
    question: "Quel est le délai maximum pour signaler un incident de sécurité ?",
    options: ["24 heures", "1 semaine", "4 heures", "1 mois"],
    correctIndex: 2,
    explanation:
      "Tout incident de sécurité doit être signalé dans les 4 heures via le portail de tickets IT (catégorie SECURITY).",
    category: "Incidents",
  },
  {
    id: "q6",
    question: "L'authentification MFA est obligatoire pour :",
    options: [
      "Personne",
      "Les administrateurs uniquement",
      "Les prestataires externes",
      "Tous les utilisateurs à terme",
    ],
    correctIndex: 2,
    explanation:
      "Le MFA est obligatoire pour les prestataires externes. Il est fortement recommandé pour tous les collaborateurs.",
    category: "Authentification",
  },
  {
    id: "q7",
    question: "Où devez-vous stocker vos documents de travail ?",
    options: [
      "Sur votre bureau Windows",
      "Sur une clé USB",
      "Sur les serveurs de l'entreprise",
      "Sur votre compte Google personnel",
    ],
    correctIndex: 2,
    explanation:
      "Les documents doivent être stockés sur les serveurs (intranet GED). Les sauvegardes sont automatiques et quotidiennes via Veeam.",
    category: "Stockage",
  },
  {
    id: "q8",
    question: "Que faire en cas de perte de votre téléphone avec l'application MFA ?",
    options: [
      "Attendre de le retrouver",
      "Utiliser un code de secours",
      "Créer un nouveau compte",
      "Appeler le support Microsoft",
    ],
    correctIndex: 1,
    explanation:
      "Utilisez l'un des 8 codes de secours générés lors de l'activation MFA. Si épuisés, contactez le RSSI pour un reset.",
    category: "Authentification",
  },
  {
    id: "q9",
    question: "Le VPN est obligatoire dans quelle situation ?",
    options: ["Au bureau", "En télétravail", "Jamais", "Uniquement sur mobile"],
    correctIndex: 1,
    explanation:
      "Le VPN FortiClient SSL est obligatoire pour tout accès distant au SI de l'entreprise.",
    category: "Réseau",
  },
  {
    id: "q10",
    question: "Quelle norme ISO encadre la sécurité de l'information chez OMNITECH ?",
    options: ["ISO 9001", "ISO 14001", "ISO 27001:2022", "ISO 45001"],
    correctIndex: 2,
    explanation:
      "OMNITECH applique la norme ISO 27001:2022 pour la gestion de la sécurité de l'information.",
    category: "Conformité",
  },
  {
    id: "q11",
    question: "Qu'est-ce qu'un SMSI ?",
    options: [
      "Système de Management de la Sécurité de l'Information",
      "Service de Maintenance des Systèmes Informatiques",
      "Standard de Mesure de la Sécurité Internet",
      "Structure de Management des Services IT",
    ],
    correctIndex: 0,
    explanation:
      "Le SMSI est le cadre de gouvernance qui organise la sécurité de l'information dans l'entreprise — politiques, procédures, contrôles.",
    category: "Sécurité",
  },
  {
    id: "q12",
    question: "Quel outil OMNITECH utilise pour les sauvegardes ?",
    options: ["Acronis", "Veeam Backup & Replication", "Windows Backup", "rsync"],
    correctIndex: 1,
    explanation:
      "OMNITECH utilise Veeam Backup & Replication pour les sauvegardes quotidiennes des VM et serveurs.",
    category: "Infrastructure",
  },
  {
    id: "q13",
    question: "Quel est le firewall principal d'OMNITECH ?",
    options: ["pfSense", "Cisco ASA", "FortiGate (Fortinet)", "Sophos XG"],
    correctIndex: 2,
    explanation:
      "Le parc réseau OMNITECH est protégé par des firewalls FortiGate de Fortinet, avec FortiOS et FortiClient VPN.",
    category: "Réseau",
  },
  {
    id: "q14",
    question: "Quelle est la fréquence de revue des règles firewall chez OMNITECH ?",
    options: ["Annuelle", "Semestrielle", "Trimestrielle", "Mensuelle"],
    correctIndex: 2,
    explanation:
      "Les règles firewall sont révisées tous les trimestres conformément à la procédure de sécurité réseau.",
    category: "Réseau",
  },
  {
    id: "q15",
    question: "OMNITECH Security est une filiale de quel groupe ?",
    options: ["Thales", "DOM-SECURITY", "Atos", "Capgemini"],
    correctIndex: 1,
    explanation:
      "OMNITECH Security est une filiale du groupe DOM-SECURITY, spécialisée dans les systèmes de sûreté pour sites à risques.",
    category: "Entreprise",
  },
  {
    id: "q16",
    question: "Quel antivirus est déployé sur les postes OMNITECH ?",
    options: ["Windows Defender", "Kaspersky", "ESET NOD32", "Norton"],
    correctIndex: 2,
    explanation:
      "ESET NOD32 est l'antivirus déployé sur tous les postes de travail du parc OMNITECH.",
    category: "Poste de travail",
  },
  {
    id: "q17",
    question: "Comment signaler un email de phishing ?",
    options: [
      "Le supprimer",
      "Le transférer au RSSI + créer un ticket SECURITY",
      "Répondre pour vérifier",
      "L'ignorer",
    ],
    correctIndex: 1,
    explanation:
      "Transférez l'email suspect au RSSI et créez un ticket de catégorie SECURITY dans l'intranet. Ne cliquez jamais sur les liens.",
    category: "Phishing",
  },
  {
    id: "q18",
    question: "Quel est le logiciel de signature électronique utilisé par OMNITECH ?",
    options: ["DocuSign", "DocuSeal", "Adobe Sign", "HelloSign"],
    correctIndex: 1,
    explanation:
      "OMNITECH utilise DocuSeal, une solution open-source auto-hébergée pour les signatures électroniques à valeur probante.",
    category: "Outils",
  },
  {
    id: "q19",
    question: "Que faire si vous trouvez une clé USB inconnue ?",
    options: [
      "La brancher pour voir son contenu",
      "La donner à un collègue",
      "La remettre au service IT sans la brancher",
      "La jeter",
    ],
    correctIndex: 2,
    explanation:
      "Ne branchez JAMAIS une clé USB inconnue — elle pourrait contenir un malware. Remettez-la au service IT pour analyse sécurisée.",
    category: "Poste de travail",
  },
  {
    id: "q20",
    question: "Quel est le progiciel phare développé par OMNITECH Security ?",
    options: ["SAP Security", "SEAL System", "Fortify", "Qualys"],
    correctIndex: 1,
    explanation:
      "SEAL System est l'ERP dédié à la sûreté développé par OMNITECH, utilisé dans les aéroports et sites à haut risque.",
    category: "Entreprise",
  },
];

@Injectable()
export class QuizService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  // =========================================================================
  // Campaign CRUD
  // =========================================================================

  async getCampaigns() {
    return this.prisma.quizCampaign.findMany({
      orderBy: { createdAt: "desc" },
    });
  }

  async getCampaignById(id: string) {
    const campaign = await this.prisma.quizCampaign.findUnique({
      where: { id },
    });
    if (!campaign) throw new NotFoundException("Quiz campaign not found");
    return {
      ...campaign,
      questions: JSON.parse(campaign.questions) as QuizQuestion[],
    };
  }

  async createCampaign(data: {
    title: string;
    description?: string;
    isActive?: boolean;
    questions: QuizQuestion[];
    passingScore?: number;
  }) {
    return this.prisma.quizCampaign.create({
      data: {
        title: data.title,
        description: data.description,
        isActive: data.isActive ?? true,
        questions: JSON.stringify(data.questions),
        passingScore: data.passingScore ?? 70,
      },
    });
  }

  async updateCampaign(
    id: string,
    data: {
      title?: string;
      description?: string;
      isActive?: boolean;
      questions?: any;
      passingScore?: number;
    },
  ) {
    const campaign = await this.prisma.quizCampaign.findUnique({
      where: { id },
    });
    if (!campaign) throw new NotFoundException("Quiz campaign not found");
    const updateData: any = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.passingScore !== undefined) updateData.passingScore = data.passingScore;
    if (data.questions !== undefined) {
      updateData.questions =
        typeof data.questions === "string" ? data.questions : JSON.stringify(data.questions);
    }
    return this.prisma.quizCampaign.update({ where: { id }, data: updateData });
  }

  async deleteCampaign(id: string) {
    const campaign = await this.prisma.quizCampaign.findUnique({
      where: { id },
    });
    if (!campaign) throw new NotFoundException("Quiz campaign not found");
    await this.prisma.quizCampaign.delete({ where: { id } });
    return { message: "Campaign deleted" };
  }

  // =========================================================================
  // Existing quiz logic (backwards-compatible)
  // =========================================================================

  async getQuestions(): Promise<QuizQuestion[]> {
    const config = await this.prisma.appConfig.findUnique({
      where: { key: "quiz_questions" },
    });
    if (config) {
      try {
        return JSON.parse(config.value);
      } catch {
        return DEFAULT_QUESTIONS;
      }
    }
    return DEFAULT_QUESTIONS;
  }

  async getRandomQuestions(count = 10): Promise<QuizQuestion[]> {
    const all = await this.getQuestions();
    // Fisher-Yates shuffle
    const shuffled = [...all];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    return shuffled.slice(0, Math.min(count, shuffled.length));
  }

  async submitResult(
    userId: string,
    score: number,
    total: number,
    answers: Record<string, number>,
    campaignTitle?: string,
  ) {
    // Store in audit log for tracking
    const log = await this.prisma.auditLog.create({
      data: {
        userId,
        action: "QUIZ_COMPLETED",
        resourceType: "Quiz",
        // Prisma.InputJsonValue : on construit un objet JSON-sérialisable.
        metadata: {
          score,
          total,
          percentage: Math.round((score / total) * 100),
          answers,
          campaignTitle: campaignTitle || "Quiz Sécurité OMNITECH",
        } as Prisma.InputJsonValue,
        severity: score / total >= 0.7 ? "INFO" : "WARN",
      },
    });
    return {
      score,
      total,
      percentage: Math.round((score / total) * 100),
      passed: score / total >= 0.7,
      auditLogId: log.id,
    };
  }

  async getMyResults(userId: string, limit = 20) {
    const results = await this.prisma.auditLog.findMany({
      where: { userId, action: "QUIZ_COMPLETED" },
      orderBy: { createdAt: "desc" },
      take: Math.max(1, Math.min(limit, 100)),
    });
    return results.map((r) => {
      const meta = (r.metadata as Record<string, unknown>) ?? {};
      const score = typeof meta.score === "number" ? meta.score : 0;
      const total = typeof meta.total === "number" ? meta.total : 0;
      const percentage = typeof meta.percentage === "number" ? meta.percentage : 0;
      return {
        id: r.id,
        score,
        total,
        percentage,
        passed: percentage >= 70,
        campaignTitle: (meta.campaignTitle as string) ?? "Quiz Sécurité OMNITECH",
        completedAt: r.createdAt,
      };
    });
  }

  async getLeaderboard() {
    const results = await this.prisma.auditLog.findMany({
      where: { action: "QUIZ_COMPLETED" },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            departmentId: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    // Best score per user
    const bestScores = new Map<string, { user: any; score: number; total: number; date: Date }>();
    for (const r of results) {
      // Prisma.JsonValue dynamique — extraction défensive
      const meta = (r.metadata as Record<string, number> | null) ?? {};
      if (
        !bestScores.has(r.userId!) ||
        (meta.percentage ?? 0) >
          (bestScores.get(r.userId!)!.score / bestScores.get(r.userId!)!.total) * 100
      ) {
        bestScores.set(r.userId!, {
          user: r.user,
          score: meta.score ?? 0,
          total: meta.total ?? 0,
          date: r.createdAt,
        });
      }
    }
    return Array.from(bestScores.values())
      .sort((a, b) => b.score / b.total - a.score / a.total)
      .slice(0, 20);
  }

  async updateQuestions(questions: any[]) {
    await this.prisma.appConfig.upsert({
      where: { key: "quiz_questions" },
      create: {
        key: "quiz_questions",
        value: JSON.stringify(questions),
        description: "Quiz security questions",
      },
      update: { value: JSON.stringify(questions) },
    });
    return { message: "Questions mises à jour", count: questions.length };
  }

  // =========================================================================
  // Certificate generation
  // =========================================================================

  async getCertificateData(auditLogId: string) {
    const log = await this.prisma.auditLog.findUnique({
      where: { id: auditLogId },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
    if (!log || log.action !== "QUIZ_COMPLETED")
      throw new NotFoundException("Quiz result not found");
    // Prisma.JsonValue dynamique — extraction défensive
    const meta = (log.metadata as Record<string, unknown> | null) ?? null;
    if (!meta || typeof meta.percentage !== "number" || meta.percentage < 70) {
      throw new NotFoundException("Quiz not passed — no certificate available");
    }
    return {
      userId: log.userId!,
      userName:
        `${log.user?.firstName ?? ""} ${log.user?.lastName ?? ""}`.trim() ||
        log.user?.email ||
        "Utilisateur",
      campaignTitle: (meta.campaignTitle as string) || "Quiz Sécurité OMNITECH",
      score: meta.score as number,
      total: meta.total as number,
      percentage: meta.percentage as number,
      date: log.createdAt,
      auditLogId: log.id,
    };
  }

  generateCertificate(
    userId: string,
    userName: string,
    campaignTitle: string,
    score: number,
    total: number,
    date: Date,
    auditLogId: string,
  ): string {
    const percentage = Math.round((score / total) * 100);
    const dateStr = new Date(date).toLocaleDateString("fr-FR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const certId = `CERT-${auditLogId.slice(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Certificat - ${campaignTitle}</title>
  <style>
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .no-print { display: none; } }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f5f5f5; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
    .certificate { background: #fff; width: 800px; max-width: 100%; padding: 0; border: 3px solid #1a2744; position: relative; box-shadow: 0 4px 24px rgba(0,0,0,0.12); }
    .border-inner { border: 1px solid #e0853e; margin: 8px; padding: 40px 50px; min-height: 540px; display: flex; flex-direction: column; }
    .header { text-align: center; margin-bottom: 30px; }
    .header-bar { background: #1a2744; color: #fff; margin: -40px -50px 30px -50px; padding: 24px 50px; text-align: center; }
    .header-bar h1 { font-size: 20px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; }
    .header-bar .accent { color: #e0853e; }
    .subtitle { font-size: 13px; color: #888; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 6px; }
    .title { font-size: 28px; font-weight: 700; color: #1a2744; margin-bottom: 4px; }
    .body { flex: 1; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; }
    .name { font-size: 32px; font-weight: 700; color: #1a2744; border-bottom: 2px solid #e0853e; padding-bottom: 6px; display: inline-block; }
    .quiz-title { font-size: 16px; color: #555; }
    .score-box { display: inline-flex; align-items: center; gap: 16px; background: #f8f9fa; border: 1px solid #e5e5e5; border-radius: 8px; padding: 12px 24px; margin: 8px 0; }
    .score-value { font-size: 36px; font-weight: 800; color: #1a2744; }
    .score-detail { text-align: left; font-size: 13px; color: #888; line-height: 1.5; }
    .footer { margin-top: 30px; text-align: center; font-size: 11px; color: #aaa; border-top: 1px solid #eee; padding-top: 16px; }
    .footer .cert-id { font-family: monospace; font-size: 10px; color: #bbb; margin-top: 4px; }
    .date { font-size: 14px; color: #555; }
    .print-btn { margin-top: 20px; padding: 10px 28px; background: #1a2744; color: #fff; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; }
    .print-btn:hover { background: #2a3a5c; }
  </style>
</head>
<body>
  <div class="certificate">
    <div class="border-inner">
      <div class="header-bar">
        <h1><span class="accent">OMNITECH</span> Security</h1>
      </div>
      <div class="header">
        <p class="subtitle">Certificat de réussite</p>
        <p class="title">${this.escapeHtml(campaignTitle)}</p>
      </div>
      <div class="body">
        <p style="font-size:14px;color:#888;">Ce certificat atteste que</p>
        <p class="name">${this.escapeHtml(userName)}</p>
        <p class="quiz-title">a réussi avec succès le quiz<br/><strong>&laquo; ${this.escapeHtml(campaignTitle)} &raquo;</strong></p>
        <div class="score-box">
          <span class="score-value">${percentage}%</span>
          <span class="score-detail">Score : ${score} / ${total}<br/>Seuil de réussite : 70%</span>
        </div>
        <p class="date">Complété le ${dateStr}</p>
      </div>
      <div class="footer">
        <p>OMNITECH Security &mdash; Filiale du groupe DOM-SECURITY</p>
        <p class="cert-id">${certId}</p>
      </div>
    </div>
  </div>
  <button class="print-btn no-print" onclick="window.print()">Imprimer / Télécharger en PDF</button>
</body>
</html>`;
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async getParticipationStats() {
    return this.cache.wrap("stats:quiz:participation", 300, async () => {
      // Get all quiz completions + totalUsers : indépendants → parallèle
      const [completions, totalUsers] = await Promise.all([
        this.prisma.auditLog.findMany({
          where: { action: "QUIZ_COMPLETED" },
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                departmentId: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        }),
        this.prisma.user.count({
          where: { isActive: true, deletedAt: null },
        }),
      ]);

      const uniqueParticipants = new Set(completions.map((c) => c.userId)).size;
      // Prisma.JsonValue dynamique — extraction défensive
      const pct = (m: Prisma.JsonValue | null): number => {
        if (m && typeof m === "object" && !Array.isArray(m)) {
          const p = (m as Record<string, unknown>).percentage;
          return typeof p === "number" ? p : 0;
        }
        return 0;
      };
      const averageScore =
        completions.length > 0
          ? completions.reduce((sum, c) => sum + pct(c.metadata), 0) / completions.length
          : 0;

      // By department
      const byDepartment = new Map<string, { count: number; totalScore: number }>();
      for (const c of completions) {
        const dept = c.user?.departmentId || "unknown";
        const current = byDepartment.get(dept) || { count: 0, totalScore: 0 };
        current.count++;
        current.totalScore += pct(c.metadata);
        byDepartment.set(dept, current);
      }

      return {
        totalUsers,
        participants: uniqueParticipants,
        participationRate: totalUsers > 0 ? Math.round((uniqueParticipants / totalUsers) * 100) : 0,
        averageScore: Math.round(averageScore),
        totalCompletions: completions.length,
        passingRate: Math.round(
          (completions.filter((c) => pct(c.metadata) >= 70).length /
            Math.max(completions.length, 1)) *
            100,
        ),
      };
    });
  }
}
