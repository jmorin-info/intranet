import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

/**
 * ISO 27001:2022 Document Analyzer
 *
 * Analyzes document content (title, description, file text) and automatically:
 * 1. Maps documents to relevant ISO 27001 Annex A controls
 * 2. Generates conformity/non-conformity justifications
 * 3. Identifies coverage gaps in the ISMS
 *
 * Uses keyword-based matching against a comprehensive mapping of ISO controls
 * to security domains, concepts, and terminology.
 */

// Mapping of ISO control codes to keyword patterns (French + English)
const ISO_CONTROL_KEYWORDS: Record<string, string[]> = {
  // A.5 — Organizational controls
  'A.5.1': ['politique', 'policy', 'pssi', 'smsi', 'isms', 'securite information', 'information security', 'charte'],
  'A.5.2': ['role', 'responsabilite', 'responsibility', 'rssi', 'ciso', 'dpo', 'organisation', 'organigramme'],
  'A.5.3': ['separation', 'segregation', 'duties', 'fonctions', 'incompatibilite', 'principe quatre yeux'],
  'A.5.4': ['management', 'direction', 'engagement', 'leadership', 'gouvernance'],
  'A.5.5': ['autorite', 'authority', 'anssi', 'cnil', 'regulateur', 'legal', 'contact'],
  'A.5.6': ['veille', 'threat intelligence', 'cert', 'csirt', 'communaute', 'special interest'],
  'A.5.7': ['menace', 'threat', 'intelligence', 'veille securite', 'vulnerability', 'vulnerabilite'],
  'A.5.8': ['projet', 'project', 'security by design', 'integration securite', 'devops', 'sdlc'],
  'A.5.9': ['inventaire', 'inventory', 'asset', 'actif', 'cmdb', 'patrimoine', 'cartographie'],
  'A.5.10': ['utilisation acceptable', 'acceptable use', 'charte informatique', 'bon usage'],
  'A.5.11': ['restitution', 'return', 'depart', 'offboarding', 'fin contrat'],
  'A.5.12': ['classification', 'confidentialite', 'confidentiel', 'secret', 'public', 'interne', 'sensible'],
  'A.5.13': ['marquage', 'labelling', 'etiquetage', 'label', 'filigrane', 'watermark'],
  'A.5.14': ['transfert', 'transfer', 'echange', 'partage', 'envoi', 'email', 'messagerie', 'chiffrement transit'],
  'A.5.15': ['controle acces', 'access control', 'habilitation', 'droit acces', 'privilege', 'moindre privilege'],
  'A.5.16': ['identite', 'identity', 'iam', 'gestion identite', 'provisioning', 'compte'],
  'A.5.17': ['authentification', 'authentication', 'mfa', 'mot de passe', 'password', '2fa', 'otp', 'biometrie'],
  'A.5.18': ['droit acces', 'access rights', 'revue habilitation', 'acces review', 'revocation'],
  'A.5.19': ['fournisseur', 'supplier', 'prestataire', 'sous-traitant', 'third party', 'tiers'],
  'A.5.20': ['contrat', 'agreement', 'clause securite', 'sla', 'nda', 'annexe securite'],
  'A.5.21': ['supply chain', 'chaine approvisionnement', 'ict', 'sous-traitance informatique'],
  'A.5.22': ['monitoring fournisseur', 'revue fournisseur', 'supplier review', 'evaluation'],
  'A.5.23': ['cloud', 'saas', 'paas', 'iaas', 'hebergement', 'externalisation'],
  'A.5.24': ['incident', 'gestion incident', 'incident management', 'procedure incident', 'escalade'],
  'A.5.25': ['evenement', 'event', 'detection', 'triage', 'qualification incident'],
  'A.5.26': ['reponse', 'response', 'remediation', 'confinement', 'eradication'],
  'A.5.27': ['retour experience', 'lessons learned', 'rex', 'post-mortem', 'amelioration'],
  'A.5.28': ['preuve', 'evidence', 'forensique', 'forensic', 'investigation', 'collecte preuve'],
  'A.5.29': ['continuite', 'continuity', 'pca', 'bcp', 'crise', 'disruption', 'resilience'],
  'A.5.30': ['pra', 'drp', 'disaster recovery', 'reprise activite', 'rto', 'rpo', 'sauvegarde'],
  'A.5.31': ['conformite', 'compliance', 'legal', 'reglementaire', 'rgpd', 'gdpr', 'loi'],
  'A.5.32': ['propriete intellectuelle', 'intellectual property', 'licence', 'copyright', 'brevet'],
  'A.5.33': ['enregistrement', 'record', 'archivage', 'retention', 'conservation', 'duree conservation'],
  'A.5.34': ['donnees personnelles', 'personal data', 'pii', 'rgpd', 'gdpr', 'vie privee', 'privacy', 'dpo'],
  'A.5.35': ['audit', 'revue independante', 'independent review', 'controle interne', 'certification'],
  'A.5.36': ['politique', 'norme', 'standard', 'procedure', 'conformite politique'],
  'A.5.37': ['procedure operationnelle', 'operating procedure', 'mode operatoire', 'processus documente'],

  // A.6 — People controls
  'A.6.1': ['screening', 'verification', 'antecedent', 'background check', 'recrutement', 'embauche'],
  'A.6.2': ['emploi', 'employment', 'contrat travail', 'clause confidentialite', 'engagement'],
  'A.6.3': ['sensibilisation', 'awareness', 'formation', 'training', 'e-learning', 'phishing test'],
  'A.6.4': ['sanction', 'disciplinaire', 'disciplinary', 'mesure disciplinaire', 'non-conformite'],
  'A.6.5': ['fin emploi', 'termination', 'depart', 'demission', 'licenciement', 'offboarding'],
  'A.6.6': ['confidentialite', 'nda', 'non-disclosure', 'secret professionnel', 'obligation discretion'],
  'A.6.7': ['teletravail', 'remote work', 'travail distance', 'nomadisme', 'byod', 'mobile'],
  'A.6.8': ['signalement', 'reporting', 'declaration incident', 'alerte', 'whistleblowing'],

  // A.7 — Physical controls
  'A.7.1': ['perimetre physique', 'physical perimeter', 'cloture', 'enceinte', 'batiment'],
  'A.7.2': ['acces physique', 'physical entry', 'badge', 'controle entree', 'portique', 'sas'],
  'A.7.3': ['bureau', 'office', 'salle', 'local', 'securisation local'],
  'A.7.4': ['surveillance', 'monitoring', 'video', 'camera', 'videosurveillance', 'alarme'],
  'A.7.5': ['menace physique', 'physical threat', 'incendie', 'inondation', 'seisme', 'foudre'],
  'A.7.6': ['zone securisee', 'secure area', 'datacenter', 'salle serveur', 'salle blanche'],
  'A.7.7': ['bureau propre', 'clear desk', 'ecran verrouille', 'clean screen', 'clear screen'],
  'A.7.8': ['equipement', 'equipment', 'materiel', 'poste travail', 'laptop', 'serveur physique'],
  'A.7.9': ['hors site', 'off-premises', 'transport', 'deplacement', 'equipement mobile'],
  'A.7.10': ['support', 'media', 'disque', 'cle usb', 'stockage amovible', 'destruction'],
  'A.7.11': ['utilite', 'utility', 'electricite', 'onduleur', 'ups', 'climatisation', 'alimentation'],
  'A.7.12': ['cablage', 'cabling', 'reseau physique', 'baie brassage', 'fibre'],
  'A.7.13': ['maintenance', 'entretien', 'reparation', 'intervention', 'maintenance preventive'],
  'A.7.14': ['mise au rebut', 'disposal', 'destruction', 'effacement', 'decommissionnement', 'wipe'],

  // A.8 — Technological controls
  'A.8.1': ['endpoint', 'poste utilisateur', 'device', 'equipement utilisateur', 'durcissement'],
  'A.8.2': ['acces privilegie', 'privileged access', 'pam', 'admin', 'root', 'sudo', 'elevation'],
  'A.8.3': ['restriction acces', 'access restriction', 'filtrage', 'firewall', 'acl', 'segmentation'],
  'A.8.4': ['code source', 'source code', 'repository', 'git', 'developpement', 'versionning'],
  'A.8.5': ['authentification securisee', 'secure authentication', 'sso', 'ldap', 'saml', 'oauth', 'kerberos'],
  'A.8.6': ['capacite', 'capacity', 'dimensionnement', 'scalability', 'monitoring ressource'],
  'A.8.7': ['malware', 'antivirus', 'edr', 'anti-malware', 'protection malveillant', 'ransomware'],
  'A.8.8': ['vulnerabilite technique', 'technical vulnerability', 'patch', 'mise a jour', 'scan', 'cve'],
  'A.8.9': ['configuration', 'hardening', 'durcissement', 'baseline', 'cis benchmark', 'stig'],
  'A.8.10': ['suppression', 'deletion', 'effacement donnees', 'data deletion', 'purge'],
  'A.8.11': ['masquage', 'data masking', 'anonymisation', 'pseudonymisation', 'obfuscation'],
  'A.8.12': ['fuite donnees', 'data leakage', 'dlp', 'prevention fuite', 'data loss'],
  'A.8.13': ['sauvegarde', 'backup', 'restauration', 'restore', 'recovery', 'plan sauvegarde'],
  'A.8.14': ['redondance', 'redundancy', 'haute disponibilite', 'high availability', 'cluster', 'failover'],
  'A.8.15': ['journalisation', 'logging', 'log', 'trace', 'audit trail', 'siem', 'surveillance'],
  'A.8.16': ['supervision', 'monitoring', 'surveillance reseau', 'network monitoring', 'soc', 'noc'],
  'A.8.17': ['synchronisation', 'clock synchronization', 'ntp', 'horloge', 'temps'],
  'A.8.18': ['utilitaire', 'utility program', 'outil privilegie', 'script administration'],
  'A.8.19': ['logiciel', 'software', 'installation', 'application', 'deploiement', 'packaging'],
  'A.8.20': ['reseau', 'network', 'securite reseau', 'network security', 'vlan', 'vpn', 'dmz'],
  'A.8.21': ['service web', 'web service', 'api', 'securite web', 'web security', 'waf'],
  'A.8.22': ['segmentation', 'network segmentation', 'isolation', 'micro-segmentation', 'zoning'],
  'A.8.23': ['filtrage web', 'web filtering', 'proxy', 'url filtering', 'navigation'],
  'A.8.24': ['cryptographie', 'cryptography', 'chiffrement', 'encryption', 'certificat', 'pki', 'tls', 'ssl'],
  'A.8.25': ['developpement securise', 'secure development', 'sdlc', 'code review', 'sast', 'dast'],
  'A.8.26': ['exigence securite', 'security requirement', 'specification', 'cahier charges securite'],
  'A.8.27': ['architecture', 'secure architecture', 'architecture securisee', 'design securite'],
  'A.8.28': ['codage securise', 'secure coding', 'owasp', 'injection', 'xss', 'csrf', 'code securise'],
  'A.8.29': ['test securite', 'security testing', 'pentest', 'test intrusion', 'audit technique'],
  'A.8.30': ['developpement externalise', 'outsourced development', 'prestataire dev', 'sous-traitance dev'],
  'A.8.31': ['separation environnement', 'environment separation', 'dev', 'staging', 'production', 'recette'],
  'A.8.32': ['changement', 'change management', 'gestion changement', 'cab', 'itil change'],
  'A.8.33': ['donnees test', 'test data', 'jeu donnees', 'anonymisation test', 'donnees recette'],
  'A.8.34': ['audit systeme', 'system audit', 'test audit', 'protection audit', 'integrite audit'],
};

