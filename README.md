<div align="center">

# OMNITECH Intranet

**Plateforme GED sécurisée pour OMNITECH Security — conformité ISO 27001:2022, RGPD, NIS2 et recommandations ANSSI.**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15.5-000?logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![NestJS](https://img.shields.io/badge/NestJS-11.1-e0234e?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![Prisma](https://img.shields.io/badge/Prisma-5.22-2d3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Node.js](https://img.shields.io/badge/Node-20%20LTS-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9.15-f69220?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![ISO 27001:2022](https://img.shields.io/badge/ISO%2027001%3A2022-93%20contr%C3%B4les-006233)](https://www.iso.org/standard/27001)
[![Licence : Propriétaire](https://img.shields.io/badge/Licence-Propri%C3%A9taire-892034)](./LICENSE)

[![CI](https://github.com/jmorin-info/intranet/actions/workflows/ci.yml/badge.svg)](https://github.com/jmorin-info/intranet/actions/workflows/ci.yml)
[![CodeQL](https://github.com/jmorin-info/intranet/actions/workflows/codeql.yml/badge.svg)](https://github.com/jmorin-info/intranet/actions/workflows/codeql.yml)
[![Security](https://github.com/jmorin-info/intranet/actions/workflows/security.yml/badge.svg)](https://github.com/jmorin-info/intranet/actions/workflows/security.yml)

</div>

---

## Sommaire

- [Présentation](#présentation)
- [Captures d'écran](#captures-décran)
- [Fonctionnalités principales](#fonctionnalités-principales)
- [Architecture](#architecture)
- [Stack technique](#stack-technique)
- [Sécurité & conformité](#sécurité--conformité)
- [Installation — dev local](#installation--dev-local)
- [Déploiement production](#déploiement-production)
- [Variables d'environnement](#variables-denvironnement)
- [Scripts pnpm](#scripts-pnpm)
- [Tests](#tests)
- [Documentation](#documentation)
- [Roadmap](#roadmap)
- [Contribuer](#contribuer)
- [Licence](#licence)
- [Auteur](#auteur)

---

## Présentation

**OMNITECH Intranet** est la plateforme métier interne d'OMNITECH Security (sûreté électronique : contrôle d'accès, vidéosurveillance, hypervision SEAL System). Elle centralise la gestion documentaire (GED), le helpdesk, la veille cybersécurité, les chartes obligatoires, les workflows d'approbation, les revues d'accès et l'ensemble des contrôles ISO 27001:2022 dans une application unique, **auto-hébergée**, sans dépendance à un cloud public.

L'objectif : industrialiser la conformité (ISO/RGPD/NIS2) pour une PME tech de l'industrie de la sécurité, avec le niveau d'exigence qu'on attend de ses propres clients.

> **102 modèles Prisma · ~683 routes API gardées par RBAC · 28 blocs CMS éditables · 8 rôles hiérarchiques · 1 121 fichiers TypeScript**

---

## Captures d'écran

> Les captures d'écran seront ajoutées progressivement. Voir [`docs/screenshots/`](./docs/) (à venir).

| Vue                                  | Description                                                           |
| ------------------------------------ | --------------------------------------------------------------------- |
| `docs/screenshots/dashboard.png`     | Tableau de bord personnalisé (greeting, tips quotidiens, indicateurs) |
| `docs/screenshots/admin-content.png` | Éditeur CMS form-driven (28 blocs + 4 pages)                          |
| `docs/screenshots/trust.png`         | Centre de confiance public (`/trust`)                                 |
| `docs/screenshots/welcome.png`       | Page d'accueil publique (`/welcome`)                                  |
| `docs/screenshots/hub-security.png`  | Hub Sécurité & Conformité                                             |

---

## Fonctionnalités principales

### Gestion documentaire (GED)

- Cycle de vie complet : `DRAFT → REVIEWED → APPROVED → PUBLISHED → ARCHIVED`
- Versioning natif, comparaison de versions, restauration
- Workflows d'approbation configurables (ISO 27001 A.5.1)
- Acknowledgments obligatoires avec preuve d'horodatage
- Rétention 7 ans + purge automatique RGPD A.8.3

### Conformité & audit

- **8 rôles RBAC hiérarchiques** : `SUPER_ADMIN > ADMIN > DIRECTION > MANAGER > REVIEWER > COLLABORATEUR > AUDITEUR > PRESTATAIRE`
- **Audit logs** centralisés (utilisateur, action, ressource, IP, user-agent, horodatage) — ISO A.5.33
- **Access reviews** annuelles : `INACTIVE_USERS`, `PASSWORDS`, `ACCESS_RIGHTS` (ISO A.5.18)
- **Compliance tasks** récurrentes liées aux 93 contrôles Annex A
- **Export RGPD** auto-service (`/me/gdpr-export`)
- **Veille cybersécurité** CERT-FR / ANSSI agrégée

### Signatures & chartes

- Signature électronique via **DocuSeal** (eIDAS, HMAC-SHA256)
- **Chartes obligatoires** signées avant accès à l'intranet
- Campagnes de signature en masse
- Preuves de signature horodatées et conservées

### Communication

- **Tickets / Helpdesk** avec SLA, priorités, escalade RSSI
- **Wiki** collaboratif (tags, backlinks, full-text search)
- **Actualités** internes (catégories, analytics, modération)
- **Notifications** in-app + push (VAPID) + email + digest hebdo
- **Calendrier** synchronisé Google / Outlook (OAuth2 + iCal subscription tokens)

### Sécurité opérationnelle

- **Incidents** : signalement, qualification, remédiation, timeline (A.5.24/25)
- **MFA obligatoire** : TOTP + WebAuthn + backup codes
- **Behavior detection (UEBA)** : 8 règles automatisées (R001–R008) avec alerting RSSI
- **HIBP k-anonymity** sur les mots de passe (recommandation ANSSI R20)

### CMS interne

- **28 blocs éditoriaux** + **4 ContentPages** juridiques (mentions légales, RGPD, cookies, DPA)
- **Éditeur form-driven** par schéma (vs JSON brut)
- **Theming CSS via CMS** (couleurs SEAL, fontes, rayons éditables)
- **Sidebar configurable** : items custom, overrides de libellés, masquage

### IA & RAG

- **Chatbot unifié** — sessions persistées, RAG sémantique, feedback
- **Recherche hybride** : lexical (Meilisearch) + vectoriel (pgvector)
- **LLM local** : Ollama (qwen2:0.5b par défaut, configurable)
- **Embeddings** : `bge-m3` via Ollama

### Outils intégrés

- **Édition collaborative** Word/Excel/PowerPoint — OnlyOffice
- **Manipulation PDF** (split, merge, OCR, signatures visuelles) — Stirling-PDF
- **Partages SMB** (Samba/NAS interne) via API `/fileserver`
- **Webdav** pour les clients de bureau

---

## Architecture

> 📊 **Diagrammes complets** (système, RBAC, cycle de vie GED, flux CMS, ERD) :
> [`docs/architecture/DIAGRAMS.md`](./docs/architecture/DIAGRAMS.md)

Monorepo **pnpm 9** + **Turborepo** :

```
omnitech-intranet/
├── apps/
│   ├── backend/        NestJS 11 — API REST + WebSocket — 87 modules
│   ├── frontend/       Next.js 15 (App Router) — Server + Client Components
│   └── mobile/         React Native (optionnel)
├── packages/
│   ├── database/       Prisma 5.22 — 102 modèles, 64 migrations
│   ├── shared/         Types TypeScript partagés (UserRole, Permissions, etc.)
│   └── ui/             Kit UI Tailwind + lucide-react + Storybook
├── e2e/                Playwright (auth, RBAC, a11y axe-core)
├── docs/               compliance, architecture, runbooks, cms, rag, infrastructure
├── scripts/            ops, backups, drills, déploiement
├── docker/             Dockerfiles multi-étapes (backend, frontend)
├── infra/              BunkerWeb, nginx configs
└── .github/workflows/  CI : lint-strict, e2e, cdn-sync
```

### Services tiers attendus en production

| Service            | Image                        | Port   | Rôle                              |
| ------------------ | ---------------------------- | ------ | --------------------------------- |
| **postgres**       | `postgres:16-alpine`         | 5432   | Données relationnelles + pgvector |
| **redis**          | `redis:7-alpine`             | 6379   | Cache, sessions, BullMQ           |
| **meilisearch**    | `getmeili/meilisearch:v1.11` | 7700   | Recherche full-text               |
| **ollama**         | `ollama/ollama`              | 11434  | LLM local (RAG)                   |
| **documentserver** | `onlyoffice/documentserver`  | 8080   | Édition Word/Excel                |
| **stirling-pdf**   | `stirlingtools/stirling-pdf` | 8080   | Outils PDF                        |
| **docuseal**       | `docuseal/docuseal`          | 3000   | Signature électronique            |
| **nginx**          | `nginx:1.27-alpine`          | 80/443 | Reverse proxy + TLS               |

> **Ressources minimum recommandées : 18 GB RAM, 14 vCPU** (Ollama est l'élément le plus gourmand : 8 GB / 4 vCPU à lui seul).

---

## Stack technique

### Backend

| Composant                  | Version         |
| -------------------------- | --------------- |
| NestJS                     | 11.1.19         |
| Node.js                    | ≥ 20 LTS        |
| TypeScript                 | 5.9.3           |
| Prisma                     | 5.22.0          |
| BullMQ                     | 5.74.1          |
| @nestjs/jwt + passport-jwt | 11.0.2 / 4.0.1  |
| @simplewebauthn/server     | 13.3.0          |
| otplib (TOTP MFA)          | 13.4.0          |
| sanitize-html              | 2.17.3          |
| Helmet                     | 8.1.0           |
| Pino + pino-http           | 10.3.1 / 11.0.0 |
| Sentry (optionnel)         | 10.50.0         |

### Frontend

| Composant               | Version          |
| ----------------------- | ---------------- |
| Next.js                 | 15.5.15          |
| React                   | 19.2.5           |
| next-intl               | 4.9.1            |
| Tailwind CSS            | 3.4.19           |
| react-hook-form + zod   | 7.72.1 / 3.25.76 |
| lucide-react            | 1.8.0            |
| DOMPurify               | 3.4.0            |
| @simplewebauthn/browser | 13.3.0           |

### Database & infra

- **PostgreSQL 16** + extensions `pgvector`, `uuid-ossp`
- **Redis 7** (cache, queues BullMQ, sessions)
- **Meilisearch v1.11** (recherche)
- **Ollama** (LLM local + embeddings RAG)

### Tests

- **Vitest 2.1.8** — frontend (213 tests)
- **Jest 29.7** — backend (66 suites)
- **Playwright 1.59 + axe-core 4.11** — e2e + a11y

---

## Sécurité & conformité

### Standards visés

- **ISO/IEC 27001:2022** — 93 contrôles Annex A implémentés et tracés
- **RGPD** — registre des traitements, DPO désigné, DSAR, droit à l'effacement
- **NIS2** — gestion d'incidents avec workflow d'escalade
- **ANSSI** — alignement guide d'hygiène informatique + R-SI

### Mécanismes en place

- **JWT** access 15 min + refresh 7 j avec rotation
- **MFA** TOTP + WebAuthn + backup codes (obligatoire pour admins, opt-in users)
- **CSP nonce** + HSTS 2 ans avec preload
- **Sanitization HTML défense en profondeur** : `sanitize-html` (backend) + `DOMPurify` (frontend)
- **Rate limiting** Redis-backed (ThrottlerModule)
- **HIBP k-anonymity** sur la création/changement de mots de passe
- **Audit logs** sur ~683 routes API
- **Behavior detection (UEBA)** : 8 règles automatisées (R001 login bursty, R002 off-hours, …)
- **Backups offsite** chiffrés (Restic + S3 souverain Scaleway/OVH)
- **PCA / Continuité** : drills hebdo, RTO 4h, RPO 1h

Voir [`SECURITY.md`](./SECURITY.md) pour la politique de divulgation et `docs/compliance/` pour la cartographie complète des contrôles.

---

## Installation — dev local

### Prérequis

- **Node.js 20 LTS** (`node -v`)
- **pnpm 9.15+** (`corepack enable && corepack prepare pnpm@9.15.0 --activate`)
- **PostgreSQL 16** avec extension `pgvector` activable
- **Redis 7**
- (optionnel pour le dev rapide) Docker & Docker Compose v2

### Démarrage rapide

```bash
git clone https://github.com/jmorin-info/intranet.git
cd intranet
pnpm install

cp .env.example .env             # remplir DATABASE_URL, JWT_*_SECRET, SMTP_*
pnpm db:generate
pnpm db:push                     # ou db:migrate pour suivre les migrations
pnpm db:seed                     # comptes système + données de démo

pnpm dev
# Frontend : http://localhost:3001
# Backend  : http://localhost:3000/api/v1
```

### Données de démonstration optionnelles

```bash
pnpm --filter @omnitech/database seed-cms          # 28 blocs CMS
pnpm --filter @omnitech/database seed-cms-pages    # 4 ContentPages juridiques
pnpm --filter @omnitech/database seed-wiki         # base wiki initiale
pnpm --filter @omnitech/database seed-news         # actualités
```

---

## Déploiement production

Le déploiement production est géré dans un **dépôt séparé** : `omnitech-intranet-deploy` (à venir).

Ce dépôt contiendra :

- `docker-compose.yml` + `docker-compose.prod.yml`
- `install.sh` interactif (détection OS, init secrets, prompts conf)
- Scripts ops : `backup.sh`, `restore.sh`, `upgrade.sh`, `healthcheck.sh`
- Configs nginx + BunkerWeb
- Templates Ansible (optionnels)

En attendant, la procédure manuelle complète est documentée dans [`docs/INSTALL_FROM_SCRATCH.md`](./docs/INSTALL_FROM_SCRATCH.md) et `docs/infrastructure/DOCKER_COMPOSE_PROD.md`.

---

## Variables d'environnement

Voir [`.env.example`](./.env.example) pour la liste exhaustive. Variables critiques :

```bash
# ─── App ────────────────────────────────────────────
NODE_ENV=development
APP_URL=http://localhost:3001

# ─── Database ───────────────────────────────────────
DATABASE_URL=postgresql://omnitech:CHANGE_ME@localhost:5432/omnitech_intranet
POSTGRES_USER=omnitech
POSTGRES_PASSWORD=CHANGE_ME_64_chars
POSTGRES_DB=omnitech_intranet

# ─── Redis ──────────────────────────────────────────
REDIS_HOST=localhost
REDIS_PORT=6379

# ─── JWT ────────────────────────────────────────────
# openssl rand -hex 32  ←  pour chaque secret
JWT_ACCESS_SECRET=CHANGE_ME_64_chars_random
JWT_REFRESH_SECRET=CHANGE_ME_64_chars_random

# ─── SMTP ───────────────────────────────────────────
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=intranet@omnitech-security.fr
SMTP_PASSWORD=CHANGE_ME

# ─── Services tiers (optionnels) ────────────────────
MEILI_HOST=http://localhost:7700
MEILI_MASTER_KEY=CHANGE_ME
OLLAMA_HOST=http://localhost:11434
DOCUSEAL_API_KEY=CHANGE_ME
DOCUSEAL_WEBHOOK_SECRET=CHANGE_ME

# ─── Observabilité (optionnel) ──────────────────────
SENTRY_DSN=
```

> ⚠️ **Sécurité** : ne JAMAIS committer un fichier `.env` rempli. Le `.gitignore` couvre `.env*` sauf `*.example`. Voir [`SECURITY.md`](./SECURITY.md).

---

## Scripts pnpm

| Commande           | Rôle                                                |
| ------------------ | --------------------------------------------------- |
| `pnpm dev`         | Backend + Frontend en parallèle (watch)             |
| `pnpm build`       | Build prod (NestJS + Next.js optimisé)              |
| `pnpm lint`        | ESLint strict (`--max-warnings 0`)                  |
| `pnpm typecheck`   | TypeScript sans émission                            |
| `pnpm verify`      | `db:generate + typecheck` (utilisé en CI)           |
| `pnpm format`      | Prettier sur `.ts/.tsx/.json/.css/.md`              |
| `pnpm test:e2e`    | Playwright                                          |
| `pnpm a11y`        | pa11y-ci (audit WCAG 2.1 AA)                        |
| `pnpm db:generate` | Génère le client Prisma                             |
| `pnpm db:push`     | Synchronise le schéma sans migration                |
| `pnpm db:migrate`  | Crée une nouvelle migration dev                     |
| `pnpm db:seed`     | Données de démo                                     |
| `pnpm clean`       | Purge `dist/`, `.next/`, `.turbo/`, `node_modules/` |

Voir aussi les scripts par package : `pnpm --filter @omnitech/backend ...`, etc.

---

## Tests

```bash
# Frontend (Vitest)
pnpm --filter @omnitech/frontend test          # 213 tests

# Backend (Jest)
pnpm --filter @omnitech/backend test           # 66 suites .spec.ts

# E2E (Playwright, services up requis)
pnpm test:e2e
pnpm test:e2e -- a11y.spec.ts                  # audit a11y axe-core
```

Le CI GitHub Actions exécute `lint-strict`, `e2e`, et `cdn-sync` sur chaque PR (`.github/workflows/`).

---

## Documentation

| Dossier                    | Contenu                                                          |
| -------------------------- | ---------------------------------------------------------------- |
| [`docs/cms/`](./docs/cms/) | Architecture CMS, admin guide, developer guide, **MIGRATION.md** |
| `docs/compliance/`         | Cartographie ISO 27001, RGPD, NIS2, ANSSI                        |
| `docs/architecture/`       | Décisions d'architecture (ADR), fusion modules                   |
| `docs/infrastructure/`     | HA Postgres/Patroni, CDN, backup Restic S3, Docker Compose       |
| `docs/chat/`               | Activation chatbot unifié, stratégie suggestions                 |
| `docs/rag/`                | Pipeline RAG, reranking, hybrid search                           |
| `docs/runbooks/`           | Procédures ops (SECRETS_ROTATION, INCIDENTS, etc.)               |
| `docs/i18n/`               | Stratégie next-intl (fr/en)                                      |
| `INSTALL_FROM_SCRATCH.md`  | Déploiement neuf Debian 12 (60–90 min)                           |
| `ADMIN_GUIDE.md`           | Gestion utilisateurs, chartes, workflows                         |
| `USER_GUIDE.md`            | Manuel utilisateur fonctionnel                                   |
| `FAQ.md`                   | Questions fréquentes (troubleshooting, accès)                    |
| `RELEASE_PROCESS.md`       | Versioning, tags, procédure de déploiement                       |
| `PCA-BACKUP.md`            | Plan de continuité, restauration complète                        |

---

## Roadmap

### Court terme

- [ ] Repo `omnitech-intranet-deploy` (installateur Docker Compose + `install.sh`)
- [ ] Multilingue effectif (FR + EN, seeder + sélecteur admin)
- [ ] Workflow CMS draft → review → publish + diff visuel (ISO A.5.33)
- [ ] Tests Playwright RBAC (matrice 8 rôles × 10 routes critiques)

### Moyen terme

- [ ] Stepper UX pour signatures multi-étapes, MFA setup, parcours chartes
- [ ] Storybook hébergé (Chromatic) + design system cataloguée
- [ ] Édition visuelle in-page (mode admin, crayon par bloc CMS)

### Long terme

- [ ] Webhooks CMS → Slack / Teams (notifications éditoriales)
- [ ] Brouillons multiples par bloc (A/B testing interne)
- [ ] Helm chart Kubernetes pour déploiement multi-cluster

---

## Contribuer

Ce repo est **propriétaire** (cf. [`LICENSE`](./LICENSE)). Les contributions sont limitées au propriétaire et aux collaborateurs autorisés par écrit.

Avant toute contribution, lire **[`CONTRIBUTING.md`](./CONTRIBUTING.md)** :

- Conventions de commit (Conventional Commits stricts)
- Workflow Git (branches `feat/`, `fix/`, `docs/`, `chore/`)
- Standards de code TypeScript
- Checklist sécurité avant push
- Procédures de test

Pour les vulnérabilités de sécurité, voir **[`SECURITY.md`](./SECURITY.md)** (canal RSSI / DPO / propriétaire, SLA accusé réception 4–24 h).

---

## Licence

**Logiciel propriétaire** — © 2024–2026 Julien MORIN CHOUKROUN. Tous droits réservés.

Voir [`LICENSE`](./LICENSE) pour les conditions complètes. Aucune redistribution, sous-licence ou republication n'est autorisée sans accord écrit préalable.

Les composants open-source intégrés conservent leur licence d'origine (voir `package.json` / `pnpm-lock.yaml`).

---

## Auteur

**Julien MORIN CHOUKROUN**
Conception, développement et maintenance de l'intranet OMNITECH Security.

- Email : `jmorin@omnitech-security.fr`
- GitHub : [@jmorin-info](https://github.com/jmorin-info)
- Entreprise (utilisateur du logiciel) : [OMNITECH Security](https://omnitech-security.fr)

---

<div align="center">

_Conçu pour la conformité, l'auditabilité et la souveraineté technique._

</div>
