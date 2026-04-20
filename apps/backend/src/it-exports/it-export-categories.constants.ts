/**
 * IT / Compliance export categories.
 *
 * Predefined folders where the RSSI deposits IT evidence used for
 * ISO 27001:2022 audits (AD audit reports, firewall configs, backup
 * reports, vulnerability scans, pentest results, etc.).
 *
 * The `iso` field references the Annex A controls covered by each
 * category. Keep this list in sync with the frontend page.
 */
export interface ItExportCategory {
  code: string;
  label: string;
  description: string;
  iso: string;
}

export const IT_EXPORT_CATEGORIES: ItExportCategory[] = [
  {
    code: 'AD_AUDIT',
    label: 'Audit Active Directory',
    description:
      "Exports périodiques de l'audit AD (utilisateurs, groupes, OUs, GPOs)",
    iso: 'A.5.18, A.8.2',
  },
  {
    code: 'FORTIGATE_CONFIG',
    label: 'Configuration Fortigate',
    description: 'Sauvegarde de configuration Fortigate (firewall + VPN)',
    iso: 'A.8.20, A.8.21',
  },
  {
    code: 'FORTIMANAGER_CONFIG',
    label: 'Configuration Fortimanager',
    description:
      'Sauvegarde de Fortimanager (gestion centralisée Fortinet)',
    iso: 'A.8.20',
  },
  {
    code: 'SWITCH_CONFIG',
    label: 'Configuration Switches',
    description: 'Configurations switches (HP, Cisco, Aruba, etc.)',
    iso: 'A.8.20, A.8.21',
  },
  {
    code: 'VEEAM_BACKUP',
    label: 'Veeam Backup & Replication',
    description: 'Rapports de sauvegarde Veeam (mensuels)',
    iso: 'A.8.13, A.5.30',
  },
  {
    code: 'VEEAM_REPORT',
    label: 'Rapports Veeam (jobs, restores)',
    description: 'État des jobs de sauvegarde et tests de restauration',
    iso: 'A.8.13',
  },
  {
    code: 'VULN_SCAN',
    label: 'Scans de vulnérabilités',
    description: 'Rapports Nessus, OpenVAS, Qualys, etc.',
    iso: 'A.8.8',
  },
  {
    code: 'PEN_TEST',
    label: "Tests d'intrusion (pentest)",
    description: 'Rapports de pentest internes/externes',
    iso: 'A.8.29',
  },
  {
    code: 'CONFIG_BASELINE',
    label: 'Baselines de configuration',
    description: 'Référentiels de configuration sécurisée',
    iso: 'A.8.9',
  },
  {
    code: 'PATCH_REPORT',
    label: 'Rapports de patching',
    description: 'Suivi des correctifs appliqués (Windows Update, WSUS, etc.)',
    iso: 'A.8.8',
  },
  {
    code: 'ANTIVIRUS_REPORT',
    label: 'Rapports antivirus / EDR',
    description: 'Synthèses ESET, CrowdStrike, SentinelOne, etc.',
    iso: 'A.8.7',
  },
  {
    code: 'DLP_REPORT',
    label: 'Rapports DLP',
    description: 'Data Loss Prevention',
    iso: 'A.8.12',
  },
  {
    code: 'FIREWALL_LOGS',
    label: 'Logs Firewall archivés',
    description: 'Archives mensuelles de logs firewall',
    iso: 'A.8.15, A.8.16',
  },
  {
    code: 'SIEM_ALERTS',
    label: 'Alertes SIEM',
    description: "Exports d'alertes du SIEM",
    iso: 'A.8.16',
  },
  {
    code: 'BCP_TEST',
    label: 'Tests de PCA/PRA',
    description: "Procès-verbaux de tests de continuité d'activité",
    iso: 'A.5.30',
  },
  {
    code: 'OTHER',
    label: 'Autres exports',
    description: 'Catégorie générale',
    iso: '',
  },
];

export const IT_EXPORT_CATEGORY_CODES = IT_EXPORT_CATEGORIES.map((c) => c.code);

export function isItExportCategory(code: string): boolean {
  return IT_EXPORT_CATEGORY_CODES.includes(code);
}

/**
 * Whitelist of allowed file extensions for IT evidence uploads.
 * Checked against the lowercased extension of the original filename.
 */
export const ALLOWED_IT_EXPORT_EXTENSIONS = [
  'pdf',
  'csv',
  'xlsx',
  'json',
  'xml',
  'zip',
  'txt',
  'log',
  'conf',
  'cfg',
  'bak',
];
