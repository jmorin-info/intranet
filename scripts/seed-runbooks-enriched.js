/**
 * Enrichissement des runbooks existants + ajout de 4 nouveaux runbooks utiles.
 *
 * Idempotent : upsert par slug. Preserve authorId existant si déjà présent.
 *
 * Usage : node scripts/seed-runbooks-enriched.js
 */
const { PrismaClient } = require('/root/omnitech-intranet/packages/database/node_modules/@prisma/client');
const p = new PrismaClient();

const AUTHOR_EMAIL = 'jmorin@omnitech-security.fr';

const runbooks = [
  {
    slug: 'creation-compte-ad',
    title: 'Création compte utilisateur Active Directory',
    description: 'Procédure complète de provisionnement d\'un nouveau collaborateur (AD + mailbox + poste + onboarding).',
    category: 'Active Directory',
    version: '2.0',
    steps: [
      { title: 'Vérifier la demande', description: 'Formulaire FRM-IT-001 signé par le manager ET les RH. Contrôler : date d\'arrivée, service, intitulé de poste, type de contrat (CDI/CDD/alternance/stagiaire/prestataire). Rejeter toute demande incomplète.' },
      { title: 'Vérifier la politique de sécurité', description: 'Si accès sensibles demandés (DIRECTION, RSSI, compta-finance) : exiger l\'attestation DPO + habilitation RSSI. Pour prestataires : passer par le portail externe (runbook onboarding-prestataire).' },
      { title: 'Choisir le login', description: 'Convention : première lettre du prénom + nom (ex: jmorin). Si collision : ajouter la seconde lettre du prénom (ex: jumorin), puis la première du second prénom. Vérifier unicité : `Get-ADUser -Filter "SamAccountName -eq \'jmorin\'"`.' },
      { title: 'Créer le compte AD', description: 'ADUC > OU = \\OMNITECH\\Users\\<Service>. PowerShell : `New-ADUser -Name "Julien Morin" -SamAccountName jmorin -UserPrincipalName jmorin@omnitech-security.fr -Path "OU=IT,OU=Users,DC=omnitech,DC=local" -AccountPassword (Read-Host -AsSecureString) -Enabled $true -ChangePasswordAtLogon $true`.' },
      { title: 'Configurer les groupes', description: 'Groupes obligatoires : GG_Collaborateurs + GG_VPN_Users. Groupes métier selon service : GG_IT_Admins, GG_Compta, GG_Direction, GG_RSSI, etc. Ne JAMAIS ajouter à Domain Admins sans validation RSSI.' },
      { title: 'Créer la boîte mail Exchange', description: 'EAC > Recipients > Mailboxes > Add > Existing user. Adresse : prenom.nom@omnitech-security.fr + alias jmorin@omnitech-security.fr. Quota 10 Go (30 Go pour DIRECTION). Activer archivage en ligne si CDI.' },
      { title: 'Configurer les licences Microsoft 365', description: 'Admin center > Users > Assign licenses. Template selon service : BASE (Business Basic) / STANDARD (Business Standard) / PREMIUM (Business Premium pour DIRECTION/RSSI). Prévoir 15 min de propagation avant la première connexion.' },
      { title: 'Préparer le poste de travail', description: 'Déclencher runbook deploiement-poste-mdt avec : modèle (standard/développeur/direction), lieu (siège/agence/télétravail), date de livraison. Le poste doit être prêt J-1 minimum.' },
      { title: 'Créer le compte intranet', description: 'L\'intranet sync LDAP toutes les 30 min (runbook sync-ldap-ad-intranet). Forcer sync manuelle : `POST /api/v1/admin/ldap/sync`. Vérifier login intranet : le rôle doit être COLLABORATEUR par défaut.' },
      { title: 'Remettre les identifiants', description: 'Canal sécurisé obligatoire : enveloppe scellée en main propre OU password manager entreprise (Bitwarden) avec partage temporaire 24h. JAMAIS par mail/SMS/Teams. Le mot de passe initial doit être changé à la première connexion (forcé par ChangePasswordAtLogon).' },
      { title: 'Accueil J+1', description: 'Accompagner l\'utilisateur à sa première connexion. Vérifier : accès poste, accès mail, accès intranet (runbooks accessibles), accès VPN (si télétravail). Présenter le portail helpdesk (ticketing) et la charte SI.' },
      { title: 'Documenter', description: 'Mettre à jour le registre utilisateurs (REG-007). Créer le ticket d\'onboarding (template "Onboarding collaborateur"). Archiver le formulaire FRM-IT-001 signé dans GED > RH > Onboardings.' },
      { title: 'Revue RSSI J+30', description: 'Le RSSI passe en revue tous les nouveaux comptes à J+30 (campagne access review automatique). Aucune action IT nécessaire sauf si le RSSI rejette un accès (révocation immédiate).' },
    ],
  },
  {
    slug: 'deploiement-poste-mdt',
    title: 'Déploiement poste de travail via MDT',
    description: 'Provisionnement d\'un poste Windows 11 Pro via Microsoft Deployment Toolkit + post-install.',
    category: 'Poste de travail',
    version: '2.0',
    steps: [
      { title: 'Préparer le matériel', description: 'Sortir le poste du stock (scanner code-barres dans GLPI). Vérifier modèle selon profil : Dell Latitude 5440 (standard), Dell Precision 5680 (développeur), Dell XPS 15 (direction). Photographier le numéro de série + étiquette.' },
      { title: 'Vérifier l\'image MDT', description: 'Image de référence : Windows 11 Pro 23H2 + patches du mois M-1. Console : \\\\mdt-srv\\DeploymentShare$. Vérifier la dernière build sur l\'écran de démarrage WinPE (doit correspondre au bulletin interne).' },
      { title: 'Démarrer en PXE', description: 'Brancher RJ45 sur VLAN déploiement (VLAN 42). Démarrer + F12 > Network boot. WinPE doit se charger en < 60s. Si échec : vérifier DHCP reservation + firewall switch (port 69 TFTP).' },
      { title: 'Sélectionner la task sequence', description: 'Choisir selon profil : TS-001 (Standard), TS-002 (Dev - ajoute Docker/VS/Git), TS-003 (Direction - ajoute lecteur biométrique), TS-004 (Agence - ajoute VPN auto-connect). Saisir : nom machine (LAP-<service>-<nnn>), OU cible.' },
      { title: 'Suivre le déploiement', description: 'Durée : 35-45 min en filaire 1Gbps. Phases : Format → OS → Apps → Updates → Joindre domaine → Reboot. Ne JAMAIS interrompre pendant "Applying image" (risque corruption).' },
      { title: 'Activer BitLocker', description: 'Post-MDT : BitLocker auto via GPO. Vérifier : `manage-bde -status C:`. La clé de récupération remonte automatiquement en AD (onglet BitLocker sur le Computer object). Si absent : escalader immédiatement (audit ISO 27001).' },
      { title: 'Tester la connexion domaine', description: 'Login avec le compte utilisateur (pas admin local). Vérifier : profil user créé, GPO appliquées (`gpresult /r`), lecteurs réseau mappés (H:\\ perso, P:\\ public), imprimantes déployées.' },
      { title: 'Installer les apps métier', description: 'Apps non gérées par MDT : Sage (finance), Cegid (RH), logiciels de labo (équipes tech). Utiliser le portail Company Portal (Intune) qui pousse selon les groupes AD de l\'utilisateur.' },
      { title: 'Configurer Outlook + OneDrive', description: 'Premier login = auto-discover Exchange (5-10 min). OneDrive : démarrage auto avec login SSO. Activer Known Folder Move (Desktop/Documents/Pictures synchronisés cloud) via GPO.' },
      { title: 'Tester la sauvegarde', description: 'Vérifier que Veeam Agent est installé + actif : `C:\\Program Files\\Veeam\\Endpoint Backup\\Veeam.EndPoint.Manager.exe`. Le premier backup doit se lancer dans les 24h (full seed vers NAS Veeam).' },
      { title: 'Inventaire GLPI', description: 'L\'agent GLPI remonte les infos dans l\'heure. Vérifier dans GLPI > Assets > Computers : numéro de série, RAM, CPU, disque, OS, utilisateur assigné. Mettre à jour le champ "Emplacement".' },
      { title: 'Sticker + livraison', description: 'Coller sticker inventaire (QR code GLPI) + sticker "Propriété OMNITECH - 01 XX XX XX XX" + sticker BitLocker activé (bleu). Livraison : main propre au siège, transport sécurisé pour les agences (pochette plombée).' },
    ],
  },
  {
    slug: 'gestion-incident-securite',
    title: 'Gestion d\'un incident de sécurité (NIST IR)',
    description: 'Playbook réponse à incident basé sur NIST SP 800-61r2 : Preparation → Detection → Containment → Eradication → Recovery → Lessons learned.',
    category: 'Sécurité',
    version: '2.0',
    steps: [
      { title: '🚨 Alerter', description: 'Alerte reçue (SOC, utilisateur, SIEM) → contacter RSSI + CTO dans les 15 minutes. Téléphone uniquement si compromission mail suspectée. Ne JAMAIS discuter l\'incident sur des canaux potentiellement compromis.' },
      { title: 'Ouvrir le ticket incident', description: 'Espace ticketing "Sécurité" > Priorité CRITICAL. Titre : INC-<date>-<type> (ex: INC-20260420-PHISHING). Ne mentionner AUCUNE donnée sensible dans le titre. Assigner au RSSI.' },
      { title: 'Preparation - rassembler l\'équipe', description: 'Convoquer cellule de crise : RSSI (lead), CTO, DPO, Juridique, Communication (si impact externe). Lieu : salle de crise (4e étage) OU visio chiffrée bout-en-bout (Signal, pas Teams si compromission suspectée).' },
      { title: 'Detection - qualifier l\'incident', description: 'Classer selon ENISA : 1-Malware, 2-Phishing, 3-Ransomware, 4-DDoS, 5-Intrusion, 6-Data breach, 7-Insider. Évaluer CVSS + impact RGPD. Si données perso touchées → DPO déclenche procédure notification CNIL J+72h.' },
      { title: 'Containment - court terme', description: 'Isoler les machines compromises : débrancher câble réseau (ne PAS éteindre, perte d\'artefacts mémoire). Bloquer comptes suspects (désactiver en AD, pas supprimer). Bloquer IP/domaine malveillants au firewall + proxy.' },
      { title: 'Containment - long terme', description: 'Changer mots de passe admin (domain admin, root, service accounts). Révoquer tokens API / refresh tokens (Microsoft 365 : Revoke-SessionsForUser). Isoler segment réseau si propagation suspectée (VLAN quarantine).' },
      { title: 'Collecte de preuves', description: 'Avant toute modification : snapshot VM, dump mémoire (`winpmem`), copie disque (dd / FTK Imager), logs AD, logs VPN, logs proxy, logs mail. Hasher tous les artefacts (SHA-256) et stocker sur bastion RSSI avec chain of custody.' },
      { title: 'Eradication', description: 'Supprimer malware (EDR + scan complet). Patcher vulnérabilité exploitée (CVE). Nettoyer comptes créés par l\'attaquant. Vérifier tâches planifiées, services, clés registre (persistence). Re-vérifier avec EDR sur second passage.' },
      { title: 'Recovery', description: 'Restaurer services depuis backup PROPRE (antérieur à la compromission). Monitoring renforcé pendant 30 jours (alertes abaissées sur comptes/serveurs touchés). Réactivation comptes utilisateurs : forcer MFA + changement password.' },
      { title: 'Notification CNIL (si RGPD)', description: 'Si données personnelles impactées : le DPO notifie la CNIL sous 72h via le téléservice CNIL. Documenter : nature violation, catégories/volume données, conséquences probables, mesures prises. Conserver registre violations (Article 33.5 RGPD).' },
      { title: 'Communication interne', description: 'Après containment : communication sobre aux collaborateurs concernés (template COM-SEC-001). Ne communiquer que les faits établis. La DirCom gère toute communication externe (presse, partenaires, clients).' },
      { title: 'Post-mortem', description: 'Réunion post-mortem sous 15 jours. Format : timeline, root cause, detection gap, remediation. Sans blâme (blameless). Produire rapport RSSI (template RPT-SEC-POSTM-001) transmis CTO + DIRECTION.' },
      { title: 'Lessons learned', description: 'Mettre à jour : ce runbook, SIEM rules, EDR policy, sensibilisation utilisateurs. Créer ticket amélioration pour chaque gap identifié. Répéter l\'exercice en table-top exercise trimestriel.' },
    ],
  },
  {
    slug: 'restauration-vm-veeam',
    title: 'Restauration VM depuis Veeam Backup & Replication',
    description: 'Procédure restore VM (Instant Recovery, Full Restore, File-level, Application-aware).',
    category: 'Infrastructure',
    version: '2.0',
    steps: [
      { title: 'Recueillir la demande', description: 'Ticket obligatoire : nom VM, date/heure du point de restauration souhaité, mode (remplacer la VM actuelle / restaurer ailleurs / file-level). Exiger validation manager + notification utilisateurs impactés.' },
      { title: 'Vérifier les backups disponibles', description: 'Console Veeam > Home > Backups > Disk. Retrouver la VM. Points de restauration standard : J-1 à J-7 en daily, M-1/M-2/M-3 en monthly. Si absent : vérifier Archive Tier (Wasabi S3) = plus long.' },
      { title: 'Vérifier l\'intégrité du backup', description: 'SureBackup Job sur le restore point sélectionné (si pas lancé la nuit dernière). Vérifier : boot OK, ping OK, application-aware OK. Sans SureBackup validée : restaurer vers un réseau isolé d\'abord.' },
      { title: 'Choisir le mode de restauration', description: 'Instant Recovery : redémarre la VM depuis le repository (rapide, 2 min, utilisé pour RTO critique). Full Restore : copie intégrale vers datastore (30-120 min selon taille). File-level : extrait des fichiers sans démarrer la VM.' },
      { title: 'Préparer l\'environnement cible', description: 'Si restore sur même VM : snapshot préalable de l\'état actuel (au cas où). Si nouvelle VM : préparer nom unique (suffix -RESTORE-<date>), VLAN isolé par défaut, datastore avec espace suffisant (>= 120% taille VM).' },
      { title: 'Lancer le restore', description: 'Right-click restore point > Restore > [mode choisi]. Décocher "Power on VM after restoring" par défaut (on démarre après vérif réseau). Saisir raison du restore dans "Reason" (audit trail).' },
      { title: 'Surveiller la tâche', description: 'Console Veeam > History > Restore. Vérifier throughput (>= 200 MB/s en LAN). Si < 50 MB/s : vérifier proxy Veeam saturé, datastore SAN contention, ou backup depuis Archive Tier.' },
      { title: 'Vérifier la VM restaurée', description: 'Avant démarrage : vérifier les settings (RAM, CPU, disques, NICs). Démarrer en VLAN isolé d\'abord. Vérifier : boot OK, services critiques (SQL, IIS, app), logs Windows (Event Viewer), intégrité data (checksum fichiers clés).' },
      { title: 'Basculer la production', description: 'Si restore vers nouvelle VM : éteindre l\'ancienne, reconfigurer IP de la nouvelle, raccorder au bon VLAN prod, mettre à jour DNS. Tester les flux applicatifs critiques avant d\'annoncer "service restauré".' },
      { title: 'Monitoring post-restore', description: 'Monitoring renforcé H+4 après restore (alertes abaissées). Vérifier les jobs de backup suivants : la nouvelle VM doit être backupée dès la prochaine fenêtre. Vérifier réplication vDR si applicable.' },
      { title: 'Documenter + clôturer', description: 'Dans le ticket : durée restore, volume restauré, root cause du besoin (hardware, suppression accidentelle, corruption, incident), enseignements. Clôturer. Si root cause = incident sécu : déclencher runbook gestion-incident-securite.' },
    ],
  },
  {
    slug: 'revue-firewall-trimestrielle',
    title: 'Revue trimestrielle des règles firewall',
    description: 'Audit des règles firewall pour détecter stale rules, shadow rules, non-conformités ISO 27001.',
    category: 'Réseau',
    version: '2.0',
    steps: [
      { title: 'Planifier la revue', description: 'Revue obligatoire tous les trimestres (calendrier RSSI : T1 mars, T2 juin, T3 septembre, T4 décembre). Convoquer : IT infra (lead), RSSI, responsable réseau. Durée estimée : 4h sur 2 jours.' },
      { title: 'Exporter les règles', description: 'Checkpoint : SmartConsole > Manage Policy > Publish + Install. Puis export CSV via R81 : `$FWDIR/scripts/cpdb2export.sh`. Fortinet : `execute backup config tftp fw-rules-T<n>-2026.conf <server>`. Hasher l\'export (SHA-256).' },
      { title: 'Analyser les règles stale', description: 'Activer "hit counter" sur chaque règle. Règles sans hit depuis > 90 jours = candidates à suppression. Utiliser Tufin SecureTrack ou Algosec si disponible (sinon script maison `fw-stale-rules.py` sur le bastion).' },
      { title: 'Détecter les shadow rules', description: 'Shadow rule = règle jamais atteinte car couverte par une règle au-dessus. Tufin > Unreachable rules. Alternative : analyser manuellement les top 10 règles par hit count et leurs parents.' },
      { title: 'Vérifier les règles Any-Any', description: 'Interdit : Source=Any Destination=Any Service=Any. Exception : règle Cleanup finale (DROP All log). Si Any-Any ALLOW détecté : alerte RSSI immédiate + remediation J+7 maximum.' },
      { title: 'Vérifier les règles temporaires', description: 'Règles taggées [TEMP] ou [INCIDENT-<date>] : doivent avoir date d\'expiration. Si expiration dépassée : supprimer. Si encore active après 30 jours : demander régularisation + passage en règle permanente documentée.' },
      { title: 'Vérifier la conformité ISO 27001', description: 'Chaque règle doit avoir : owner, ticket de création, justification business, classification flux (interne/externe/DMZ), review date. Utiliser le template REG-FW-001. Lignes non-conformes = plan d\'action.' },
      { title: 'Générer le rapport', description: 'Template RPT-FW-REVIEW-T<n>-2026.docx : nombre total règles, stale, shadow, non-conformes, actions proposées. Annexes : diff vs T-1, CVE firewalls non patchés, évolution trafic bloqué/autorisé.' },
      { title: 'Approbation RSSI', description: 'Rapport envoyé au RSSI pour revue + signature électronique (DocuSeal). Le RSSI valide les suppressions/modifications avant exécution. Toute modif doit avoir un ticket change associé.' },
      { title: 'Exécuter les modifications', description: 'Fenêtre de maintenance : dimanche 21h-23h. Backup config avant, modif, test flux critiques, validation 1h, commit. En cas de problème : rollback config N-1 en < 5 min. Communication utilisateurs J-2.' },
      { title: 'Archivage + audit trail', description: 'Archiver le rapport signé dans GED > RSSI > Audits FW. Mettre à jour le registre conformité ISO 27001 (A.13.1.1). Le rapport doit être présenté au Comité Sécurité suivant.' },
    ],
  },
  {
    slug: 'sauvegarde-test-restauration',
    title: 'Test de restauration (Disaster Recovery drill)',
    description: 'Test trimestriel de restauration complet pour valider les RPO/RTO et la capacité de reprise.',
    category: 'Infrastructure',
    version: '2.0',
    steps: [
      { title: 'Planifier le drill', description: 'DR drill obligatoire tous les trimestres. Prévenir DIRECTION + équipes métier J-15. Choisir un scénario : perte datacenter principal, ransomware, corruption SAN, perte équipe IT. Tourner les scénarios à chaque drill.' },
      { title: 'Définir les objectifs', description: 'RPO cible : 1h (backup horaire des VMs prod critiques). RTO cible : 4h (restore complet + bascule). Mesurer : temps détection, temps décision, temps restore, temps validation fonctionnelle.' },
      { title: 'Préparer l\'environnement DR', description: 'Site DR : datacenter secondaire (bureau Lyon) + cloud Wasabi (archive). Vérifier : réplication Veeam active, dernière vérif SureBackup OK, connectivité MPLS site DR, DNS switchable.' },
      { title: 'Annoncer le début du drill', description: 'Canal dédié Teams "#dr-drill-T<n>". Tous les événements horodatés par un scribe. Les équipes ne doivent PAS exécuter les vraies alertes sur leurs outils de monitoring (drill, pas incident réel).' },
      { title: 'Déclencher le scénario', description: 'Exemple scénario ransomware : simuler chiffrement d\'un share + détection EDR. Ou scénario perte site : couper (virtuellement) la connectivité site principal. Chronométrer dès la détection.' },
      { title: 'Exécuter les procédures', description: 'L\'équipe IT suit les runbooks EXISTANTS sans aide extérieure. Noter chaque friction : étape ambiguë, outil manquant, permission bloquante. Ne PAS improviser : si le runbook est cassé, c\'est ce qu\'on veut détecter.' },
      { title: 'Restaurer les services critiques', description: 'Ordre de restauration prioritaire : 1) AD + DNS 2) Exchange 3) ERP/compta 4) Fileservers 5) Applications métier. Chaque service doit être fonctionnellement validé par l\'équipe métier avant de passer au suivant.' },
      { title: 'Test applicatif', description: 'Utilisateurs pilotes testent les applications restaurées : login, lecture/écriture, intégrité données, fonctionnalités critiques. Checklist par application (template TEST-DR-<app>.md).' },
      { title: 'Revenir à la production normale', description: 'Si drill full-switchover : basculer DNS vers DR, puis back to prod après validation. Si drill restore-only : détruire les VMs restaurées (après dump logs). Vérifier que la production n\'a PAS été impactée.' },
      { title: 'Post-mortem drill', description: 'J+1 : réunion post-mortem. Mesurer : RPO réel, RTO réel, gaps identifiés. Créer un ticket amélioration pour chaque gap. Publier rapport DR (template RPT-DR-T<n>-2026) au RSSI + DIRECTION.' },
      { title: 'Mettre à jour les runbooks', description: 'Les runbooks utilisés pendant le drill sont mis à jour avec les améliorations identifiées. Republier + communiquer aux équipes. Un drill qui n\'améliore AUCUN runbook est un drill mal exploité.' },
    ],
  },

  // === NOUVEAUX RUNBOOKS ===

  {
    slug: 'renouvellement-certificat-nps',
    title: 'Renouvellement certificat serveur NPS (RADIUS Wi-Fi)',
    description: 'Procédure de renouvellement du certificat NPS utilisé pour l\'authentification EAP-TLS Wi-Fi entreprise. À faire avant expiration sous peine de coupure Wi-Fi totale.',
    category: 'Sécurité',
    version: '1.0',
    steps: [
      { title: 'Monitorer l\'expiration', description: 'Alerte J-60 avant expiration (Zabbix sur le certstore NPS). Ne JAMAIS laisser expirer : coupure Wi-Fi totale + déblocage uniquement en filaire pour tous les postes. Durée de renouvellement : 2-4h avec tests.' },
      { title: 'Planifier l\'opération', description: 'Fenêtre de maintenance nocturne (21h-1h) ou week-end. Communication utilisateurs J-7. Prévoir assistance filaire en standby le lendemain (taux de reconnexion ~80% auto, 20% manuel).' },
      { title: 'Vérifier la CA interne', description: 'La CA OMNITECH (ADCS) émet les certificats NPS. Vérifier : CA elle-même pas expirée (cycle de vie 10 ans, renouvellement cycle planifié séparé), CRL accessible, template "RAS and IAS Server" disponible.' },
      { title: 'Demander le nouveau certificat', description: 'Sur le serveur NPS : MMC > Certificates (Computer) > Personal > Request New Certificate > "RAS and IAS Server". Subject : nps-01.omnitech.local. SAN : nps-01 + nps-01.omnitech.local. Clé RSA 2048 min, SHA-256.' },
      { title: 'Configurer NPS pour utiliser le nouveau cert', description: 'NPS console > Policies > Network Policies > <policy Wi-Fi> > Edit > Constraints > Authentication Methods > Edit EAP Types > Microsoft: Smart Card or other certificate > Edit > sélectionner le NOUVEAU certificat.' },
      { title: 'Redémarrer le service NPS', description: '`Restart-Service IAS`. Vérifier dans Event Viewer > Custom Views > Server Roles > Network Policy and Access Services : pas d\'erreur au démarrage. Event 4400 = config policy loaded OK.' },
      { title: 'Test connexion Wi-Fi', description: 'Test avec un poste pilote déjà connecté (devrait se reconnecter automatiquement). Puis test avec un poste fraîchement reboot. Si KO : vérifier que le poste a bien la nouvelle racine CA installée (GPO auto-enrollment).' },
      { title: 'Déployer sur les NPS secondaires', description: 'Architecture redondée : NPS-01 (siège) + NPS-02 (Lyon). Répéter les étapes 4-7 sur NPS-02 APRÈS validation NPS-01. Ne JAMAIS renouveler les deux en simultané.' },
      { title: 'Vérifier les APs', description: 'Sur le contrôleur Wi-Fi (Meraki/Aruba) : vérifier que les 2 NPS sont UP + handshake OK. Monitorer les logs de rejet RADIUS pendant 2h : le taux doit être < 1%.' },
      { title: 'Revoke ancien certificat', description: 'Après 48h de fonctionnement stable : révoquer l\'ancien certificat NPS sur ADCS (Certification Authority > Issued Certificates > right-click > All Tasks > Revoke). Raison : Superseded.' },
      { title: 'Documenter', description: 'Mettre à jour le registre certificats (REG-PKI-002) : nouveau thumbprint, date émission, date expiration (prévoir alerte J-60 avant prochaine). Clôturer le ticket change avec durée réelle vs planifiée.' },
    ],
  },
  {
    slug: 'sync-ldap-ad-intranet',
    title: 'Synchronisation LDAP AD ↔ Intranet',
    description: 'Diagnostic et force-sync de la synchronisation des utilisateurs entre Active Directory et l\'intranet OMNITECH.',
    category: 'Active Directory',
    version: '1.0',
    steps: [
      { title: 'Vérifier le scheduler', description: 'L\'intranet sync LDAP toutes les 30 minutes (cron NestJS). Vérifier dans les logs backend : `journalctl -u omnitech-backend | grep -i ldap` doit afficher "LDAP sync OK - N users" toutes les 30 min.' },
      { title: 'Diagnostic connectivité', description: 'Depuis le serveur intranet : `ldapsearch -x -H ldap://dc01.omnitech.local -D "CN=svc_intranet,OU=Service Accounts,DC=omnitech,DC=local" -W -b "DC=omnitech,DC=local" -s sub "(objectClass=user)"`. Doit retourner > 100 entrées.' },
      { title: 'Vérifier le compte de service', description: 'Compte svc_intranet : lecteur AD uniquement, pas de password expiration (GPO exception). Vérifier : compte pas locked, password pas expiré, droits "Read all user information" sur la racine DN.' },
      { title: 'Force sync manuelle', description: 'API admin : `curl -X POST -H "Authorization: Bearer <admin_token>" https://intranet.omnitech-security.fr/api/v1/admin/ldap/sync`. Durée : 5-15s pour ~500 users. Retour : `{added:N, updated:N, disabled:N}`.' },
      { title: 'Vérifier les mappings', description: 'Champs mappés : sAMAccountName→login, mail→email, givenName→firstName, sn→lastName, department→department, memberOf→roles (via regex configurable). Vérifier dans `apps/backend/src/ldap/ldap.service.ts`.' },
      { title: 'Traiter les utilisateurs disabled', description: 'Les users désactivés en AD (userAccountControl bit 2) sont désactivés en intranet (soft-disable, pas de suppression). Si un user devrait être actif et est disabled : vérifier son userAccountControl en AD.' },
      { title: 'Résoudre conflits', description: 'Conflit = 2 users AD avec même email. L\'intranet rejette le 2e. Logs : `grep "LDAP conflict"`. Résolution : corriger l\'email en AD (le bon gagne) + force sync.' },
      { title: 'Purger les orphelins', description: 'Users en intranet mais plus en AD (user supprimé en AD) : marqués "orphan" automatiquement. Job nocturne 2h AM les désactive après 7j. Ne JAMAIS supprimer physiquement (audit trail).' },
      { title: 'Reset password AD côté intranet', description: 'L\'intranet ne reset PAS les passwords AD (source of truth = AD). Pour reset : MMC ADUC > right-click user > Reset Password, puis forcer sync intranet pour cascade (roles/departments peuvent aussi avoir changé).' },
      { title: 'Reporting sync', description: 'Dashboard admin > LDAP Sync : dernière sync OK, prochaine sync, nombre users actifs/disabled/orphan. Export CSV hebdomadaire au RSSI pour revue. Anomalie = alerte mail.' },
    ],
  },
  {
    slug: 'purge-logs-rotation',
    title: 'Purge et rotation des logs centralisés',
    description: 'Gestion du cycle de vie des logs (backend, Nginx, BunkerWeb, PostgreSQL, audit) selon politique de rétention.',
    category: 'Infrastructure',
    version: '1.0',
    steps: [
      { title: 'Politique de rétention', description: 'Logs applicatifs : 90 jours online + 1 an archive. Logs accès web : 1 an (obligation légale). Logs audit (security): 3 ans online + 5 ans archive (RGPD + ISO 27001). Logs DB : 30 jours.' },
      { title: 'Vérifier l\'espace disque', description: 'Cible : < 80% disque /var/log. Commande : `df -h /var`. Si > 85% : purge immédiate des logs hors-rétention. Si > 90% : alerte critique + investigation (log bomb possible = incident).' },
      { title: 'Rotation Nginx/BunkerWeb', description: 'Gérée par logrotate : `/etc/logrotate.d/nginx`. Rotation daily, compression gzip, retention 30 jours local + 1 an sur le serveur logs central. Vérifier : `logrotate -d /etc/logrotate.d/nginx` (dry-run).' },
      { title: 'Rotation backend NestJS', description: 'Logs via pino vers fichiers + rsyslog → serveur central. Retention locale 7 jours, 90 jours sur serveur central. Vérifier rotation : `ls -lah /var/log/omnitech/backend-*.log`.' },
      { title: 'Rotation PostgreSQL', description: 'Config dans postgresql.conf : log_rotation_age = 1d, log_rotation_size = 100MB, log_filename = \'postgresql-%Y-%m-%d_%H%M%S.log\'. Retention 30 jours. Vérifier : `ls /var/log/postgresql/`.' },
      { title: 'Archivage vers Wasabi', description: 'Script nocturne `/usr/local/bin/log-archive.sh` : tar gz + upload Wasabi bucket omnitech-logs-archive. Chiffrement AES-256 côté client avant upload. Vérifier les 7 derniers runs : `cat /var/log/log-archive.log`.' },
      { title: 'Purge des logs expirés', description: 'Job cron hebdomadaire dimanche 3h : `find /var/log -name "*.gz" -mtime +90 -delete`. Les logs audit (3 ans) sont dans un folder dédié exclus du find. Vérifier que le job tourne (syslog).' },
      { title: 'Conformité RGPD', description: 'Si logs contiennent données perso (IPs, logins) : durée = stricte nécessité. Exemple : nginx access_log = 1 an max. Si demande de droit à l\'oubli : nécessite identifier + purger les lignes concernées (procédure DPO).' },
      { title: 'Vérification intégrité', description: 'Hash SHA-256 de chaque archive avant upload Wasabi. Log dans registre conformité (REG-LOG-001). Sampling mensuel : télécharger 3 archives aléatoires et vérifier l\'intégrité (la DSI doit prouver la chain of custody).' },
      { title: 'Test de restauration logs', description: 'Tous les 6 mois : tester la restauration d\'une archive Wasabi vers un dossier temporaire, vérifier ouverture, parsing, recherche d\'une chaîne connue. Documenter dans rapport DR (runbook sauvegarde-test-restauration).' },
    ],
  },
  {
    slug: 'onboarding-collaborateur',
    title: 'Onboarding complet d\'un nouveau collaborateur',
    description: 'Parcours transverse J-7 à J+30 pour accueillir un nouveau collaborateur OMNITECH (IT + RH + Sécurité + Manager).',
    category: 'Active Directory',
    version: '1.0',
    steps: [
      { title: 'J-7 : Réception demande RH', description: 'RH envoie formulaire FRM-ONB-001 avec : identité, date arrivée, service, manager, type contrat, matériel requis, accès spéciaux demandés. Le ticket onboarding doit être ouvert J-7 minimum.' },
      { title: 'J-5 : Validation sécurité', description: 'Le RSSI valide les accès sensibles demandés (DIRECTION, RSSI, finance). Si prestataire externe : déclencher aussi runbook externe (portail prestataire + NDA + durée). Refus = retour RH pour justification.' },
      { title: 'J-5 : Préparer le matériel', description: 'Déclencher runbook deploiement-poste-mdt selon profil. Prévoir : poste, alim, sacoche, casque si poste support/télé, écran+dock si statutaire bureau. Livraison au bureau du manager J-1.' },
      { title: 'J-3 : Créer les comptes IT', description: 'Déclencher runbook creation-compte-ad. Profil intranet créé automatiquement par sync LDAP (runbook sync-ldap-ad-intranet). Vérifier que le manager apparaît bien en organigramme pour le nouveau.' },
      { title: 'J-2 : Préparer le welcome kit', description: 'Badge accès, clé casier, charte SI signée à préparer, guide intranet, contact IT helpdesk, numéro du manager. Le welcome kit est remis le premier jour par le manager (pas par l\'IT).' },
      { title: 'J-1 : Check final', description: 'Passer en revue : poste prêt + encartable, comptes AD actifs (pas disabled), mail testé (envoyer mail test + vérifier réception), licences M365 allouées, VPN configuré si télétravail. Rien ne doit manquer J0 matin.' },
      { title: 'J0 : Accueil', description: 'Manager accueille le nouveau. IT intervient 1h pour : livraison poste, première connexion guidée, tour des applications métier, présentation intranet (wiki, chatbot, helpdesk, GED). Prévoir 30 min tampon pour questions.' },
      { title: 'J0 : Formation sécurité obligatoire', description: 'Module e-learning charte SI (durée 20 min). Validation quiz 80% requis. Signature électronique de la charte via DocuSeal. Archivé en GED > RH. Sans validation : l\'accès intranet bascule en lecture seule.' },
      { title: 'J+3 : Point IT', description: 'Le manager IT passe voir le nouveau : tout fonctionne-t-il ? applications métier OK ? accès mail/fichiers OK ? VPN OK si applicable ? Traiter tout blocage avant J+5 (période critique rétention).' },
      { title: 'J+7 : Check Sécurité', description: 'Le RSSI valide : charte signée, formation sécurité validée, MFA activé (Microsoft Authenticator), password personnalisé, accès conformes aux demandes initiales (pas d\'écart). Créer ticket si écart.' },
      { title: 'J+15 : Point manager', description: 'Manager fait un point avec le nouveau : intégration, outils, formation. Le manager remonte tout besoin IT supplémentaire (accès spécifique, app métier non prévue) via ticket. L\'IT répond J+3 max.' },
      { title: 'J+30 : Revue access review', description: 'Campagne access review automatique inclut les nouveaux. RSSI valide que les accès réels correspondent aux demandes initiales. Les accès inutilisés peuvent être révoqués (principle of least privilege).' },
      { title: 'J+90 : Fin période essai IT', description: 'Si fin de période d\'essai : 2 scenarios. 1) Confirmation = pas d\'action IT. 2) Rupture = déclencher runbook offboarding (désactivation comptes, récupération matériel, archivage data). Check en J+85 par RH.' },
    ],
  },
];

