interface KBAction {
  label: string;
  href?: string;
  action?: string;
}

interface KBEntry {
  answer: string;
  actions?: KBAction[];
}

export const HELPDESK_KB: Record<string, KBEntry> = {
  'mot de passe': {
    answer: 'Pour réinitialiser votre mot de passe :\n1. Accédez à Vaultwarden (vaultwarden.omnitech-security.fr)\n2. Connectez-vous avec votre compte\n3. Modifiez votre mot de passe\n\nSi vous êtes bloqué, un administrateur peut réinitialiser votre mot de passe AD.',
    actions: [{ label: 'Vaultwarden', href: 'https://vaultwarden.omnitech-security.fr' }],
  },
  'vpn': {
    answer: 'Configuration VPN :\n1. Installez FortiClient VPN\n2. Importez le profil VPN fourni par l\'IT\n3. Connectez-vous avec vos identifiants AD (login@omnitech.security)\n\nEn cas de problème, créez un ticket.',
  },
  'imprimante': {
    answer: 'Dépannage imprimante :\n1. Vérifiez que l\'imprimante est allumée et connectée\n2. Vérifiez la file d\'attente d\'impression (Paramètres > Imprimantes)\n3. Redémarrez le service spouleur d\'impression\n4. Testez une impression de page test\n\nSi ça ne fonctionne pas, créez un ticket.',
    actions: [{ label: 'Créer un ticket', action: 'create_ticket' }],
  },
  'email': {
    answer: 'Problème de messagerie :\n1. Vérifiez votre connexion Internet\n2. Redémarrez Outlook\n3. Essayez Outlook Web (outlook.office365.com)\n4. Vérifiez que votre boîte n\'est pas pleine\n\nSi le problème persiste, créez un ticket.',
  },
  'mfa': {
    answer: 'Pour configurer le MFA (double authentification) :\n1. Allez dans Services > MFA sur l\'intranet\n2. Cliquez sur "Configurer le MFA"\n3. Scannez le QR code avec Aegis ou FreeOTP\n4. Entrez le code à 6 chiffres pour activer',
    actions: [{ label: 'Configurer MFA', href: '/mfa' }],
  },
  'congé': {
    answer: 'Pour poser un congé :\n1. Connectez-vous à Lucca (omnitech-security.ilucca.net)\n2. Allez dans Congés & Absences\n3. Sélectionnez les dates et le type de congé\n4. Validez la demande',
    actions: [{ label: 'Lucca RH', href: 'https://omnitech-security.ilucca.net/' }],
  },
  'sécurité': {
    answer: 'En cas d\'incident de sécurité :\n1. Ne touchez à rien\n2. Contactez immédiatement le RSSI (Julien Moreau)\n3. Signalez l\'incident via l\'intranet (Alertes > Nouveau)\n4. Ne communiquez pas sur l\'incident\n\nPour les emails suspects : ne cliquez sur aucun lien et transférez au RSSI.',
  },
  'ticket': {
    answer: 'Je vais vous aider à créer un ticket. Allez dans Tickets IT sur l\'intranet ou cliquez ci-dessous.',
    actions: [{ label: 'Créer un ticket', href: '/tickets' }],
  },
};
