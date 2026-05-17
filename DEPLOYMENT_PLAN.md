# Story Graph — Cloud Deployment Plan (AWS)

> Status: Planning. No implementation has started. This document is the spec
> from which the phased work is executed.

## 1. Decisions (confirmed)

| Area    | Choice                                  |
|---------|-----------------------------------------|
| Compute | AWS App Runner (container from ECR)      |
| Auth    | Amazon Cognito User Pool + social IdPs  |
| DB      | RDS PostgreSQL `db.t4g.micro`, single-AZ |
| IaC     | AWS CDK                                  |
| Target  | ~10 concurrent users, cost-minimized    |

## 2. Target Architecture

```
Browser (React SPA)
  │  1. Auth Code + PKCE
  ▼
Cognito Hosted UI ──federates──► Google / Apple / Microsoft (Entra)
  │  2. JWT (id/access token)
  ▼
React SPA  ──Bearer JWT──►  App Runner (FastAPI, 1 container)
                                  │ validates JWT vs Cognito JWKS
                                  │ VPC Connector (private egress only)
                                  ▼
                            RDS PostgreSQL (private subnet)
```

- One container image (multi-stage: build SPA → serve via FastAPI). Same-origin,
  so no CORS surface except the Cognito redirect.
- Backend is **stateless** after migration (mandatory for horizontal scale).
- No NAT Gateway: App Runner reaches the internet (Cognito JWKS) on its default
  egress and reaches RDS through the VPC connector. This removes the single
  biggest avoidable cost (~$32/mo/NAT).

## 3. Required Architectural Changes

### 3.1 Data model / multi-tenancy (the largest change)
- New `users` table keyed by Cognito `sub` (JIT-provisioned on first login).
  Store only `sub`, `email`, `display_name` — no credentials/PII beyond that.
- `story_graphs.owner_id → users.id`.
- New `story_collaborators(story_graph_id, user_id, role)` with
  `role ∈ {owner, editor, viewer}` for sharing/collaboration.
- **Every** query currently returning global data must be scoped to stories the
  caller owns or collaborates on. This touches all routers
  (`nodes`, `relationships`, `graph`, `node_types`, `tags`, `rel_types`,
  `story_graphs`). The existing `graph_id` scoping is reused, with an added
  access check.
- Node positions move from browser `localStorage` to a
  `story_node_positions(story_graph_id, user_id, node_id, x, y)` table.
  Default = per-user layout (avoids collaborators fighting over layout); a
  "shared layout" toggle is a later option.

### 3.2 SQLite → PostgreSQL
- Rewrite `backend/database.py` onto SQLAlchemy Core (or `psycopg`); swap `?`
  placeholders for parameterized SQLAlchemy, `AUTOINCREMENT` → `IDENTITY`,
  `GROUP_CONCAT` → `string_agg`, etc.
- Replace the ad-hoc try/except `ALTER TABLE` loop in `init_db()` with **Alembic**
  migrations (real schema versioning).

### 3.3 Auth & API authorization
- FastAPI dependency `get_current_user`: verify JWT signature against cached
  Cognito JWKS, check `iss`/`aud`/`exp`, resolve `sub` → users row.
- Helper `assert_story_access(story_id, user, min_role)` called by every
  story-scoped endpoint.
- All endpoints gain `Depends(get_current_user)`.

### 3.4 Frontend
- Add `react-oidc-context` (lightweight) for the Cognito PKCE flow; gate the app
  behind login.
- `api.js`: attach `Authorization: Bearer <token>` + token refresh.
- Story selector becomes **My Stories** + **Shared with me**; add a share dialog
  (invite by email → role). Note: changing share permissions is a sensitive
  action and stays a deliberate, explicit user action in the UI.

### 3.5 Collaboration scope
- **Phase 1:** shared access (multiple users read/write a story), last-write-wins
  + refresh. Adequate for 10 users.
- **Phase 2 (later, out of scope here):** real-time presence/CRDT over
  WebSockets (API Gateway WS or AppSync). Flagged, not built now.

## 4. AWS Infra (CDK stack contents)

- VPC: 2 AZs, public + private subnets, **no NAT**.
- ECR repository (lifecycle policy: keep last 5 images).
- Cognito: User Pool, app client (PKCE, no secret), hosted-UI domain, 3 federated
  IdPs (config only — see §6 for what you must register yourself).
- RDS PostgreSQL `db.t4g.micro`, single-AZ, 20 GB gp3, 7-day backups, private
  subnet, SG allows only the App Runner VPC-connector SG.
- App Runner service: 0.25 vCPU / 0.5 GB, min 1 / max 3 instances, autoscale by
  concurrency, env from SSM Parameter Store **SecureString** (cheaper than
  Secrets Manager; aligns with cost-min), VPC connector to RDS, ECR auto-deploy.
- CloudWatch log retention: 14 days.
- Optional: Route53 + ACM for a custom domain (note: domain registration is
  yours to do).

## 5. Cost Estimate (~10 users, low traffic)

