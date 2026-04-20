const { PrismaClient } = require('/root/omnitech-intranet/packages/database/node_modules/@prisma/client');
const p = new PrismaClient();

async function main() {
  // Survey 1: Satisfaction générale T1 2026
  const s1 = await p.satisfactionSurvey.create({
    data: {
      title: 'Satisfaction générale T1 2026',
      description: 'Enquête trimestrielle de satisfaction des collaborateurs OMNITECH - Premier trimestre 2026',
      isAnonymous: true,
      isActive: true,
    },
  });
  await p.surveyQuestion.createMany({
    data: [
      { surveyId: s1.id, label: "Comment évaluez-vous votre environnement de travail ?", type: 'rating', isRequired: true, order: 0 },
      { surveyId: s1.id, label: "Les outils informatiques mis à disposition sont-ils adaptés ?", type: 'scale', isRequired: true, order: 1, description: 'Échelle de 1 à 10' },
      { surveyId: s1.id, label: "Recommanderiez-vous OMNITECH comme employeur ?", type: 'yesno', isRequired: true, order: 2 },
      { surveyId: s1.id, label: "Qu'est-ce qui pourrait être amélioré ?", type: 'text', isRequired: false, order: 3 },
    ],
  });
  console.log('Survey 1 created:', s1.id, '-', s1.title);

  // Survey 2: Évaluation des outils IT
  const s2 = await p.satisfactionSurvey.create({
    data: {
      title: 'Évaluation des outils IT',
      description: "Donnez votre avis sur les outils informatiques utilisés au quotidien chez OMNITECH",
      isAnonymous: false,
      isActive: true,
    },
  });
  await p.surveyQuestion.createMany({
    data: [
      { surveyId: s2.id, label: "Satisfaction avec l'intranet", type: 'rating', isRequired: true, order: 0 },
      { surveyId: s2.id, label: "Satisfaction avec la messagerie", type: 'rating', isRequired: true, order: 1 },
      { surveyId: s2.id, label: "Quel outil manque le plus ?", type: 'choice', isRequired: true, order: 2, options: JSON.stringify(['Visioconférence', 'Gestion de projet', 'Chat interne', 'Wiki/Documentation', 'Autre']) },
      { surveyId: s2.id, label: "Suggestions d'amélioration", type: 'text', isRequired: false, order: 3 },
    ],
  });
  console.log('Survey 2 created:', s2.id, '-', s2.title);

  // Survey 3: Feedback formation sécurité
  const s3 = await p.satisfactionSurvey.create({
    data: {
      title: 'Feedback formation sécurité',
      description: 'Évaluez la formation de sensibilisation à la sécurité informatique',
      isAnonymous: true,
      isActive: true,
    },
  });
  await p.surveyQuestion.createMany({
    data: [
      { surveyId: s3.id, label: "La formation était-elle claire et compréhensible ?", type: 'rating', isRequired: true, order: 0 },
      { surveyId: s3.id, label: "Avez-vous appris de nouvelles pratiques ?", type: 'yesno', isRequired: true, order: 1 },
      { surveyId: s3.id, label: "Quel sujet approfondir ?", type: 'choice', isRequired: true, order: 2, options: JSON.stringify(['Phishing', 'Mots de passe', 'Classification documents', 'VPN/Réseau', 'Signalement incidents']) },
      { surveyId: s3.id, label: "Note globale de la formation", type: 'scale', isRequired: true, order: 3, description: 'Échelle de 1 à 10' },
      { surveyId: s3.id, label: "Commentaires libres", type: 'text', isRequired: false, order: 4 },
    ],
  });
  console.log('Survey 3 created:', s3.id, '-', s3.title);

  await p.$disconnect();
  console.log('\nDone! All 3 surveys with questions created successfully.');
}

main().catch(e => { console.error(e); process.exit(1); });
