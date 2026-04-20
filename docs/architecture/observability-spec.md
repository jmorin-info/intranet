# Observability Specification — OMNITECH Intranet

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    OBSERVABILITY LAYER                        │
├──────────────────────┬───────────────────────────────────────┤
│     FRONTEND         │              BACKEND                   │
│                      │                                        │
│  Error Tracking      │  Structured Logging                    │
│  ├ captureError()    │  ├ requestId per request               │
│  ├ error buffer      │  ├ userId + tenantId in context        │
│  └ Sentry-ready      │  └ JSON format (ELK-ready)            │
│                      │                                        │
│  API Performance     │  Request Lifecycle                     │
│  ├ trackApiCall()    │  ├ start → handler → response          │
│  ├ latency + status  │  ├ duration tracking                   │
│  └ 200-entry buffer  │  └ slow query detection                │
│                      │                                        │
│  Page Performance    │  Health Checks                         │
│  ├ trackPageLoad()   │  ├ /health (DB, Redis, LDAP, SMTP)    │
│  ├ web vitals        │  ├ /health/metrics (Prometheus)        │
│  └ navigation timing │  └ /health/stats (system counts)      │
│                      │                                        │
│  Usage Analytics     │  Audit Logging                         │
│  ├ page views        │  ├ AuditLog model                      │
│  ├ feature usage     │  ├ action + resource + IP              │
│  └ 7-day rolling     │  └ severity levels                     │
└──────────────────────┴───────────────────────────────────────┘
```

## Metric Definitions

### Frontend Metrics
| Metric | Type | Collection | Retention |
|--------|------|------------|-----------|
| page_view | counter | Every navigation | 7 days (localStorage) |
| api_call_duration_ms | histogram | Every API call | 200 entries (memory) |
| api_error_rate | gauge | Computed from buffer | Real-time |
| page_load_ms | histogram | PerformanceObserver | 100 entries (memory) |
| error_count | counter | Error boundary + try/catch | 50 entries (memory) |

### Backend Metrics (existing)
| Metric | Endpoint | Format |
|--------|----------|--------|
| system_health | GET /health | JSON |
| prometheus_metrics | GET /health/metrics | text/plain |
| system_stats | GET /health/stats | JSON |

## Dashboard Model

### 1. System Health Dashboard
- Service status (DB, Redis, LDAP, SMTP, Meilisearch, Ollama)
- Uptime
- Memory usage
- Active user count

### 2. API Performance Dashboard
- Request volume (last 24h)
- Average latency by endpoint
- Error rate by status code
- Slowest endpoints (top 5)

### 3. User Activity Dashboard
- Active users (DAU/WAU/MAU)
- Top pages by visits
- Module usage distribution
- Peak usage hours

### 4. Security Dashboard
- Failed login attempts
- MFA adoption rate
- RBAC coverage
- Audit log volume

### 5. AI Copilot Dashboard
- Interaction count
- Top queries
- RAG hit rate
- Intent classification distribution

## Implementation Status
- ✅ Frontend observability library (lib/observability/index.ts)
- ✅ Backend health endpoints (3 endpoints)
- ✅ Audit logging (AuditLog model)
- ✅ Usage tracking (lib/intelligence/usage-tracker.ts)
- ⬜ Sentry integration (ready — replace captureError internals)
- ⬜ Structured backend logging (add requestId middleware)
- ⬜ Grafana dashboards (Prometheus metrics already exposed)
