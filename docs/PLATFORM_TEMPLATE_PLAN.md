# Standardized Web-App Platform — Template Plan

> Status: PLANNED. Execute only AFTER story-graph is debugged and working
> end-to-end on real infra. story-graph then becomes the reference impl.

## Goal

A reusable platform where launching a new product = swap the app code +
change one config block; the auth, multi-tenancy, infra, and deploy
workflow are inherited unchanged.

## Critical compute decision (App Runner deprecation)

App Runner stopped accepting new customers/services (Apr 30 2026).
- **story-graph**: stays on App Runner (existing/grandfathered) — no change.
- **Template for new apps**: compute layer MUST be Amazon **ECS Express
  Mode** (AWS's recommended successor) or ECS Fargate + ALB. This is the
  single module that differs from the current stack. The container itself
  (Dockerfile, FastAPI app) is portable as-is.

## Platform vs App boundary

### Platform (reused verbatim per app — the "template")
- **Infra (CDK):** VPC (no-NAT, isolated subnets), RDS Postgres, Cognito
  user pool + federated IdPs + Pre-Sign-up Lambda, `cognito-idp` interface
  endpoint, ECR, least-priv IAM, the opt-in flags + bring-up/prod removal
  policy toggle. Compute = ECS Express (template) instead of App Runner.
- **Auth/tenancy core:** `backend/auth.py` (JWT validate, JIT provision,
  `get_current_uid`, `assert_<workspace>_access`), the
  owner/collaborator/`pending_invites` model, role ordering, 404-not-403.
- **DB plumbing:** `backend/database.py` (engine/session, Alembic runner),
  Alembic harness + migration conventions.
- **Frontend shell:** `auth/authConfig.js`, `LoginGate`, `AuthBridge`,
  `api.js` bearer/401 wiring, dev/prod parity toggle, collaborator/share UI.
- **Process:** Dockerfile pattern, deploy runbook, the design→implement→
  Opus-security-gate workflow, model-tiering.

### App-specific (the only things that change)
- Domain schema/tables + their Alembic migration(s).
- Domain routers + Pydantic schemas.
- Domain frontend (here: the Cytoscape graph UI).
- One `appConfig` block: appName, Cognito domain prefix, ECR repo, SSM/
  Secrets path prefix, DB name, OAuth provider set.

## Generalization work (when executed)

1. **Rename the tenancy root to a generic concept.** `story_graphs` →
   `workspaces` (+ `workspace_collaborators`, `pending_invites`,
   `workspace_node_positions` → generic per-user UI state table). The
   universal seam becomes `assert_workspace_access(session, wsid, uid,
   role)`. App data always FKs `workspace_id`.
2. **Single config module** drives every name/identifier (stack, Cognito
   domain prefix, ECR, SSM/Secrets prefixes, DB name) from `appName`.
3. **Repo layout:** `platform/` (infra construct lib + auth + db +
   frontend shell) vs `app/` (domain). New app = new `app/` + `appConfig`.
4. **Reusable CDK construct** `StandardWebAppStack({ appName, ... })` —
   parameterized; compute = ECS Express. New app's infra ≈ 15 lines.
5. **Template repo / cookiecutter** so `create new app` scaffolds the
   `app/` skeleton + config wired to the platform.
6. Port the Opus security-review checklists (PHASE1/2/4/5 review docs)
   into reusable gate templates.

## Sequencing

1. Finish debugging story-graph → confirmed working on real infra.
2. Opus design doc for `StandardWebAppStack` + the platform/app boundary
   (incl. ECS Express compute module) → security-reviewed.
3. Extract platform, generalize tenancy root, config module (Sonnet impl,
   Opus review — same workflow as the migration).
4. Validate by rebuilding story-graph on the template (must be behavior-
   identical) — that proves the template.
5. Then new apps start from the template.

## Cost note

ECS Express Mode pricing differs from App Runner; re-estimate at template
time. The no-NAT + interface-endpoint + t4g.micro RDS + Cognito-free
posture carries over and remains the cost-minimized baseline.