| Item                         | Monthly |
|------------------------------|---------|
| App Runner (0.25 vCPU/0.5GB) | $5–10   |
| RDS t4g.micro + 20GB gp3     | ~$14    |
| Cognito (<50k MAU)           | $0      |
| ECR / CloudWatch / transfer  | $2–4    |
| Route53 (if custom domain)   | $0.50   |
| **Total**                    | **~$22–30/mo** |

Scalability levers when needed: raise App Runner max instances (stateless →
safe), resize RDS or add a read replica, optionally add CloudFront for static
assets. The hard prerequisite for scaling — eliminating all instance-local
state — is handled by the §3.2/§3.1 work.

## 6. What YOU must do (cannot be automated for you)

These involve account creation / credential handling and must be done by you
directly — I will provide exact step lists but will not create accounts or
handle these secrets:

1. Create/own the AWS account and set a billing budget alarm.
2. Register OAuth apps in **Google Cloud Console**, **Apple Developer**, and
   **Microsoft Entra ID**; obtain each client ID/secret. You enter these into
   SSM Parameter Store yourself.
3. Register a domain (if you want a custom one).
4. Approve `cdk deploy` and review IAM before first apply.

## 7. Phased Plan with Model Assignment

Model tiers by cost (low→high): **Haiku** < **Sonnet** < **Opus**. Principle:
the cheapest model that can do the task correctly does it; Opus is reserved for
security-sensitive design and anything where a mistake is expensive. I
(claude-opus-4-7) do only the Opus-tier items.

### Phase 0 — Scaffolding
| Task | Complexity | Model | Why |
|---|---|---|---|
| Multi-stage Dockerfile (Node build → Python serve) | Low | **Haiku** | Mechanical, well-known pattern |
| `.dockerignore`, env var wiring, README updates | Low | **Haiku** | Boilerplate |
| Repo restructure for `infra/` (CDK) skeleton | Low | **Haiku** | Templated `cdk init` + tidy |

### Phase 1 — Database migration
| Task | Complexity | Model | Why |
|---|---|---|---|
| Postgres data model + collaboration schema design | High | **Opus** | Multi-tenant correctness, FK/role design |
| Alembic setup + initial migration from design | Medium | **Sonnet** | Translates a fixed spec to code |
| Port raw SQL → SQLAlchemy (`?`→params, `GROUP_CONCAT`→`string_agg`) | Medium | **Sonnet** | Repetitive but needs judgment |
| Placeholder/syntax find-replace sweeps, fixture data | Low | **Haiku** | Pure mechanical edits |

### Phase 2 — Auth & authorization
| Task | Complexity | Model | Why |
|---|---|---|---|
| JWT validation + `get_current_user` + JWKS caching | High | **Opus** | Security-critical; subtle failure modes |
| Authorization model + `assert_story_access` design | High | **Opus** | Tenant isolation correctness |
| Apply `Depends`/access checks across all routers | Medium | **Sonnet** | Mechanical once pattern is fixed, but per-route care |
| Add import lines / boilerplate dependency wiring | Low | **Haiku** | Trivial edits |

### Phase 3 — Frontend auth & sharing
| Task | Complexity | Model | Why |
|---|---|---|---|
| `react-oidc-context` integration, token refresh, API auth header | Medium | **Sonnet** | Standard integration |
| Share dialog + My/Shared story UI | Medium | **Sonnet** | UI feature work |
| Login gating, loading/error states, copy | Low | **Haiku** | Simple UI/text |

### Phase 4 — Infra (CDK)
| Task | Complexity | Model | Why |
|---|---|---|---|
| CDK network/RDS/App Runner/Cognito security architecture | High | **Opus** | IAM least-privilege, SG isolation, no-NAT egress design |
| CDK constructs from the approved architecture | Medium | **Sonnet** | Codes a fixed design |
| ECR lifecycle, CloudWatch retention, SSM params, CI workflow | Low | **Haiku** | Config boilerplate |

### Phase 5 — Hardening
| Task | Complexity | Model | Why |
|---|---|---|---|
| Security review (tenant isolation, token handling, IAM) | High | **Opus** | Final correctness/security gate |
| Smoke/integration test scaffolding | Medium | **Sonnet** | Standard test code |
| Changelog/archive bookkeeping, docs polish | Low | **Haiku** | Mechanical |

### Token-minimization rationale
- ~55% of tasks are Haiku/Sonnet-tier mechanical or fixed-spec work — kept off
  Opus deliberately.
- Opus is used only for the 6 high-stakes design/security items where an error
  is expensive (data isolation, JWT, IAM, final review).
- Each Opus item ends with a written spec so the downstream Sonnet/Haiku tasks
  need no Opus re-reasoning.

## 8. Recommended execution order

`Phase 0 → 1 → 2 → 3 → 4 → 5`. Phases 1–2 are the critical path (nothing is
multi-tenant or safe to expose until they land). Phase 4 can begin in parallel
with Phase 3 once the Phase 4 Opus design item is done.
```
