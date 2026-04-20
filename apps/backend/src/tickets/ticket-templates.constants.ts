export const TICKET_TEMPLATES = [
  {
    id: 'access-request',
    label: "Demande d'acces",
    category: 'ACCESS',
    priority: 'MEDIUM' as const,
    titleTemplate: "Demande d'acces : [ressource]",
    descriptionTemplate:
      "Bonjour,\n\nJe souhaite obtenir un acces a : [preciser la ressource, dossier partage, application, etc.]\n\nMotif : [justification]\n\nMerci.",
    tags: ['acces', 'demande'],
  },
  {
    id: 'hardware-issue',
    label: 'Probleme materiel',
    category: 'HARDWARE',
    priority: 'HIGH' as const,
    titleTemplate: 'Panne materiel : [equipement]',
    descriptionTemplate:
      "Type d'equipement : [PC, ecran, imprimante, etc.]\nNumero de serie : [si connu]\nSymptome : [description du probleme]\nDepuis quand : [date]\n\nUrgence : [impact sur votre travail]",
    tags: ['hardware', 'panne'],
  },
  {
    id: 'network-incident',
    label: 'Incident reseau',
    category: 'NETWORK',
    priority: 'HIGH' as const,
    titleTemplate: 'Incident reseau : [description courte]',
    descriptionTemplate:
      "Type de probleme : [Wi-Fi, VPN, Internet, DNS, etc.]\nLocalisation : [bureau, etage, batiment]\nNombre de personnes impactees : [estimation]\nDepuis quand : [date/heure]\n\nDescription detaillee : [symptomes observes]",
    tags: ['reseau', 'incident'],
  },
  {
    id: 'software-issue',
    label: 'Probleme logiciel',
    category: 'SOFTWARE',
    priority: 'MEDIUM' as const,
    titleTemplate: 'Probleme logiciel : [application]',
    descriptionTemplate:
      "Application concernee : [nom et version si possible]\nMessage d'erreur : [copier-coller le message]\nEtapes pour reproduire :\n1. [etape 1]\n2. [etape 2]\n3. [etape 3]\n\nComportement attendu : [ce qui devrait se passer]\nComportement observe : [ce qui se passe]",
    tags: ['logiciel', 'bug'],
  },
  {
    id: 'new-hardware-request',
    label: 'Demande de nouveau materiel',
    category: 'HARDWARE',
    priority: 'LOW' as const,
    titleTemplate: 'Demande de materiel : [type]',
    descriptionTemplate:
      "Type de materiel souhaite : [PC portable, ecran, clavier, souris, casque, etc.]\nJustification : [pourquoi ce materiel est necessaire]\nBudget estimatif : [si connu]\nDelai souhaite : [date]\n\nValidation manager : [nom du manager]",
    tags: ['hardware', 'demande'],
  },
  {
    id: 'password-reset',
    label: 'Reset mot de passe',
    category: 'ACCESS',
    priority: 'HIGH' as const,
    titleTemplate: 'Reset mot de passe : [compte/application]',
    descriptionTemplate:
      "Compte concerne : [AD, messagerie, application metier, etc.]\nIdentifiant/login : [votre identifiant]\n\nMotif : [oubli, expiration, compte verrouille]\n\nMerci de reinitialiser mon mot de passe dans les meilleurs delais.",
    tags: ['acces', 'mot-de-passe'],
  },
  {
    id: 'security-incident',
    label: 'Incident de securite',
    category: 'SECURITY',
    priority: 'CRITICAL' as const,
    titleTemplate: 'Incident securite : [type]',
    descriptionTemplate:
      "Type d'incident : [phishing, malware, fuite de donnees, intrusion, etc.]\nDate/heure de detection : [quand]\nPoste(s) concerne(s) : [nom du poste, adresse IP si connue]\n\nDescription : [ce qui s'est passe]\nActions deja prises : [deconnexion reseau, etc.]\n\n⚠️ Ne pas eteindre le poste, ne pas supprimer les preuves.",
    tags: ['securite', 'incident', 'urgent'],
  },
  {
    id: 'vpn-request',
    label: 'Demande VPN',
    category: 'NETWORK',
    priority: 'MEDIUM' as const,
    titleTemplate: 'Demande VPN : [motif]',
    descriptionTemplate:
      "Motif de la demande : [teletravail, deplacement, prestataire]\nDuree souhaitee : [permanente, temporaire — preciser dates]\nRessources a acceder : [serveurs, applications, partages]\n\nPoste utilise : [PC pro, PC perso]\nSysteme d'exploitation : [Windows, macOS, Linux]",
    tags: ['reseau', 'vpn', 'acces'],
  },
  {
    id: 'printing-issue',
    label: "Probleme d'impression",
    category: 'HARDWARE',
    priority: 'LOW' as const,
    titleTemplate: 'Probleme impression : [imprimante/symptome]',
    descriptionTemplate:
      "Imprimante concernee : [nom/localisation]\nProbleme : [bourrage, qualite, hors ligne, etc.]\nDepuis quand : [date]\n\nAvez-vous essaye : [ ] Redemarrer l'imprimante  [ ] Verifier le papier/toner  [ ] Reinstaller le pilote",
    tags: ['hardware', 'impression'],
  },
  {
    id: 'other',
    label: 'Autre demande',
    category: 'OTHER',
    priority: 'LOW' as const,
    titleTemplate: '[Sujet de votre demande]',
    descriptionTemplate:
      'Bonjour,\n\n[Decrivez votre demande en detail]\n\nMerci.',
    tags: [],
  },
];