interface AnalysisResult {
  controlCode: string;
  controlTitle: string;
  domain: string;
  relevanceScore: number; // 0-100
  matchedKeywords: string[];
  justification: string;
  conformityStatus: 'CONFORME' | 'PARTIELLEMENT_CONFORME' | 'A_EVALUER';
}

interface ComplianceGapResult {
  controlCode: string;
  controlTitle: string;
  domain: string;
  status: 'COUVERT' | 'PARTIELLEMENT_COUVERT' | 'NON_COUVERT';
  documentCount: number;
  documents: Array<{ id: string; reference: string; title: string }>;
}

@Injectable()
export class IsoAnalyzerService {
  private readonly logger = new Logger(IsoAnalyzerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Analyze document content and return matching ISO 27001 controls
   * with relevance scores and conformity justifications.
   */
  async analyzeDocument(documentId: string): Promise<AnalysisResult[]> {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: {
        versions: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    // Extract text from actual file content (PDF/DOCX) if available
    let fileText = '';
    const latestVersion = document.versions[0];
    if (latestVersion?.fileUrl) {
      fileText = await this.extractFileText(latestVersion.fileUrl, document.id);
    }

    // Build text corpus from metadata + file content
    const textCorpus = this.buildTextCorpus(
      document.title,
      document.description || '',
      document.category,
      document.reference,
      fileText,
    );

    // Get all ISO controls from database
    const allControls = await this.prisma.isoControl.findMany({
      orderBy: { code: 'asc' },
    });

    const results: AnalysisResult[] = [];

    for (const control of allControls) {
      const keywords = ISO_CONTROL_KEYWORDS[control.code] || [];
      if (keywords.length === 0) continue;

      const { score, matchedKeywords } = this.calculateRelevance(textCorpus, keywords);

      if (score > 15) {
        results.push({
          controlCode: control.code,
          controlTitle: control.title,
          domain: control.domain,
          relevanceScore: Math.min(score, 100),
          matchedKeywords,
          justification: this.generateJustification(
            document.title,
            control.code,
            control.title,
            matchedKeywords,
            score,
          ),
          conformityStatus: this.assessConformity(score, document.status),
        });
      }
    }

    // Sort by relevance score descending
    results.sort((a, b) => b.relevanceScore - a.relevanceScore);

    this.logger.log(
      `Analyzed document ${document.reference}: ${results.length} ISO controls matched`,
    );

    return results;
  }

  /**
   * Auto-assign ISO controls to a document based on analysis results.
   * Only assigns controls with relevance score >= threshold.
   */
  async autoAssignControls(
    documentId: string,
    threshold = 40,
  ): Promise<{ assigned: number; controls: string[] }> {
    const results = await this.analyzeDocument(documentId);
    const relevant = results.filter((r) => r.relevanceScore >= threshold);

    if (relevant.length === 0) {
      return { assigned: 0, controls: [] };
    }

    // Get control IDs
    const controlCodes = relevant.map((r) => r.controlCode);
    const controls = await this.prisma.isoControl.findMany({
      where: { code: { in: controlCodes } },
    });

    // Remove existing assignments
    await this.prisma.documentIsoControl.deleteMany({
      where: { documentId },
    });

    // Create new assignments
    await this.prisma.documentIsoControl.createMany({
      data: controls.map((c) => ({
        documentId,
        isoControlId: c.id,
      })),
      skipDuplicates: true,
    });

    this.logger.log(
      `Auto-assigned ${controls.length} ISO controls to document ${documentId}`,
    );

    return {
      assigned: controls.length,
      controls: controlCodes,
    };
  }

  /**
   * Generate a full compliance gap analysis across all ISO 27001 controls.
   * Shows which controls are covered by documents and which are not.
   */
  async generateComplianceGapAnalysis(): Promise<ComplianceGapResult[]> {
    const allControls = await this.prisma.isoControl.findMany({
      include: {
        documents: {
          include: {
            document: {
              select: {
                id: true,
                reference: true,
                title: true,
                status: true,
                deletedAt: true,
              },
            },
          },
        },
      },
      orderBy: { code: 'asc' },
    });

    return allControls.map((control) => {
      const activeDocuments = control.documents
        .filter((d) => !d.document.deletedAt && d.document.status === 'APPROVED')
        .map((d) => ({
          id: d.document.id,
          reference: d.document.reference,
          title: d.document.title,
        }));

      const allLinkedDocs = control.documents
        .filter((d) => !d.document.deletedAt)
        .map((d) => ({
          id: d.document.id,
          reference: d.document.reference,
          title: d.document.title,
        }));

      let status: 'COUVERT' | 'PARTIELLEMENT_COUVERT' | 'NON_COUVERT';
      if (activeDocuments.length > 0) {
        status = 'COUVERT';
      } else if (allLinkedDocs.length > 0) {
        status = 'PARTIELLEMENT_COUVERT';
      } else {
        status = 'NON_COUVERT';
      }

      return {
        controlCode: control.code,
        controlTitle: control.title,
        domain: control.domain,
        status,
        documentCount: activeDocuments.length,
        documents: allLinkedDocs,
      };
    });
  }

  /**
   * Generate compliance summary statistics.
   */
  async getComplianceSummary() {
    const gap = await this.generateComplianceGapAnalysis();

    const covered = gap.filter((g) => g.status === 'COUVERT').length;
    const partial = gap.filter((g) => g.status === 'PARTIELLEMENT_COUVERT').length;
    const uncovered = gap.filter((g) => g.status === 'NON_COUVERT').length;
    const total = gap.length;

    const byDomain = gap.reduce(
      (acc, g) => {
        const domain = g.domain;
        if (!acc[domain]) {
          acc[domain] = { total: 0, covered: 0, partial: 0, uncovered: 0 };
        }
        acc[domain].total++;
        if (g.status === 'COUVERT') acc[domain].covered++;
        else if (g.status === 'PARTIELLEMENT_COUVERT') acc[domain].partial++;
        else acc[domain].uncovered++;
        return acc;
      },
      {} as Record<string, { total: number; covered: number; partial: number; uncovered: number }>,
    );

    return {
      total,
      covered,
      partial,
      uncovered,
      coveragePercent: total > 0 ? Math.round((covered / total) * 100) : 0,
      byDomain,
      uncoveredControls: gap
        .filter((g) => g.status === 'NON_COUVERT')
        .map((g) => ({
          code: g.controlCode,
          title: g.controlTitle,
          domain: g.domain,
          suggestion: this.suggestDocumentForControl(g.controlCode, g.controlTitle, g.domain),
        })),
    };
  }

  // --- Private helpers ---

  /**
   * Suggest a document title and type that could cover an uncovered ISO control.
   */
  private suggestDocumentForControl(
    controlCode: string,
    controlTitle: string,
    domain: string,
  ): { recommendedTitle: string; documentType: string; priority: string } {
    // Map control domain prefixes to document types and suggested titles
    const domainSuggestions: Record<string, { type: string; prefix: string }> = {
      'A.5': { type: 'POLICY', prefix: 'Politique' },
      'A.6': { type: 'PROCEDURE', prefix: 'Procédure' },
      'A.7': { type: 'PROCEDURE', prefix: 'Procédure' },
      'A.8': { type: 'GUIDE', prefix: 'Guide technique' },
    };

    // More specific mappings for known control families
    const specificSuggestions: Record<string, { title: string; type: string }> = {
      'A.5.1': { title: 'Politique de sécurité de l\'information (PSSI)', type: 'POLICY' },
      'A.5.2': { title: 'Charte des rôles et responsabilités SSI', type: 'POLICY' },
      'A.5.9': { title: 'Inventaire des actifs informationnels', type: 'RECORD' },
      'A.5.12': { title: 'Politique de classification de l\'information', type: 'POLICY' },
      'A.5.15': { title: 'Politique de contrôle d\'accès', type: 'POLICY' },
      'A.5.17': { title: 'Politique d\'authentification et gestion des mots de passe', type: 'POLICY' },
      'A.5.19': { title: 'Politique de gestion des fournisseurs et prestataires', type: 'POLICY' },
      'A.5.23': { title: 'Politique de sécurité des services cloud', type: 'POLICY' },
      'A.5.24': { title: 'Procédure de gestion des incidents de sécurité', type: 'PROCEDURE' },
      'A.5.29': { title: 'Plan de continuité d\'activité (PCA)', type: 'PLAN' },
      'A.5.30': { title: 'Plan de reprise d\'activité (PRA)', type: 'PLAN' },
      'A.5.31': { title: 'Registre de conformité réglementaire', type: 'RECORD' },
      'A.5.34': { title: 'Politique de protection des données personnelles (RGPD)', type: 'POLICY' },
      'A.5.35': { title: 'Programme d\'audit interne SMSI', type: 'PLAN' },
      'A.6.1': { title: 'Procédure de vérification des antécédents au recrutement', type: 'PROCEDURE' },
      'A.6.3': { title: 'Programme de sensibilisation à la sécurité', type: 'PLAN' },
      'A.6.7': { title: 'Politique de télétravail et mobilité', type: 'POLICY' },
      'A.7.1': { title: 'Procédure de sécurité physique des locaux', type: 'PROCEDURE' },
      'A.7.14': { title: 'Procédure de mise au rebut sécurisée', type: 'PROCEDURE' },
      'A.8.1': { title: 'Guide de durcissement des postes de travail', type: 'GUIDE' },
      'A.8.7': { title: 'Politique de protection contre les logiciels malveillants', type: 'POLICY' },
      'A.8.8': { title: 'Procédure de gestion des vulnérabilités et correctifs', type: 'PROCEDURE' },
      'A.8.9': { title: 'Référentiel de configuration sécurisée (hardening)', type: 'GUIDE' },
      'A.8.13': { title: 'Politique de sauvegarde et restauration', type: 'PROCEDURE' },
      'A.8.15': { title: 'Politique de journalisation et surveillance', type: 'POLICY' },
      'A.8.20': { title: 'Politique de sécurité réseau', type: 'POLICY' },
      'A.8.24': { title: 'Politique de chiffrement et gestion des clés', type: 'POLICY' },
      'A.8.25': { title: 'Guide de développement sécurisé (SDLC)', type: 'GUIDE' },
    };

    // Check for specific suggestion first
    if (specificSuggestions[controlCode]) {
      const s = specificSuggestions[controlCode];
      return {
        recommendedTitle: s.title,
        documentType: s.type,
        priority: this.getControlPriority(controlCode),
      };
    }

    // Fall back to domain-based suggestion
    const domainPrefix = controlCode.substring(0, 3); // e.g. "A.5"
    const ds = domainSuggestions[domainPrefix] || { type: 'PROCEDURE', prefix: 'Document' };

    return {
      recommendedTitle: `${ds.prefix} — ${controlTitle}`,
      documentType: ds.type,
      priority: this.getControlPriority(controlCode),
    };
  }

  private getControlPriority(controlCode: string): string {
    // High priority controls (core ISMS requirements)
    const highPriority = [
      'A.5.1', 'A.5.2', 'A.5.9', 'A.5.12', 'A.5.15', 'A.5.17',
      'A.5.24', 'A.5.29', 'A.5.30', 'A.5.31', 'A.5.34', 'A.5.35',
      'A.8.7', 'A.8.8', 'A.8.13', 'A.8.15', 'A.8.24',
    ];
    if (highPriority.includes(controlCode)) return 'HAUTE';

    // Medium priority
    const mediumPriority = [
      'A.5.3', 'A.5.5', 'A.5.7', 'A.5.14', 'A.5.19', 'A.5.23',
      'A.6.1', 'A.6.3', 'A.6.7', 'A.7.1',
      'A.8.1', 'A.8.9', 'A.8.20', 'A.8.25',
    ];
    if (mediumPriority.includes(controlCode)) return 'MOYENNE';

    return 'NORMALE';
  }

  private buildTextCorpus(
    title: string,
    description: string,
    category: string,
    reference: string,
    fileText = '',
  ): string {
    // Weight title/description higher by repeating them
    return [title, title, description, description, category, reference, fileText]
      .join(' ')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  /**
   * Extract text content from a PDF or DOCX file.
   * Returns empty string on failure (graceful degradation).
   */
  private async extractFileText(fileUrl: string, documentId: string): Promise<string> {
    try {
      // Resolve the file path from storage
      const storageRoot = path.resolve(process.cwd(), '..', '..', 'storage');
      let filePath = '';

      if (fileUrl.startsWith('/') || fileUrl.startsWith('storage/')) {
        filePath = path.resolve(storageRoot, '..', fileUrl.replace(/^\//, ''));
      } else {
        // fileUrl is like "documents/{docId}/{versionId}.pdf"
        filePath = path.join(storageRoot, fileUrl);
      }

      if (!fs.existsSync(filePath)) {
        // Try direct path within storage/documents/{docId}/
        const altPath = path.join(storageRoot, 'documents', documentId);
        if (fs.existsSync(altPath)) {
          const files = fs.readdirSync(altPath);
          const targetFile = files.find(f => /\.(pdf|docx?)$/i.test(f));
          if (targetFile) filePath = path.join(altPath, targetFile);
        }
      }

      if (!fs.existsSync(filePath)) {
        this.logger.debug(`File not found for extraction: ${fileUrl}`);
        return '';
      }

      const ext = path.extname(filePath).toLowerCase();

      if (ext === '.pdf') {
        // Use pdftotext (poppler-utils) — fast and reliable
        const { execSync } = await import('child_process');
        try {
          const text = execSync(`pdftotext -enc UTF-8 "${filePath}" -`, {
            encoding: 'utf-8',
            timeout: 30000,
            maxBuffer: 10 * 1024 * 1024,
          });
          this.logger.debug(`Extracted ${text.length} chars from PDF (${documentId})`);
          return text.substring(0, 50000);
        } catch {
          this.logger.debug(`pdftotext failed for ${documentId}, trying fallback`);
          return '';
        }
      }

      if (ext === '.docx' || ext === '.doc') {
        const mammoth = await import('mammoth');
        const docBuffer = fs.readFileSync(filePath);
        const result = await mammoth.extractRawText({ buffer: docBuffer });
        const text = result.value || '';
        this.logger.debug(`Extracted ${text.length} chars from DOCX (${documentId})`);
        return text.substring(0, 50000);
      }

      return '';
    } catch (err) {
      this.logger.warn(`File text extraction failed for ${documentId}: ${err instanceof Error ? err.message : err}`);
      return '';
    }
  }

  private calculateRelevance(
    text: string,
    keywords: string[],
  ): { score: number; matchedKeywords: string[] } {
    const matchedKeywords: string[] = [];
    let score = 0;

    const normalizedText = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    for (const keyword of keywords) {
      const normalizedKw = keyword.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (normalizedText.includes(normalizedKw)) {
        matchedKeywords.push(keyword);
        // Longer keyword matches = higher score
        score += 15 + Math.min(normalizedKw.length * 2, 20);
      }
    }

    return { score, matchedKeywords };
  }

  private generateJustification(
    docTitle: string,
    controlCode: string,
    controlTitle: string,
    matchedKeywords: string[],
    score: number,
  ): string {
    const kwList = matchedKeywords.slice(0, 5).join(', ');

    if (score >= 70) {
      return `Le document "${docTitle}" adresse directement le contrôle ${controlCode} (${controlTitle}). ` +
        `Mots-clés identifiés : ${kwList}. ` +
        `Ce document constitue une preuve substantielle de la mise en œuvre de ce contrôle.`;
    } else if (score >= 40) {
      return `Le document "${docTitle}" couvre partiellement le contrôle ${controlCode} (${controlTitle}). ` +
        `Éléments pertinents identifiés : ${kwList}. ` +
        `Il est recommandé de vérifier que tous les aspects du contrôle sont adressés.`;
    } else {
      return `Le document "${docTitle}" contient des éléments liés au contrôle ${controlCode} (${controlTitle}). ` +
        `Références détectées : ${kwList}. ` +
        `Une évaluation manuelle est recommandée pour confirmer la couverture.`;
    }
  }

  private assessConformity(
    score: number,
    documentStatus: string,
  ): 'CONFORME' | 'PARTIELLEMENT_CONFORME' | 'A_EVALUER' {
    if (documentStatus !== 'APPROVED') {
      return 'A_EVALUER';
    }
    if (score >= 60) {
      return 'CONFORME';
    }
    if (score >= 30) {
      return 'PARTIELLEMENT_CONFORME';
    }
    return 'A_EVALUER';
  }

  /**
   * Scan ALL approved documents and auto-assign ISO controls.
   * This is the "full rescan" that recalculates compliance from scratch.
   */
  async scanAllDocuments(threshold = 35): Promise<{
    scanned: number;
    assigned: number;
    errors: number;
    details: Array<{ reference: string; controls: number; status: string }>;
  }> {
    const documents = await this.prisma.document.findMany({
      where: { deletedAt: null, status: { in: ['APPROVED', 'IN_REVIEW', 'PENDING_APPROVAL'] } },
      select: { id: true, reference: true, title: true, status: true },
    });

    let assigned = 0;
    let errors = 0;
    const details: Array<{ reference: string; controls: number; status: string }> = [];

    // Process in batches of 5 for better performance
    const batchSize = 5;
    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(doc => this.autoAssignControls(doc.id, threshold)),
      );

      results.forEach((result, idx) => {
        const doc = batch[idx]!;
        if (result.status === 'fulfilled') {
          assigned += result.value.assigned;
          details.push({ reference: doc.reference, controls: result.value.assigned, status: 'ok' });
        } else {
          errors++;
          details.push({ reference: doc.reference, controls: 0, status: 'error' });
          this.logger.warn(`Scan failed for ${doc.reference}: ${result.reason}`);
        }
      });
    }

    this.logger.log(`Full ISO scan: ${documents.length} documents, ${assigned} controls assigned, ${errors} errors`);
    return { scanned: documents.length, assigned, errors, details };
  }

  /**
   * Auto-classify a document based on its content (ISO 27001 A.5.12)
   * Suggests: classification level, category, and tags
   */
  suggestClassification(title: string, description: string): {
    classification: string;
    category: string;
    tags: string[];
  } {
    const text = (title + ' ' + description).toLowerCase();

    // Classification suggestion
    let classification = 'INTERNE';
    const secretKeywords = ['secret', 'defense', 'restreint', 'classifie', 'cryptographi', 'cle priv'];
    const confidentielKeywords = ['confidentiel', 'personnel', 'salaire', 'medical', 'disciplin', 'rgpd', 'donnees personnelles', 'mot de passe', 'credential'];
    const publicKeywords = ['public', 'communication externe', 'plaquette', 'site web'];

    if (secretKeywords.some(k => text.includes(k))) classification = 'SECRET';
    else if (confidentielKeywords.some(k => text.includes(k))) classification = 'CONFIDENTIEL';
    else if (publicKeywords.some(k => text.includes(k))) classification = 'PUBLIC';

    // Category suggestion
    let category = 'OTHER';
    if (text.includes('politique') || text.includes('policy')) category = 'POLICY';
    else if (text.includes('procedure') || text.includes('processus') || text.includes('mode operatoire')) category = 'PROCEDURE';
    else if (text.includes('plan ') || text.includes('pca') || text.includes('pra')) category = 'PLAN';
    else if (text.includes('registre') || text.includes('inventaire') || text.includes('enregistrement')) category = 'RECORD';
    else if (text.includes('formulaire') || text.includes('template') || text.includes('modele')) category = 'FORM';
    else if (text.includes('guide') || text.includes('tutoriel') || text.includes('bonnes pratiques')) category = 'GUIDE';
    else if (text.includes('rapport') || text.includes('audit') || text.includes('revue')) category = 'REPORT';
    else if (text.includes('contrat') || text.includes('convention') || text.includes('sla')) category = 'CONTRACT';

    // Tags
    const tags: string[] = [];
    const tagKeywords: Record<string, string> = {
      'securite': 'Sécurité', 'iso 27001': 'ISO 27001', 'rgpd': 'RGPD', 'smsi': 'SMSI',
      'reseau': 'Réseau', 'systeme': 'Système', 'sauvegarde': 'Sauvegarde', 'incident': 'Incident',
      'acces': 'Accès', 'authentification': 'Authentification', 'chiffrement': 'Chiffrement',
      'audit': 'Audit', 'continuite': 'Continuité', 'formation': 'Formation',
    };
    for (const [kw, tag] of Object.entries(tagKeywords)) {
      if (text.includes(kw)) tags.push(tag);
    }

    return { classification, category, tags: tags.slice(0, 5) };
  }
}
