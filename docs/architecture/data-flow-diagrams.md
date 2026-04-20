# Data Flow Architecture — OMNITECH Intranet

## System Overview

```
┌─────────┐     ┌──────────────────┐     ┌─────────────────┐
│ Browser  │────▶│  Next.js 15      │────▶│  NestJS 11      │
│ (React)  │◀────│  Frontend :3001  │◀────│  Backend :3000   │
└─────────┘     └──────────────────┘     └────────┬────────┘
                                                   │
                                         ┌─────────┴─────────┐
                                         │                     │
                                    ┌────▼────┐         ┌─────▼─────┐
                                    │PostgreSQL│         │   Redis    │
                                    │  (Prisma)│         │ (Cache+Q) │
                                    └─────────┘         └───────────┘
```

## Document Flow

```
User                Frontend              Backend               Database
 │                    │                     │                      │
 ├─ Create ──────────▶│                     │                      │
 │                    ├─ POST /documents ──▶│                      │
 │                    │                     ├─ validate DTO ──────▶│
 │                    │                     ├─ check RBAC ────────▶│
 │                    │                     ├─ prisma.create ─────▶│ INSERT
 │                    │                     ├─ emit event ─────────│
 │                    │                     ├─ audit log ──────────│
 │                    │◀── 201 Created ─────┤                      │
 │◀── toast.success ──┤                     │                      │
 │                    │                     │                      │
 ├─ View ────────────▶│                     │                      │
 │                    ├─ GET /documents/:id─▶│                     │
 │                    │                     ├─ findFirst ─────────▶│ SELECT
 │                    │                     │  (where: deletedAt   │
 │                    │                     │   null, RBAC check)  │
 │                    │◀── 200 + data ──────┤                      │
 │◀── render page ────┤                     │                      │
 │                    │                     │                      │
 ├─ Workflow ────────▶│                     │                      │
 │                    ├─ POST /workflow/    │                      │
 │                    │  submit-for-review  │                      │
 │                    │                    ▶│                      │
 │                    │                     ├─ update status ─────▶│ UPDATE
 │                    │                     ├─ create notification─▶│ INSERT
 │                    │                     ├─ send email ─────────│ (SMTP)
 │                    │                     ├─ audit log ──────────│
 │                    │◀── 200 OK ──────────┤                      │
```

## Public Portal Flow

```
Visitor             Welcome Page           Public API           Database
 │                    │                     │                      │
 ├─ Load /welcome ──▶│                     │                      │
 │                    ├─ fetch() /public/   │                      │
 │                    │   info ────────────▶│                      │
 │                    │   news ────────────▶│─ isPublished:true ──▶│ SELECT
 │                    │   documents ───────▶│─ isPublic:true,     │
 │                    │                     │  APPROVED ──────────▶│ SELECT
 │                    │   veille ──────────▶│─ all items ─────────▶│ SELECT
 │                    │                     │                      │
 │                    │◀── JSON responses ──┤                      │
 │◀── render portal ──┤                     │                      │
 │                    │                     │                      │
 │ [doc: HTML type]   │                     │                      │
 ├─ "Consulter" ────▶│ /login?redirect=   │                      │
 │                    │ /documents/:id      │ (requires auth)      │
 │                    │                     │                      │
 │ [doc: file type]   │                     │                      │
 ├─ "Télécharger" ──▶│ /api/public/       │                      │
 │                    │ documents/:id/      │                      │
 │                    │ download ──────────▶│─ stream file ───────▶│ BLOB
```

## AI Copilot Flow

```
User                Chatbot UI           Copilot Layer          Backend
 │                    │                     │                      │
 ├─ Open chatbot ───▶│                     │                      │
 │                    ├─ getPageContext() ──▶│                     │
 │                    │◀── actions + help ──┤                      │
 │                    │                     │                      │
 ├─ Ask question ───▶│                     │                      │
 │                    ├─ generateResponse()─▶│                     │
 │                    │  [1] intent match ──▶│ (local heuristics)  │
 │                    │  [2] module help ───▶│ (static knowledge)  │
 │                    │  [3] RAG fallback ──▶│                     │
 │                    │                     ├─ POST /rag/ask ─────▶│
 │                    │                     │  (if features.ai)    │
 │                    │                     │◀── answer + sources ─┤
 │                    │◀── response ────────┤                      │
 │◀── display msg ───┤                     │                      │
 │                    │                     │                      │
 ├─ Click action ───▶│                     │                      │
 │                    ├─ executeAction() ──▶│                     │
 │                    │  router.push(href)  │ (UI-only, no API)    │
 │◀── navigate ──────┤                     │                      │
```

## Ticket Flow

```
User              Frontend            Backend              Database        Email
 │                  │                   │                     │              │
 ├─ Create ────────▶│                   │                     │              │
 │                  ├─ POST /tickets ──▶│                     │              │
 │                  │                   ├─ nextReference() ──▶│ SELECT seq  │
 │                  │                   ├─ prisma.create ────▶│ INSERT      │
 │                  │                   ├─ notify assignee ──▶│ INSERT      ──▶│ send
 │                  │                   ├─ audit log ────────▶│ INSERT      │
 │                  │◀── 201 + ticket ──┤                     │              │
 │◀── toast + nav ──┤                   │                     │              │
 │                  │                   │                     │              │
 ├─ Update status ─▶│                   │                     │              │
 │                  ├─ PATCH /tickets  │                     │              │
 │                  │   /:id ──────────▶│                     │              │
 │                  │                   ├─ validate status ──▶│ UPDATE      │
 │                  │                   ├─ invalidate cache ──│ Redis DEL   │
 │                  │◀── 200 OK ────────┤                     │              │
 │◀── eventBus ─────┤ (cross-module)    │                     │              │
```

## Authentication Flow

```
User              Frontend            Backend              Database        Redis
 │                  │                   │                     │              │
 ├─ Login ─────────▶│                   │                     │              │
 │                  ├─ POST /auth/login▶│                     │              │
 │                  │                   ├─ LDAP auth ────────▶│ (AD server) │
 │                  │                   │  OR bcrypt verify ──▶│ SELECT user │
 │                  │                   ├─ check MFA ────────▶│ (if enabled)│
 │                  │                   ├─ generate JWT ──────│              │
 │                  │                   ├─ save refresh ─────▶│ INSERT token│
 │                  │                   ├─ set idle timer ───▶│              ──▶│ SET key
 │                  │                   ├─ audit log ────────▶│ INSERT      │
 │                  │◀── access + cookie┤                     │              │
 │◀── store token ──┤                   │                     │              │
 │   redirect /dash │                   │                     │              │
 │                  │                   │                     │              │
 ├─ [15 min idle] ─▶│                   │                     │              │
 │                  │                   │                     │              │
 ├─ API call ──────▶│                   │                     │              │
 │                  ├─ GET /any ────────▶│                     │              │
 │                  │                   ├─ check idle ───────▶│              ──▶│ GET key
 │                  │                   │  (expired!) ────────│              │  │ NULL
 │                  │◀── 401 ───────────┤                     │              │
 │                  ├─ POST /auth/      │                     │              │
 │                  │   refresh ────────▶│                     │              │
 │                  │                   ├─ validate cookie ──▶│ SELECT token│
 │                  │                   ├─ new access JWT ────│              │
 │                  │◀── new token ─────┤                     │              │
 │◀── retry API ────┤                   │                     │              │
```
