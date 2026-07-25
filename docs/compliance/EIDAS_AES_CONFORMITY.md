# Conformité eIDAS AES — Signatures électroniques OMNITECH Intranet

> Wave D item 26 — réf. `apps/backend/src/signatures/evidence.service.ts`
> Date : 2026-04-28

## 1. Objectif

Documenter la conformité du flux de signature DocuSeal de l'intranet aux
exigences du règlement eIDAS (UE) n° 910/2014 niveau **AES — Signature
Électronique Avancée** (article 26).

Le système n'est PAS qualifié QES (article 28) : il ne fait pas appel à un
Prestataire de Services de Confiance Qualifié (PSCo) inscrit à la liste
trustservicelist eIDAS de la Commission. La QES nécessite un certificat
délivré par un PSCo qualifié (DocuSign Standards-Based Signing, Yousign Pro,
Universign, Certinomis…). Si une signature QES est requise, configurer
DocuSeal en mode passerelle vers un PSCo et la chaîne de certificats sera
automatiquement capturée dans `SignatureEvidence.certificateChain`.

## 2. Exigences AES (article 26 eIDAS)

Une signature électronique avancée doit satisfaire 4 critères :

| # | Exigence eIDAS | Mécanisme OMNITECH |
|---|---------------|--------------------|
| a | **Liée univoquement au signataire** | Compte intranet authentifié + MFA récente (12 h) requise via `@RequireFreshMfa` ; email + IP + UA capturés dans `SignatureEvidence` |
| b | **Permet d'identifier le signataire** | `SignatureEvidence.signerEmail` cross-référencé avec `User.id` ; nom/prénom snapshot dans `evidence.signer` |
| c | **Créée à l'aide de données que le signataire peut, avec un niveau de confiance élevé, utiliser sous son contrôle exclusif** | Boucle DocuSeal : email magic-link nominatif au signataire, action manuelle de signature dans son navigateur ; IP source enregistrée |
| d | **Liée aux données associées de manière à ce que toute modification ultérieure soit détectable** | Hash SHA-256 du PDF signé stocké dans `SignatureEvidence.documentHashSha256` ; toute altération du PDF invalide le hash |

## 3. Mapping ETSI EN 319 122 (CAdES-B-LT)

L'ETSI EN 319 122 définit 4 niveaux de signature CAdES :

- **B-B** (Basic) : signature minimale
- **B-T** (Time) : signature + horodatage
- **B-LT** (Long Term) : signature + horodatage + révocation
- **B-LTA** (Long Term with Archive) : B-LT + horodatages d'archive

OMNITECH Intranet vise **B-LT** :

| Composant CAdES B-LT | Champ `SignatureEvidence` | Note |
|---------------------|---------------------------|------|
| `SignedData.signerInfos[].signature` | `signedFileUrl` (PDF DocuSeal) | Le PDF signé contient la signature CMS |
| `signing-time` attribute | `signedAt` | UTC ISO 8601 |
| `content-hash` (SHA-256) | `documentHashSha256` | Calculé par EvidenceService au moment du webhook |
| `signing-certificate-v2` | `certificateChain` (PEM) | Présent uniquement pour QES |
| `signature-time-stamp-token` (RFC 3161) | `tsa` (base64) | Optionnel via `TSA_URL` |
| `archive-time-stamp` | — | Hors scope B-LT, prévu pour B-LTA |

## 4. Flux de capture des preuves

```
DocuSeal (PSCo non qualifié)
    ↓ POST /signatures/webhook (HMAC-SHA256 verifié) — POINT D'ENTRÉE UNIQUE
WebhookController.handleWebhook(payload, { ip, ua })
    ↓
SignaturesService.handleWebhook
    ├─ UPDATE SignatureRequest.status = 'SIGNED'
    └─ EvidenceService.captureEvidence(sig.id, { ip, ua })
        ├─ Hash SHA-256 du PDF signé (depuis payload OU télécharge URL)
        ├─ Identité signataire (email + IP + UA)
        ├─ Si TSA_URL configuré : POST RFC 3161 → TimeStampToken base64
        ├─ Si payload.signature.certificate présent : chaîne PEM (QES)
        └─ INSERT SignatureEvidence avec snapshot complet du payload
    ↓ (chaîne de responsabilité)
CampaignsService.handleWebhook — met à jour la CampaignSignature legacy,
    rattachement STRICT par submissionId (jamais par email)
```

