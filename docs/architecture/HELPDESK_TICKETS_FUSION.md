# Helpdesk et Tickets — arbitrage de fusion

Contexte : `/helpdesk` et `/tickets` semblent recouvrir le même besoin
("obtenir de l'aide IT"). Ce document détaille leur périmètre, l'overlap
réel, et propose trois options pour clarifier l'expérience utilisateur.

## 1. État actuel

### 1.1 `/helpdesk` — Support IT self-service

- Page : `apps/frontend/src/app/(app)/helpdesk/page.tsx:26-88`. Deux onglets :
  - **Assistant IA** (`chat`) : `helpdesk/HelpdeskChat.tsx` (690 lignes).
  - **Self-Service** (`selfservice`) : `helpdesk/SelfServicePortal.tsx`
    (477 lignes).
- Backend helpdesk : `apps/backend/src/helpdesk/`.
  - `helpdesk.service.ts:73-226` — base de connaissances (KB) 29 articles
    hard-codés (`DEFAULT_KB`), recherche keyword scoring + synonymes +
    fuzzy Levenshtein (1-2 typos), renvoie `suggestTicket=true` si
    confiance < 30 %.
  - Endpoints (`helpdesk.controller.ts`) : `GET /helpdesk/kb`,
    `GET /helpdesk/kb/search?q=...`, `PUT /helpdesk/kb` (ADMIN).
- Chat client (`HelpdeskChat.tsx:142-272`) : pipeline de réponse à 5
  niveaux :
  1. Intent detection locale (`helpdesk-chat-utils.ts`).
  2. Match KB locale (scoring poids 10/5/2/1).
  3. RAG via `POST /rag/ask` (si `features.ai`).
  4. Fallback `GET /ai/search`.
  5. Message "créer un ticket" sinon.
- SelfServicePortal : 7 templates de demande (reset mdp, VPN, matériel,
  logiciel, accès, badge, incident sécurité) — **chaque template crée un
  ticket via l'API tickets**. C'est donc déjà un front vers le ticketing.
- Accès : route visible dans la sidebar sous le code module `helpdesk`
  (`spaces.service.ts:34`).

### 1.2 `/tickets` — File de tickets

