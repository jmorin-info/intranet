import { Injectable } from '@nestjs/common';

export interface GetSuggestionsArgs {
  contextType?: string;
  entityId?: string;
  userDepartmentId?: string | null;
}

/**
 * ChatService — helpers haut niveau autour du chatbot unifié.
 *
 * v1 (Phase 1) : suggestions hardcodées par contextType. v2 (Phase 2) =
 * génération LLM + cache Redis (voir docs/chat/SUGGESTIONS_STRATEGY.md).
 */
@Injectable()
export class ChatService {
  getSuggestions(args: GetSuggestionsArgs): string[] {
    switch (args.contextType) {
      case 'wiki_article':
        return [
          'Résume-moi cet article en 3 points clés.',
          'Quelles sont les actions recommandées ?',
          'À qui cet article est-il destiné ?',
          'Quels prérequis dois-je avoir avant de suivre cette procédure ?',
        ];
      case 'runbook':
        return [
          'Explique-moi ce runbook étape par étape.',
          'Quels sont les points de vigilance ?',
          'Quel est le rollback prévu si ça échoue ?',
          'Qui est la personne escalade en cas de problème ?',
        ];
      case 'document':
        return [
          'Résume ce document en 3 points.',
          'Quels sont les risques identifiés ?',
          "Quelle est la classification ISO 27001 de ce document ?",
          'À qui ce document est-il destiné ?',
        ];
      case 'ticket':
        return [
          'Résume ce ticket et son statut actuel.',
          'Suggère une résolution basée sur les tickets similaires.',
          'Qui est assigné et depuis combien de temps ?',
          'Y a-t-il un runbook applicable ?',
        ];
      case 'generic':
      default:
        // Suggestions génériques adaptées au département si dispo (Phase 2
        // pluggera un lookup par gold-set). v1 = set universel.
        return [
          'Comment faire une demande de congé ?',
          "Quelle est la procédure d'onboarding ?",
          'Où trouver les chartes de sécurité à signer ?',
          'Comment créer un ticket helpdesk ?',
          'Quelle est la procédure de renouvellement du certificat NPS ?',
          'Comment exporter la liste des utilisateurs ?',
        ];
    }
  }
}
