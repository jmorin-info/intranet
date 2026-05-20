# Politique de sécurité — OMNITECH Intranet

## Reporting d'une vulnérabilité

**Ne pas créer d'issue GitHub publique pour une vulnérabilité de sécurité.**
Au contraire :

| Canal                               | Destinataire                  | Délai d'accusé de réception |
| ----------------------------------- | ----------------------------- | --------------------------- |
| Email RSSI                          | `rssi@omnitech-security.fr`   | 4h ouvrées                  |
| Email DPO (si données personnelles) | `dpo@omnitech-security.fr`    | 4h ouvrées                  |
| Propriétaire du code                | `jmorin@omnitech-security.fr` | 24h                         |

Inclure dans le rapport :

- Description claire de la vulnérabilité
- Étapes pour la reproduire (proof of concept apprécié)
- Versions impactées (commit SHA si possible)
- Impact estimé (lecture / modification / destruction / contournement RBAC)
- Vos coordonnées pour le suivi

## Périmètre

Sont considérés comme vulnérabilités les comportements suivants :

- Authentification contournable (bypass MFA, sessions hijack)
- Injection (SQL, command, XSS stored/reflected, XXE)
- Authorization defects (élévation de privilèges, IDOR, RBAC bypass)
- Exposition de secrets (credentials, tokens, clés cryptographiques)
- CSRF sur les endpoints d'écriture
- Failles cryptographiques (faiblesse JWT, secrets faibles, mauvais TLS)
- Fuites de données personnelles (RGPD A.32)
- Vulnérabilités des dépendances NPM/Docker (CVE critiques)

**Hors périmètre** :

- Bug fonctionnel sans impact sécurité (utiliser GitHub Issues normales)
- Bruit d'outils automatisés sans démonstration d'impact réel
- Vulnérabilités de services tiers (BunkerWeb, DocuSeal…) — à reporter
  directement chez l'éditeur

## Engagement du propriétaire / RSSI

- Accusé de réception sous **24h** (4h pour incident critique)
- Diagnostic complet sous **5 jours ouvrés**
- Patch ou plan de remédiation sous **30 jours** (priorité haute) ou
  **90 jours** (priorité basse), selon le CVSS et l'exposition
- Communication coordonnée avec le reporter avant disclosure publique

## Bonnes pratiques côté contributeur

- Suivre la checklist sécurité dans [`CONTRIBUTING.md`](./CONTRIBUTING.md)
- Ne jamais commiter de secrets (cf. `.gitignore` qui couvre `.env*`,
  `vapid-keys.*`, `secrets/*.txt`, etc.)
- Toute nouvelle route backend doit avoir un `@Roles(...)` explicite
- HTML user-généré : passer par `sanitizeRichText()` (backend) **et**
  `<SafeHtml>` (frontend) — defense in depth
- CSP nonce obligatoire pour tout `<script>` inline injecté côté serveur
- Tokens / cookies : `httpOnly`, `Secure`, `SameSite=Strict`

## Conformité

Le projet vise le respect de :

- **ISO/IEC 27001:2022** — SMSI complet avec 93 contrôles Annex A
- **RGPD** (Règlement UE 2016/679) — registre des traitements, DPO désigné
- **NIS2** (directive 2022/2555) — cyber-résilience secteur essentiel
- **Recommandations ANSSI** — guide d'hygiène informatique, SecNumCloud

Voir `docs/compliance/` pour les contrôles détaillés.

## Audits

- Tests RBAC automatisés (Playwright) — `e2e/`
- Audit a11y (axe-core, WCAG 2.1 AA) — `e2e/a11y.spec.ts`
- Audit dépendances : `pnpm audit` (à intégrer en CI)
- Scan secrets pré-commit : recommander `gitleaks` ou `trufflehog`

## Historique des incidents

Les incidents matériels sont consignés dans `docs/runbooks/INCIDENTS.md`
(si présent) avec leur RCA. Conservation 3 ans (recommandation ANSSI).

## Rotation des secrets

Voir `docs/runbooks/SECRETS_ROTATION.md` pour la procédure complète
(POSTGRES_PASSWORD, JWT_SECRET, STORAGE_SECRET, VAPID keys, SMTP, etc.).

Fréquence recommandée :

- JWT_SECRET : 90 jours (avec invalidation forcée des tokens)
- POSTGRES_PASSWORD : 180 jours
- API keys tiers (DocuSeal, SMTP) : 365 jours ou à la moindre suspicion
- Certificats TLS : auto-renouvelés via Let's Encrypt
