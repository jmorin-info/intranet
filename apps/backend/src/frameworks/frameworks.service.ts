import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FrameworksService {
  private readonly logger = new Logger(FrameworksService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.complianceFramework.findMany({
      where: { isActive: true },
      include: { _count: { select: { controls: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findById(id: string) {
    const fw = await this.prisma.complianceFramework.findUnique({
      where: { id },
      include: {
        controls: {
          orderBy: { code: 'asc' },
          include: {
            documentLinks: {
              include: {
                document: { select: { id: true, title: true, reference: true, status: true } },
              },
            },
          },
        },
      },
    });
    if (!fw) throw new NotFoundException('Framework not found');
    return fw;
  }

  async create(data: { name: string; version?: string; description?: string }) {
    return this.prisma.complianceFramework.create({ data });
  }

  async addControls(frameworkId: string, controls: Array<{
    code: string; title: string; titleFr?: string; domain?: string;
    description?: string; descriptionFr?: string; mappedIsoCode?: string;
  }>) {
    await this.prisma.frameworkControl.createMany({
      data: controls.map(c => ({ frameworkId, ...c })),
      skipDuplicates: true,
    });
    return { added: controls.length };
  }

  async getComplianceSummary(frameworkId: string) {
    const fw = await this.findById(frameworkId);
    const total = fw.controls.length;
    const covered = fw.controls.filter(c => c.documentLinks.some(l => l.status === 'COVERED')).length;
    const partial = fw.controls.filter(c => c.documentLinks.length > 0 && !c.documentLinks.some(l => l.status === 'COVERED')).length;
    const uncovered = total - covered - partial;

    // Group by domain
    const byDomain: Record<string, { total: number; covered: number }> = {};
    for (const c of fw.controls) {
      const d = c.domain || 'Autre';
      if (!byDomain[d]) byDomain[d] = { total: 0, covered: 0 };
      byDomain[d].total++;
      if (c.documentLinks.some(l => l.status === 'COVERED')) byDomain[d].covered++;
    }

    return {
      framework: { id: fw.id, name: fw.name, version: fw.version },
      total, covered, partial, uncovered,
      coveragePercent: total > 0 ? Math.round((covered / total) * 100) : 0,
      byDomain,
    };
  }

  async linkDocument(controlId: string, documentId: string, status = 'LINKED') {
    return this.prisma.frameworkDocumentLink.upsert({
      where: { controlId_documentId: { controlId, documentId } },
      create: { controlId, documentId, status },
      update: { status },
    });
  }

  async seedDefaultFrameworks() {
    const existing = await this.prisma.complianceFramework.count();
    if (existing > 0) return { message: 'Frameworks already seeded' };

    // NIST CSF 2.0
    const nist = await this.prisma.complianceFramework.create({
      data: { name: 'NIST CSF 2.0', version: '2.0', description: 'Cybersecurity Framework du NIST — fonctions Govern, Identify, Protect, Detect, Respond, Recover' },
    });
    await this.addControls(nist.id, [
      { code: 'GV.OC-01', title: 'Organizational Context', titleFr: 'Contexte organisationnel', domain: 'GOVERN' },
      { code: 'GV.RM-01', title: 'Risk Management Strategy', titleFr: 'Stratégie de gestion des risques', domain: 'GOVERN' },
      { code: 'GV.RR-01', title: 'Roles and Responsibilities', titleFr: 'Rôles et responsabilités', domain: 'GOVERN', mappedIsoCode: 'A.5.2' },
      { code: 'GV.SC-01', title: 'Supply Chain Risk Management', titleFr: 'Gestion risques chaîne d\'approvisionnement', domain: 'GOVERN', mappedIsoCode: 'A.5.21' },
      { code: 'ID.AM-01', title: 'Asset Management', titleFr: 'Gestion des actifs', domain: 'IDENTIFY', mappedIsoCode: 'A.5.9' },
      { code: 'ID.RA-01', title: 'Risk Assessment', titleFr: 'Évaluation des risques', domain: 'IDENTIFY', mappedIsoCode: 'A.5.7' },
      { code: 'PR.AA-01', title: 'Identity and Access Management', titleFr: 'Gestion des identités et des accès', domain: 'PROTECT', mappedIsoCode: 'A.5.15' },
      { code: 'PR.AT-01', title: 'Awareness and Training', titleFr: 'Sensibilisation et formation', domain: 'PROTECT', mappedIsoCode: 'A.6.3' },
      { code: 'PR.DS-01', title: 'Data Security', titleFr: 'Sécurité des données', domain: 'PROTECT', mappedIsoCode: 'A.8.24' },
      { code: 'PR.IR-01', title: 'Technology Infrastructure Resilience', titleFr: 'Résilience infrastructure', domain: 'PROTECT', mappedIsoCode: 'A.8.14' },
      { code: 'PR.PS-01', title: 'Platform Security', titleFr: 'Sécurité des plateformes', domain: 'PROTECT', mappedIsoCode: 'A.8.9' },
      { code: 'DE.CM-01', title: 'Continuous Monitoring', titleFr: 'Surveillance continue', domain: 'DETECT', mappedIsoCode: 'A.8.16' },
      { code: 'DE.AE-01', title: 'Adverse Event Analysis', titleFr: 'Analyse d\'événements', domain: 'DETECT', mappedIsoCode: 'A.8.15' },
      { code: 'RS.MA-01', title: 'Incident Management', titleFr: 'Gestion des incidents', domain: 'RESPOND', mappedIsoCode: 'A.5.24' },
      { code: 'RS.AN-01', title: 'Incident Analysis', titleFr: 'Analyse des incidents', domain: 'RESPOND', mappedIsoCode: 'A.5.26' },
      { code: 'RC.RP-01', title: 'Recovery Plan Execution', titleFr: 'Exécution plan de reprise', domain: 'RECOVER', mappedIsoCode: 'A.5.30' },
    ]);

    // ANSSI — Guide d'hygiène informatique
    const anssi = await this.prisma.complianceFramework.create({
      data: { name: 'ANSSI Hygiène', version: '2.0', description: 'Guide d\'hygiène informatique ANSSI — 42 mesures essentielles de sécurité pour les organismes publics et privés' },
    });
    await this.addControls(anssi.id, [
      { code: 'R1', title: 'Sensibiliser et former', titleFr: 'Sensibiliser et former les utilisateurs', domain: 'Sensibilisation', mappedIsoCode: 'A.6.3' },
      { code: 'R2', title: 'Charte informatique', titleFr: 'Rédiger une charte informatique', domain: 'Organisation', mappedIsoCode: 'A.5.10' },
      { code: 'R3', title: 'Inventaire', titleFr: 'Connaître son parc informatique', domain: 'Organisation', mappedIsoCode: 'A.5.9' },
      { code: 'R8', title: 'Identifier les données sensibles', titleFr: 'Identifier les données et traitements sensibles', domain: 'Protection', mappedIsoCode: 'A.5.12' },
      { code: 'R9', title: 'Authentification forte', titleFr: 'Utiliser l\'authentification forte', domain: 'Authentification', mappedIsoCode: 'A.8.5' },
      { code: 'R12', title: 'Droits d\'accès', titleFr: 'Gérer les droits d\'accès', domain: 'Authentification', mappedIsoCode: 'A.5.15' },
      { code: 'R13', title: 'Comptes privilégiés', titleFr: 'Gérer les comptes d\'administration', domain: 'Authentification', mappedIsoCode: 'A.8.2' },
      { code: 'R17', title: 'Chiffrement', titleFr: 'Chiffrer les données sensibles', domain: 'Protection', mappedIsoCode: 'A.8.24' },
      { code: 'R20', title: 'Mises à jour', titleFr: 'Appliquer les correctifs de sécurité', domain: 'Maintenance', mappedIsoCode: 'A.8.8' },
      { code: 'R22', title: 'Firewall', titleFr: 'Filtrer les flux réseau', domain: 'Réseau', mappedIsoCode: 'A.8.20' },
      { code: 'R29', title: 'Sauvegardes', titleFr: 'Sauvegarder régulièrement', domain: 'Sauvegarde', mappedIsoCode: 'A.8.13' },
      { code: 'R33', title: 'Journalisation', titleFr: 'Collecter et analyser les journaux', domain: 'Détection', mappedIsoCode: 'A.8.15' },
      { code: 'R34', title: 'Détection d\'incidents', titleFr: 'Détecter les incidents de sécurité', domain: 'Détection', mappedIsoCode: 'A.5.24' },
      { code: 'R37', title: 'PCA/PRA', titleFr: 'Élaborer un PCA et un PRA', domain: 'Continuité', mappedIsoCode: 'A.5.30' },
    ]);

    // NIS2
    const nis2 = await this.prisma.complianceFramework.create({
      data: { name: 'NIS2', version: '2022/2555', description: 'Directive européenne NIS2 — Article 21 : mesures de gestion des risques cybersécurité incluant PSSI, gestion des incidents et continuité d\'activité' },
    });
    await this.addControls(nis2.id, [
      { code: 'Art.21(2)(a)', title: 'Risk analysis and information security policies', titleFr: 'Analyse des risques et politiques de sécurité', domain: 'Gouvernance', mappedIsoCode: 'A.5.1' },
      { code: 'Art.21(2)(b)', title: 'Incident handling', titleFr: 'Gestion des incidents', domain: 'Incidents', mappedIsoCode: 'A.5.24' },
      { code: 'Art.21(2)(c)', title: 'Business continuity', titleFr: 'Continuité d\'activité et gestion de crise', domain: 'Continuité', mappedIsoCode: 'A.5.30' },
      { code: 'Art.21(2)(d)', title: 'Supply chain security', titleFr: 'Sécurité de la chaîne d\'approvisionnement', domain: 'Fournisseurs', mappedIsoCode: 'A.5.19' },
      { code: 'Art.21(2)(e)', title: 'Security in network and systems', titleFr: 'Sécurité des réseaux et systèmes', domain: 'Technique', mappedIsoCode: 'A.8.9' },
      { code: 'Art.21(2)(f)', title: 'Vulnerability handling', titleFr: 'Traitement des vulnérabilités', domain: 'Technique', mappedIsoCode: 'A.8.8' },
      { code: 'Art.21(2)(g)', title: 'Cybersecurity assessment', titleFr: 'Évaluation de l\'efficacité des mesures', domain: 'Gouvernance', mappedIsoCode: 'A.8.34' },
      { code: 'Art.21(2)(h)', title: 'Cryptography and encryption', titleFr: 'Chiffrement et cryptographie', domain: 'Technique', mappedIsoCode: 'A.8.24' },
      { code: 'Art.21(2)(i)', title: 'Human resources security', titleFr: 'Sécurité des ressources humaines', domain: 'RH', mappedIsoCode: 'A.6.1' },
      { code: 'Art.21(2)(j)', title: 'Multi-factor authentication', titleFr: 'Authentification multifacteur', domain: 'Authentification', mappedIsoCode: 'A.8.5' },
      { code: 'Art.23', title: 'Incident reporting obligations', titleFr: 'Obligations de notification des incidents', domain: 'Incidents' },
      { code: 'Art.24', title: 'Supervision and enforcement', titleFr: 'Supervision et exécution', domain: 'Gouvernance' },
    ]);

    this.logger.log(`Seeded 3 frameworks: NIST CSF 2.0 (${16} controls), ANSSI Hygiène (${14} controls), NIS2 (${12} controls)`);
    return { message: 'Frameworks seeded', frameworks: 3 };
  }
}
