# Diagrammes d'architecture — OMNITECH Intranet

Diagrammes Mermaid (rendus nativement par GitHub). À tenir à jour quand
l'architecture évolue.

## 1. Architecture système (vue déploiement)

```mermaid
flowchart TB
    User([Utilisateur])
    Admin([Admin / RSSI])

    subgraph Edge["Edge"]
        BW[BunkerWeb / Nginx<br/>TLS · WAF · rate-limit]
    end

    subgraph App["Couche applicative"]
        FE[Frontend<br/>Next.js 15 · SSR]
        BE[Backend<br/>NestJS 11 · REST + WS]
    end

    subgraph Data["Couche données"]
        PG[(PostgreSQL 16<br/>+ pgvector)]
        RD[(Redis 7<br/>cache · BullMQ)]
        MS[(Meilisearch<br/>full-text)]
    end

    subgraph Services["Services tiers"]
        OL[Ollama<br/>LLM + embeddings]
        DS[DocuSeal<br/>e-signature]
        OO[OnlyOffice<br/>édition docs]
        ST[Stirling PDF]
    end

    User --> BW
    Admin --> BW
    BW --> FE
    BW --> BE
    FE -.SSR fetch.-> BE
    BE --> PG
    BE --> RD
    BE --> MS
    BE --> OL
    BE --> DS
    BE --> OO
    BE --> ST
```

## 2. Hiérarchie RBAC (8 rôles)

```mermaid
flowchart TD
    SA["SUPER_ADMIN — 100<br/>accès total + infra"]
    AD["ADMIN — 80<br/>gestion users + approbations"]
    DI["DIRECTION — 60<br/>chartes + incidents critiques"]
    MA["MANAGER — 50<br/>validations équipe"]
    RE["REVIEWER — 40<br/>review docs + audit + access reviews"]
    CO["COLLABORATEUR — 20<br/>créer/consulter docs, tickets, wiki"]
    AU["AUDITEUR — 10<br/>lecture audit-logs, rapports"]
    PR["PRESTATAIRE — 5<br/>sidebar simplifiée + chartes obligatoires"]

    SA --> AD --> DI --> MA --> RE --> CO --> AU --> PR

    classDef high fill:#892034,color:#fff,stroke:#892034;
    classDef mid fill:#296dc1,color:#fff,stroke:#296dc1;
    classDef low fill:#837274,color:#fff,stroke:#837274;
    class SA,AD high;
    class DI,MA,RE mid;
    class CO,AU,PR low;
```

> Le `RolesGuard` valide via `userRoleLevel >= ROLE_HIERARCHY[requiredRole]`.
> `@Roles(COLLABORATEUR)` autorise donc COLLABORATEUR (20) et tout rôle au-dessus.

## 3. Cycle de vie documentaire (GED)

```mermaid
stateDiagram-v2
    [*] --> DRAFT : création
    DRAFT --> REVIEWED : soumission revue
    REVIEWED --> DRAFT : corrections demandées
    REVIEWED --> APPROVED : approbation (workflow A.5.1)
    APPROVED --> PUBLISHED : publication
    PUBLISHED --> ARCHIVED : fin de vie
    ARCHIVED --> [*] : purge RGPD A.8.3 (rétention 7 ans)

    PUBLISHED --> REVIEWED : nouvelle version
```

## 4. Flux CMS (édition → affichage)

```mermaid
sequenceDiagram
    participant A as Admin
    participant API as Backend /admin/content
    participant DB as PostgreSQL (ContentBlock)
    participant FE as Frontend (Server Component)
    participant V as Visiteur

    A->>API: PATCH bloc (éditeur form-driven)
    API->>DB: upsert ContentBlock (status PUBLISHED)
    A->>API: POST /api/cms/revalidate
    API-->>FE: revalidateTag('cms')
    V->>FE: GET /welcome
    FE->>API: getContentBlocks(keys, locale)
    API->>DB: SELECT blocs PUBLISHED
    DB-->>API: blocs JSON
    API-->>FE: ContentBlocksMap (cache 5 min)
    FE-->>V: HTML rendu (fallback hardcodé si bloc vide)
```

## 5. Modèle de données simplifié (entités centrales)

```mermaid
erDiagram
    User ||--o{ Document : "crée"
    User ||--o{ Ticket : "ouvre"
    User ||--o{ ChartesSignature : "signe"
    User ||--o{ AuditLog : "génère"
    User {
        uuid id
        string email
        enum role "8 niveaux RBAC"
        bool mfaEnabled
    }
    Document ||--o{ DocumentVersion : "versionne"
    Document ||--o{ ValidationRequest : "déclenche"
    Charte ||--o{ ChartesSignature : "reçoit"
    Charte ||--o{ CharteVersion : "versionne"
    Ticket ||--o{ TicketComment : "contient"
    ContentBlock {
        string key
        string locale
        json data
        enum status
    }
    ContentPage {
        string slug
        string locale
        text content
        enum status
    }
```

> ERD volontairement simplifié (5 entités sur 102). Schéma complet :
> `packages/database/prisma/schema.prisma`.