L'ancien endpoint `POST /signature-campaigns/webhook/docuseal` (vérification
plus faible : secret en clair toujours accepté) répond désormais **410 Gone**
et journalise l'appel : reconfigurer DocuSeal sur `/signatures/webhook`.

### 4.1 Garanties amont — aucune signature sans preuve possible

- `POST /signatures/request` **échoue en 503** si DocuSeal ne renvoie pas de
  `submission_id` : plus aucune `SignatureRequest` fantôme
  (`docusealSubmissionId = null`) que le webhook ne pourrait jamais compléter.
- La signature « au clic » sans DocuSeal (`PATCH /signatures/:id/sign`) est
  **désactivée par défaut** (`SIGNATURES_ALLOW_DIRECT=false`) et retirée de
  l'UI : elle ne produit aucune `SignatureEvidence`.
- Un **cron de réconciliation** (toutes les 6 h,
  `signatures/evidence-reconciliation.cron.ts`) reprend les
  `SignatureRequest` `SIGNED` sans `SignatureEvidence`, re-interroge l'API
  DocuSeal et capture la preuve a posteriori.

## 5. Variables d'environnement

| Variable | Default | Description |
|----------|---------|-------------|
| `DOCUSEAL_WEBHOOK_SECRET` | (vide) | Secret HMAC-SHA256 de vérification webhook DocuSeal |
| `DOCUSEAL_WEBHOOK_SECRET_HMAC_MODE` | `true` | Si `false`, comparaison clear-text legacy DEPRECATED |
| `SIGNATURES_ALLOW_DIRECT` | `false` | Autorise la signature au clic sans DocuSeal ni preuve. Rollback d'urgence uniquement — les signatures produites n'ont aucune valeur probante |
| `TSA_URL` | (vide) | Endpoint RFC 3161 (ex: `http://timestamp.digicert.com`). Sans cela, `tsa` est null (preuve toujours valide AES) |

## 6. Endpoints exposés

| Méthode | Route | RBAC | Description |
|---------|-------|------|-------------|
| `GET`   | `/signatures/:id/evidence` | Signataire / Demandeur / ADMIN+ / DIRECTION | Métadonnées des preuves (sans payload brut) |
| `GET`   | `/signatures/:id/evidence-report` | idem | PDF "Preuve de signature" eIDAS-AES généré via `pdf-lib` |

Le PDF retourné inclut le hash SHA-256 du rapport lui-même dans le header
HTTP `X-Report-SHA256` pour que le destinataire puisse vérifier l'intégrité
du rapport.

## 7. Conservation des preuves

- **Durée légale** : 6 ans en France (Code de commerce L123-22) pour les
  documents commerciaux ; 10 ans pour les documents engageants la
  responsabilité de l'entreprise (CGU, contrats clients).
- **Suppression** : `SignatureEvidence` est en cascade DELETE de
  `SignatureRequest` mais cette dernière n'est jamais supprimée
  physiquement (soft-delete sur `Document` → `DocumentVersion` reste).
- **Audit** : chaque consultation/export du rapport est tracée dans
  `AuditLog` (action `SIGNATURE_EVIDENCE_REPORT_EXPORTED`) pour détecter
  les fuites (ISO 27001 A.5.34 / RGPD article 30).

## 8. Limitations connues

1. **Hash placeholder** : si DocuSeal ne fournit pas le hash dans le
   payload ET que `signedFileUrl` est inaccessible, `documentHashSha256`
   est sauvegardé comme `"unavailable"`. Un job de réconciliation peut
   recalculer le hash a posteriori (TODO).
2. **TSA non-qualifié** : le client RFC 3161 actuel est minimaliste (POST
   du hash, retour token base64). Pour QES via TSA qualifié, intégrer une
   bibliothèque ASN.1 dédiée (ex: `pkijs`).
3. **Pas de signature LTV** : pas d'embedding du TSA dans le PDF lui-même
   (LongTermValidation). Acceptable pour AES, mais à prévoir si évolution
   vers QES.

## 9. Références

- Règlement eIDAS (UE) 910/2014 — articles 25, 26, 28
- ETSI EN 319 122-1 v1.2.1 (2022-04) — CAdES Baseline
- ETSI EN 319 102-1 v1.4.1 — Procedures for creation/validation of AdES
- RFC 3161 — Internet X.509 PKI Time-Stamp Protocol (TSP)
- ANSSI — Référentiel Général de Sécurité (RGS) v2.0, annexe B7
