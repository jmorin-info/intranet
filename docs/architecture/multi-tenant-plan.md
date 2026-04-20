# Multi-Tenant Architecture Plan — OMNITECH Intranet

## Current State
- Single-tenant (one company: OMNITECH Security)
- No tenantId in any model
- Data isolation via departmentId + role-based access
- 68 Prisma models, all company-scoped

## Recommended Approach: Shared Database, Row-Level Isolation

### Why not separate databases per tenant?
- Overkill for <100 tenants
- Prisma doesn't support runtime DB switching natively
- Operational complexity (migrations per tenant)

### Row-Level Isolation Pattern
```prisma
model Document {
  id        String @id @default(uuid())
  tenantId  String @default("omnitech") // NEW
  title     String
  ...
  @@index([tenantId])
}
```

### Implementation Phases

#### Phase 1: Schema Migration (2-3 days)
1. Add `tenantId String @default("omnitech")` to all 68 models
2. Add `@@index([tenantId])` to all models
3. Run migration: all existing rows get `tenantId = "omnitech"`
4. No code changes — backward compatible

#### Phase 2: Middleware Tenant Resolution (1 day)
```typescript
// NestJS middleware
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Resolve tenant from: subdomain, header, or JWT claim
    req['tenantId'] = this.resolveTenant(req);
    next();
  }
}
```

#### Phase 3: Service Layer Filtering (2-3 days)
```typescript
// All service queries include tenantId
findAll(tenantId: string) {
  return this.prisma.document.findMany({
    where: { tenantId, deletedAt: null },
  });
}
```

#### Phase 4: Frontend Tenant Context (1 day)
- Add tenantId to auth-store
- Propagate in API headers: `X-Tenant-Id`

### Data Classification

| Type | Isolation | Example |
|------|-----------|---------|
| Tenant-specific | Per-tenant | Documents, Tickets, Users |
| Shared reference | Global | ISO controls, framework templates |
| System config | Global | App config, feature flags |

### Security Rules
- NEVER allow cross-tenant query (even for SUPER_ADMIN)
- Tenant resolution MUST happen before any DB access
- Public endpoints use no tenantId (shared content)
- Audit logs include tenantId for forensics

### Risk Assessment
- HIGH: Migration of 68 models is a large schema change
- MEDIUM: All service methods need tenantId parameter
- LOW: Frontend changes are minimal (header propagation)

### Estimated Effort: 2-3 weeks
