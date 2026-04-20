# API Versioning Plan — OMNITECH Intranet

## Current State
- All endpoints under `/api/` (no version prefix)
- 450 total endpoints across 66 controllers
- 19 public endpoints, 431 authenticated

## Target State
- `/api/v1/` prefix for all existing endpoints
- Backward compatibility layer at `/api/` → `/api/v1/` redirect
- Version header support: `Accept-Version: v1`

## Migration Strategy

### Phase 1: Add version prefix (non-breaking)
```
BEFORE: GET /api/documents
AFTER:  GET /api/v1/documents  (new canonical)
        GET /api/documents     (redirect → /api/v1/documents)
```

Implementation:
1. In `main.ts`, change `app.setGlobalPrefix('api')` to `app.setGlobalPrefix('api/v1')`
2. Add redirect middleware: `/api/*` → `/api/v1/*` for backward compatibility
3. Update frontend `NEXT_PUBLIC_API_URL` from `/api` to `/api/v1`
4. Public endpoints: `/api/v1/public/*`

### Phase 2: Frontend migration
- Update `api.ts` baseURL
- Update `welcome/page.tsx` API constant
- Update middleware.ts cookie path if needed

### Phase 3: Deprecation headers
- Add `Deprecation: true` header on `/api/*` (non-versioned) responses
- Add `Sunset: 2026-07-01` header
- Log deprecated endpoint usage

### Risk Assessment
- LOW: Frontend is single consumer (no external API clients)
- MEDIUM: Cookie path `/api/auth/refresh` must be updated to `/api/v1/auth/refresh`
- LOW: Public endpoints (/public/*) consumers are the portal page only

### Estimated Effort: 2-4 hours
