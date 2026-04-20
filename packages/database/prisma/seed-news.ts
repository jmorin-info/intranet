import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ARTICLES = [
  {
    title: 'Mise à jour de la politique de mots de passe — ce qui change',
    slug: 'mise-a-jour-politique-mdp',
    excerpt: 'À compter du 1er mai, la politique de mots de passe évolue pour renforcer la sécurité de nos systèmes d\'information.',
    content: `
<h2>Pourquoi ce changement ?</h2>
<p>Suite aux recommandations de l'ANSSI (guide d'hygiène informatique 2025) et à notre démarche de certification ISO 27001, nous renforçons les exigences sur les mots de passe utilisés au sein d'OMNITECH Security.</p>

<h2>Ce qui change concrètement</h2>
<ul>
  <li><strong>Longueur minimale</strong> : passage de 8 à <strong>12 caractères</strong> (14 recommandé)</li>
  <li><strong>Complexité</strong> : au moins 3 des 4 catégories (majuscule, minuscule, chiffre, caractère spécial)</li>
  <li><strong>Historique</strong> : les 12 derniers mots de passe sont interdits (contre 6 précédemment)</li>
  <li><strong>Expiration</strong> : 90 jours pour les comptes standards, 60 jours pour les comptes à privilèges</li>
  <li><strong>MFA obligatoire</strong> : l'authentification multi-facteurs devient requise pour tous les accès distants et les applications critiques</li>
</ul>

<h2>Comment mettre à jour votre mot de passe ?</h2>
<p>Rendez-vous sur votre <a href="/profile">profil</a> pour modifier votre mot de passe. Un assistant vous guide pour choisir un mot de passe conforme. Nous recommandons l'utilisation d'un gestionnaire de mots de passe (KeePass, Bitwarden) pour ne pas avoir à mémoriser de mots de passe complexes.</p>

<h2>Calendrier</h2>
<p>La nouvelle politique entre en vigueur le <strong>1er mai 2026</strong>. Vous recevrez un rappel automatique 7 jours avant l'expiration de votre mot de passe actuel. En cas de difficulté, contactez le support IT via le <a href="/helpdesk">portail helpdesk</a>.</p>
`,
  },
  {
    title: 'Cybermois 2026 : les actions OMNITECH',
    slug: 'cybermois-2026-actions',
    excerpt: 'Octobre est le mois de la cybersécurité. Découvrez le programme d\'actions et de sensibilisation OMNITECH.',
    content: `
<h2>Un mois dédié à la cybersécurité</h2>
<p>Comme chaque année, OMNITECH participe activement au <strong>Cybermois européen</strong> (European Cybersecurity Month). Cette édition 2026 est placée sous le thème « Ingénierie sociale : quand l'humain devient la cible ».</p>

<h2>Programme des actions</h2>
<ul>
  <li><strong>Semaine 1 (1-7 oct.)</strong> — Quiz sécurité : testez vos réflexes face au phishing. Accessible depuis le <a href="/quiz">module quiz</a>. Les 10 meilleurs scores remportent un lot.</li>
  <li><strong>Semaine 2 (8-14 oct.)</strong> — Atelier pratique : « Reconnaître un email frauduleux en 30 secondes ». Inscription via le calendrier.</li>
  <li><strong>Semaine 3 (15-21 oct.)</strong> — Escape game cyber. Équipes de 4, résolvez des énigmes de sécurité informatique. Inscrivez-vous auprès de votre manager.</li>
  <li><strong>Semaine 4 (22-31 oct.)</strong> — Bilan et remise des prix. Présentation des résultats de la campagne de phishing simulée et des statistiques du quiz.</li>
</ul>

<h2>Pourquoi participer ?</h2>
<p>90% des cyberattaques commencent par un email de phishing. La sensibilisation régulière réduit de 70% le taux de clic sur les liens malveillants. Chaque collaborateur est un maillon essentiel de la chaîne de sécurité.</p>

<h2>Ressources</h2>
<p>Consultez la <a href="/wiki">base de connaissances</a> pour retrouver les bonnes pratiques email, la politique de mots de passe et les procédures d'escalade en cas d'incident.</p>
`,
  },
  {
    title: 'Nouveau portail self-service IT disponible',
    slug: 'nouveau-portail-selfservice-it',
    excerpt: 'Le portail d\'assistance IT a été entièrement repensé : chatbot intelligent, FAQ dynamique et suivi de tickets simplifié.',
    content: `
<h2>Un support IT plus rapide et plus intelligent</h2>
<p>Nous avons le plaisir de vous annoncer la mise en ligne du nouveau <a href="/helpdesk">portail self-service IT</a>. Conçu pour réduire les temps de résolution et vous rendre plus autonomes, il intègre plusieurs innovations.</p>

<h2>Les nouveautés</h2>
<ul>
  <li><strong>Chatbot intelligent</strong> — Posez votre question en langage naturel. Le bot recherche dans la base de connaissances, les procédures et les FAQ pour vous proposer une réponse immédiate. Il reconnaît les demandes courantes (« mot de passe oublié », « accès VPN », « problème imprimante ») et vous guide étape par étape.</li>
  <li><strong>FAQ dynamique</strong> — Les questions les plus fréquentes sont affichées en priorité, mises à jour automatiquement en fonction des tickets récents.</li>
  <li><strong>Création de ticket simplifiée</strong> — Si le chatbot ne résout pas votre problème, il vous propose directement de créer un ticket pré-rempli avec le contexte de votre échange.</li>
  <li><strong>Suivi en temps réel</strong> — Consultez l'état de vos tickets et recevez des notifications push à chaque mise à jour.</li>
</ul>

<h2>Comment y accéder ?</h2>
<p>Le portail est accessible depuis le menu « Support IT » dans la barre latérale, ou via le raccourci clavier <kbd>Ctrl+Shift+K</kbd> pour la recherche IA globale. Sur mobile, utilisez l'onglet « Sécurité » puis « Support ».</p>

<h2>Vos retours comptent</h2>
<p>N'hésitez pas à nous faire part de vos suggestions d'amélioration via le bouton d'annotations (💬 en bas à droite de chaque page) ou en contactant directement l'équipe IT.</p>
`,
  },
];

async function main() {
  const admin = await prisma.user.findFirst({
    where: { role: 'SUPER_ADMIN', isActive: true },
    select: { id: true },
  });
  if (!admin) {
    console.error('Aucun SUPER_ADMIN trouvé');
    process.exit(1);
  }

  let created = 0;
  let skipped = 0;

  for (const article of ARTICLES) {
    const existing = await prisma.newsPost.findFirst({ where: { slug: article.slug } });
    if (existing) {
      console.log(`⏭️  Déjà existant : "${article.title}"`);
      skipped++;
      continue;
    }

    await prisma.newsPost.create({
      data: {
        title: article.title,
        slug: article.slug,
        excerpt: article.excerpt,
        content: article.content,
        isPublished: true,
        publishedAt: new Date(),
        authorId: admin.id,
      },
    });
    console.log(`✅ Créé : "${article.title}"`);
    created++;
  }

  console.log(`\n📊 Résultat : ${created} créé(s), ${skipped} ignoré(s)`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
