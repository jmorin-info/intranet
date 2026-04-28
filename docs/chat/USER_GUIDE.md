# Guide utilisateur — Assistant Noa (Chatbot OMNITECH)

Ce guide décrit toutes les fonctions actuelles de l'assistant chatbot
côté utilisateur, accessible :

- via le **bouton flottant ✨** (icône Sparkles, bas-droite des écrans)
- via la **palette de commandes** `Ctrl+Shift+K` → ouvre la modale Ask
- via les modules **embarqués** (page `/helpdesk` notamment)

## Sommaire

1. Lancer une conversation
2. Stop génération + raccourci `Esc`
3. Copier la réponse
4. Régénérer la dernière réponse
5. Éditer un message déjà envoyé
6. Donner un retour (👍 / 👎 + raison)
7. Exporter la conversation (Markdown / PDF)
8. Partager la conversation (lien éphémère)
9. Rechercher dans l'historique
10. Slash commands (`/`)
11. Confidentialité & traçabilité

---

## 1. Lancer une conversation

- Cliquez sur l'icône ✨ en bas à droite de l'écran (FAB).
- Ou appuyez sur `Ctrl+Shift+K`.
- Tapez votre question dans le champ de saisie, validez avec `Entrée`.
- L'assistant répond en streaming token par token (les sources RAG
  apparaissent en bas du message dès qu'elles sont disponibles).

Sur la première ouverture, des **suggestions contextuelles** au module
courant s'affichent (Documents, Tickets, Veille, etc.). Un clic sur une
suggestion lance directement la requête.

## 2. Stop génération + raccourci `Esc`

Pendant que l'assistant rédige (état "streaming"), un bouton **⏹ Stop
rouge** remplace le bouton d'envoi. Deux moyens d'arrêter :

- **Clic sur ⏹** : arrête immédiatement la génération.
- **Touche `Esc`** : même effet (uniquement pendant streaming/loading).
  En dehors du streaming, `Esc` ferme le panel comme avant.

Comportement :

- La requête HTTP/SSE est annulée côté serveur (`AbortController`).
- Le **message partiel reste affiché** avec le marqueur _"Génération
  arrêtée"_ en italique ambre.
- Vous pouvez relancer une régénération (voir §4) ou poser une nouvelle
  question.

## 3. Copier la réponse

Survolez n'importe quelle réponse de l'assistant : la barre d'actions
apparaît sous le message avec une icône **📋 Copier**.