- Page : `apps/frontend/src/app/(app)/tickets/page.tsx` (2219 lignes) +
  `TicketSpacesHub.tsx` (168 lignes, sélection d'espace en amont).
- Backend : `apps/backend/src/tickets/`.
  - `tickets.service.ts` (1081 lignes). Modèle `Ticket` + `TicketComment`
    - `TicketSpace` + `TicketSpaceMember` (RBAC fin par espace,
      `schema.prisma:686-794`).
  - Endpoints clés (`tickets.controller.ts`) : CRUD, `GET /tickets/spaces`,
    `POST /tickets/bulk/*`, analytics, export CSV, `POST :id/generate-kb`.
- Fonctionnalités uniques tickets :
  - Cycle de vie complet (OPEN → IN_PROGRESS → RESOLVED → CLOSED).
  - Espaces multi-équipes (IT, RH, Services Généraux, Sécurité).
  - SLA cron (`tickets.service.ts:771` — `@Cron('*/30 * * * *')` break-check).
  - Analytics, Kanban, bulk actions, commentaires internes/externes.
  - Auto-tagging (`tickets.service.ts:976-1002`) — 8 règles keywords.
  - Suggestion d'assignee par catégorie (`tickets.service.ts:419-456`).
  - Génération KB draft depuis ticket résolu (`:id/generate-kb`).

### 1.3 Assistant IA global

- `apps/frontend/src/components/ai/ai-chatbot.tsx` (635 lignes) — chatbot
  flottant disponible sur toute l'app, avec détection de module
  (`detectModule`, ligne 15-27) et suggestions contextuelles.
  - Se superpose fonctionnellement au chat `/helpdesk` — l'utilisateur a
    deux bots IA qui répondent différemment (le global est heuristique pur,
    le helpdesk combine KB + RAG).

## 2. Overlap réel

| Fonctionnalité                       | `/helpdesk`                        | `/tickets`           | `ai-chatbot` global |
| ------------------------------------ | ---------------------------------- | -------------------- | ------------------- |
| Poser une question "comment faire X" | Oui (KB + RAG)                     | Non                  | Oui (heuristique)   |
| Créer un ticket                      | Templates (SelfService) + CTA chat | Oui (dialog complet) | Redirige            |
| Voir mes tickets                     | Non                                | Oui                  | Non                 |
| Suivre un SLA                        | Non                                | Oui                  | Non                 |
| Commenter un ticket                  | Non                                | Oui                  | Non                 |
| Suggestions d'articles               | Oui                                | Non                  | Partiel             |
| Routing automatique                  | Non                                | Catégorie → assignee | Non                 |

Duplication : **création de ticket** (SelfServicePortal côté helpdesk vs
dialog côté tickets), **suggestions IA** (chat helpdesk vs chatbot global).

Unique helpdesk : KB 29 articles + pipeline RAG.
Unique tickets : file, SLA, analytics, espaces, cycle de vie.

L'architecture actuelle est en réalité déjà cohérente logiquement
(helpdesk = front self-service, tickets = back-office file), mais l'UX ne
reflète pas cette hiérarchie : l'utilisateur voit deux entrées de sidebar
sans savoir laquelle utiliser en premier.

## 3. Options

### Option A — Statu quo avec clarification UX

- Dans la sidebar, regrouper les deux sous un parent "Support" avec
  sous-menus : "Demander de l'aide (IA)" → `/helpdesk`, "Mes tickets" →
  `/tickets`.
- Bandeau en tête de `/tickets` : « Avant de créer un ticket, consultez
  l'assistant IA — il résout 60 % des demandes ».
- Bandeau en tête de `/helpdesk` : « Consulter mes tickets existants » →
  lien `/tickets?assignee=me`.
- Supprimer la duplication du chatbot global sur `/helpdesk` (le cacher
  ou le configurer en mode "même moteur").

Effort : **0,5-1 j** (copy + liens + config chatbot). Risque : faible.
Pas de migration.

### Option B — Fusion dans `/support` avec escalade IA → ticket

Une seule route `/support`, flow guidé :

1. **Landing** : grande barre de recherche IA (KB + RAG).
2. **Réponse** : si confiance >= 50 %, afficher la réponse + "Cela a
   résolu ?" (feedback). Si < 50 %, proposer de créer un ticket pré-rempli
   avec la conversation.
3. **Pré-remplissage** : titre/description extraits de la conversation ;
   catégorie/priorité suggérées par l'IA (voir §4) ; template SelfService
   injecté si l'intent détecté matche un des 7 templates.
4. **Onglet "Mes demandes"** : vue liste allégée des tickets du user
   (lecture seule). Les agents ADMIN continuent à passer par `/tickets`
   pour la gestion full.

Effort : **6-8 jours**

- 1 j refonte route + navigation.
- 2 j composant fusion chat + file tickets perso.
- 2 j moteur IA qualification (cf. §4).
- 1 j tests e2e.
- 1-2 j rédaction + migration SEAL/i18n.

Risque : moyen (changement UX majeur). Impact users : **fort positif** —
flow unique guidé, moins de décision cognitive.

### Option C — `/helpdesk` devient la home support avec chatbot + liste perso

`/helpdesk` gagne un troisième onglet "Mes tickets" (widget lecture seule
de `GET /tickets?creator=me`). `/tickets` reste le back-office agent/admin
(éventuellement renommé `/tickets/admin` ou exposé uniquement aux rôles
AGENT+). Le chatbot global (`ai-chatbot.tsx`) est branché sur le même
moteur que `HelpdeskChat` (KB + RAG commun).

Effort : **3-4 j**

- 1 j widget "Mes tickets".
- 1 j unification moteur chatbot global ↔ helpdesk.
- 1 j gating `/tickets` par rôle AGENT+.
- 0,5-1 j tests + doc.

Risque : faible-moyen. Impact users : moyen (les collaborateurs perdent
l'accès à `/tickets` — mais gagnent le widget dans `/helpdesk`).

## 4. Analyse IA — qualification automatique d'un ticket

L'infrastructure existante permet la qualification sans changement de
stack :

- **Catégorie** : réutiliser `TicketsService.detectTags`
  (`tickets.service.ts:976-1002`) — 8 règles keywords mappent vers les
  catégories (`securite`, `reseau`, `materiel`, `logiciel`, `acces`…).
  Extension : dériver `TicketCategory` canonique depuis le tag dominant.
- **Priorité** : règles simples (déjà partielles dans `detectTags` avec
  le tag `urgent`). Enrichir via RAG : si la question mentionne un produit
  du parc (`OMNITECH_PRODUCTS` dans `veille.service.ts:85-108`) + un CVE
  récent récupéré par la veille → priorité HIGH/CRITICAL automatique.
- **Assignation** : `CATEGORY_ASSIGNEES` existe déjà
  (`tickets.service.ts:419-456`) — mapping catégorie → rôle/département,
  renvoie un `suggestedAssignee` à la création. À brancher côté helpdesk
  lors de l'escalade IA → ticket.
- **Espace** : via `ticketSpace.findFirst({ allowedCategories })` — router
  automatiquement vers l'espace dont `allowedCategories` contient la
  catégorie détectée (`schema.prisma:697`).
- **Pré-remplissage** : le chat helpdesk maintient l'historique conversation
  (`helpdesk-chat-utils.ts: saveHistory`) ; concaténer les messages user en
  description + prendre le dernier comme title.

Effort complémentaire (qualification IA) : **2 jours** dans n'importe
quelle option, réutilisable. Le gain est surtout lisible dans l'option B
où l'escalade IA → ticket est la route principale.

Garde-fous :

- Qualification IA = _suggestion_ (modifiable par le user avant submit).
- Ne jamais auto-assigner à CRITICAL sans confirmation user (ISO 27001
  A.5.24 — incident doit être déclaré par le détecteur, pas un bot).
- Logger la qualification dans `AuditLog` avec `metadata.aiQualified=true`
  pour traçabilité.

## 5. Recommandation

**Option C** (helpdesk = home support avec 3 onglets + unification chatbot).

Justification :

- Coût limité (3-4 j) pour un gain UX immédiat.
- Conserve `/tickets` comme back-office agent sans rupture pour les équipes
  IT/RH existantes.
- Aligne l'entrée utilisateur sur le flow naturel : "j'ai un problème →
  `/helpdesk` → IA → ticket si nécessaire → suivi dans le même onglet".
- Résout la duplication de chatbot (global vs helpdesk) — point de friction
  réel, deux assistants différents créant de l'incohérence.
- Prépare l'option B (fusion complète) sans l'imposer : un futur sprint
  peut basculer `/tickets` en vue filtrée du helpdesk pour les non-agents.
- Ajouter en parallèle les 2 j de qualification IA (cf. §4) est cohérent
  avec cette option.

Effort total recommandé : **5-6 jours** (option C + qualification IA).

### Séquencement

1. **Sprint N** : onglet "Mes tickets" dans `/helpdesk`, unification
   chatbot global ↔ helpdesk (un seul moteur KB + RAG).
2. **Sprint N+1** : qualification IA (catégorie, priorité, assignee
   suggéré) injectée dans le flow "créer un ticket depuis le chat".
3. **Sprint N+2** (optionnel) : gating `/tickets` = AGENT+ par défaut,
   toggle admin pour l'ouvrir aux collaborateurs.

Option B reste l'horizon cible si l'adoption de C confirme le flow
(télémétrie : taux de tickets créés depuis le chat vs depuis le dialog
tickets — bascule à B si > 70 % viennent du chat).