async function main() {
  const author = await p.user.findUnique({ where: { email: AUTHOR_EMAIL } });
  if (!author) {
    throw new Error(`Author ${AUTHOR_EMAIL} not found`);
  }

  let created = 0;
  let updated = 0;
  for (const rb of runbooks) {
    const content = JSON.stringify(rb.steps);
    const existing = await p.runbook.findUnique({ where: { slug: rb.slug } });
    if (existing) {
      await p.runbook.update({
        where: { slug: rb.slug },
        data: {
          title: rb.title,
          description: rb.description,
          category: rb.category,
          version: rb.version,
          content,
          isPublished: true,
        },
      });
      updated++;
      console.log(`  ✓ updated: ${rb.slug} (${rb.steps.length} steps)`);
    } else {
      await p.runbook.create({
        data: {
          slug: rb.slug,
          title: rb.title,
          description: rb.description,
          category: rb.category,
          version: rb.version,
          content,
          isPublished: true,
          authorId: author.id,
        },
      });
      created++;
      console.log(`  + created: ${rb.slug} (${rb.steps.length} steps)`);
    }
  }

  console.log(`\nDone. ${created} created, ${updated} updated.`);
}

main()
  .then(() => p.$disconnect())
  .catch((e) => {
    console.error(e);
    p.$disconnect();
    process.exit(1);
  });