- Le contenu est copié au format **Markdown brut**, blocs de code et
  liens préservés (caractères ``` ` `` ` et `**` conservés).
- Un toast _"Copié dans le presse-papier"_ confirme l'action.
- Compatible avec les contextes sans `navigator.clipboard` (fallback
  `execCommand`).

## 4. Régénérer la dernière réponse

Sur le **dernier message assistant** uniquement, la barre d'actions
expose une icône **🔄 Régénérer**.

- Click → relance la même question utilisateur avec le même contexte
  (le message assistant est remplacé en place, pas dupliqué).
- Le compteur `regenerateCount` est incrémenté.
- Si la première réponse provenait de l'heuristique locale, la
  régénération force le passage par RAG.

## 5. Éditer un message déjà envoyé

Sur **un message utilisateur** (vos questions, à droite), survolez pour
voir l'icône **✏️ Éditer**.

- Click → le contenu est rechargé dans l'input, l'historique APRÈS ce
  message est tronqué (les réponses suivantes disparaissent).
- Modifiez puis pressez `Entrée` : la nouvelle question remplace
  l'ancienne et déclenche une nouvelle réponse.

Bandeau jaune en bas : _"Édition d'un message — l'envoi remplacera
l'ancien"_ avec bouton **Annuler** pour revenir à l'historique
d'origine sans modifier.

## 6. Donner un retour (👍 / 👎 + raison)

Toute réponse assistant rattachée à une requête RAG (`queryId` présent)
expose deux pouces :

- **👍 utile** : enregistre `rating = +1`, toast _"Merci pour votre
  retour"_, plus aucune action requise.
- **👎 pas utile** : ouvre un panneau inline avec :
  - **7 catégories** standardisées :
    - Réponse incorrecte (`wrong_answer`)
    - Information manquante (`missing_info`)
    - Hors-sujet (`off_topic`)
    - Trop long (`too_long`)
    - Trop court (`too_short`)
    - Hallucination / source inventée (`hallucination`)
    - Autre (`other` — commentaire alors **obligatoire**)
  - **Commentaire libre** (max 500 caractères, optionnel sauf "Autre").

Le feedback est envoyé au backend (`POST /rag/:id/feedback` avec un
JSON `{reason, comment, v: 1}`, ou `POST /chat/messages/:id/feedback`
en architecture unifiée). Les ADMIN+ consultent l'agrégation via
`GET /api/v1/admin/chat/feedback` (filtrable par rating / source /
période, top reasons, derniers commentaires).

> **RGPD** : seuls votre `userId`, le `messageId`, la raison et le
> commentaire libre sont stockés. Aucun profil comportemental n'est
> construit.

## 7. Exporter la conversation

Bouton **🔗 Partager / Exporter** dans le header du panel chatbot.
Ouvre un menu avec deux exports :

### Markdown (`.md`)

- Génère un fichier `conversation-omnitech-YYYY-MM-DD.md` téléchargé
  immédiatement (Blob + `URL.createObjectURL`).
- Header : auteur, date d'export, module courant, nombre de messages.
- Chaque message en `### Utilisateur — DD/MM HH:MM` ou
  `### Assistant — DD/MM HH:MM`.
- Sources RAG listées en fin de message assistant
  (`**Sources :** 1. DOCUMENT — title (score 87%)`).

### PDF signé

- Lance la génération côté backend (signature HMAC + horodatage).
- Téléchargement automatique du PDF.
- Conforme ISO 27001 A.5.34 (preuve d'export auditée).

## 8. Partager la conversation (lien 7 jours)

Toujours via le bouton **🔗 Partager** :

- Click "Partager (lien 7 jours)" → snapshot read-only stocké côté
  backend (`ChatbotShareLink`), token UUID, expire automatiquement.
- L'URL `https://intranet.../share/conversation/<token>` est copiée
  dans le presse-papier.
- Toast _"Lien copié — valide 7 jours"_.

> Aucun chunk RAG ni metadata interne n'est exposé : seuls
> `role / content / timestamp / sources` snapshotés au moment du clic.

## 9. Rechercher dans l'historique

Quand l'historique contient ≥ 1 message, une icône **🔍 Recherche**
apparaît dans le header.

- Click → barre de recherche live.
- Filtre les messages contenant le terme (insensible à la casse).
- Compteur _"X résultats sur Y messages"_.

L'historique est conservé en `localStorage` (`omnitech:chatbot:history`,
50 derniers messages) — pas de stockage serveur côté frontend.

## 10. Slash commands (`/`)

Tapez `/` au début de l'input → liste filtrée des commandes :

- `/doc <terme>` — Recherche documentaire
- `/wiki <terme>` — Recherche dans la base de connaissances
- `/incident` — Lance le formulaire incident
- `/ticket` — Lance le formulaire ticket
- `/veille` — Résumé des alertes de la semaine
- `/help` — Aide contextuelle au module courant

Navigation : `↑ ↓` pour parcourir, `Tab` ou `Entrée` pour valider.

## 11. Confidentialité & traçabilité

- **Aucun JWT** dans `localStorage` (cookie httpOnly uniquement, ANSSI A.5.34).
- **Toutes les requêtes** vers le LLM passent par votre backend OMNITECH
  (Ollama on-prem) — aucun appel externe.
- **Logging** : `RagQueryLog` ou `ChatMessage` selon l'architecture,
  conservé 12 mois pour traçabilité ISO 27001 A.8.15.
- **Feedback négatif** : déclenche un audit log `ASSISTANT_FEEDBACK_NEGATIVE`
  consultable par les ADMIN+ pour pilotage qualité.

## Raccourcis clavier

| Raccourci          | Action                                            |
| ------------------ | ------------------------------------------------- |
| `Ctrl+Shift+K`     | Ouvre la modale Ask                               |
| `Esc` (panel)      | Pendant streaming : **STOP** ; sinon : ferme      |
| `Entrée`           | Envoie le message (ou valide la slash command)    |
| `↑ / ↓`            | Navigation slash commands                         |
| `Tab` (slash menu) | Auto-complète la slash command                    |

---

_Mis à jour : 2026-04-27 — version Wave B post-launch (Stop / Copy /
Regenerate / Export Markdown / Feedback +/− avec raison)._
