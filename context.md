# Session Handoff — story-graph cloud app

> Open this in a new Claude Code session. It's the minimum context to be
> useful without re-deriving everything. Authoritative deeper docs live
> under `docs/` and are referenced inline — pull them on demand.

## TL;DR

A single-tenant SQLite/FastAPI/React app was migrated to a multi-tenant,
Cognito-authenticated AWS deployment over a long debug arc. **It is
deployed and functionally working** as of the latest commit. The CRUD
surface (stories → types → tags → nodes → relationships) has been
exercised end-to-end on real infra.

**Working on AWS:** sign-in via Google federation, story creation, type
creation, tag creation, node creation. **Relationship creation fix is
committed (`c1bdac6`) but not yet pushed/deployed** — that's a pending
build+push+redeploy.

**Next session's goal (USER REQUEST):** set up a local dev environment
for fast iterate-and-test cycles **before** pushing to AWS. See §
"Next-session task" below.

---

## Repo layout (skim)

```
backend/             FastAPI + SQLAlchemy + Alembic (Postgres in prod, local dev fallback URL)
  main.py            FastAPI app + lifespan -> init_db()
  database.py        engine, SessionLocal, get_session, Alembic runner
  db_models.py       SQLAlchemy models for all 10 tables (NB: Node.meta NOT .metadata)
  models.py          Pydantic request/response schemas
  auth.py            get_current_uid (Cognito JWT) + assert_story_access + ROLE_ORDER
  routers/           node_types, nodes, relationships, graph, rel_types, tags, story_graphs
  migrations/        Alembic harness + versions/0001_initial, 0002_pending_invites
  tests/             pure-logic unit tests for assert_story_access
  scripts/           backfill_legacy.py (one-shot legacy SQLite -> Postgres)
frontend/            React 18 + Vite + Cytoscape.js
  src/App.jsx        Main app; auth gating wired via AuthBridge + LoginGate
  src/api.js         Single fetch chokepoint; injects Bearer when token set
  src/auth/authConfig.js   AUTH_ENABLED = !!VITE_COGNITO_AUTHORITY
  src/components/    All UI; key files: LoginGate, ShareDialog, Sidebar, AddNodeModal
infra/               AWS CDK (TypeScript). One stack: StoryGraphStack
Dockerfile           Multi-stage (Node build SPA -> Python serve)
requirements.txt     Backend pinned deps (FastAPI 0.115, SQLAlchemy 2.0.35, psycopg 3.2.3, alembic 1.13.3, pyjwt 2.9)
requirements-dev.txt pytest + httpx (test-only)
alembic.ini          script_location = backend/migrations
docs/                AUTHORITATIVE design + review docs — read on demand:
  DEPLOYMENT_PLAN.md          Overall architecture, phased plan, model-tiering
  PHASE1_SCHEMA.md            Postgres DDL (source of truth for the schema)
  PHASE1_DB_API.md            Import contract for SQLAlchemy layer
  PHASE1_REVIEW.md            Opus tenant-isolation gate findings
  PHASE2_AUTH.md              Cognito JWT + collaboration spec
  PHASE2_REVIEW.md            Opus auth security gate findings
  PHASE4_INFRA.md             CDK security/IAM/network spec
  PHASE4_REVIEW.md            Opus infra security gate findings
  PHASE5_FINAL_REVIEW.md      Cross-cutting final review + residual items
  PHASE5_TEST_PLAN.md         Manual + curl-based tenant-isolation verification
  PLATFORM_TEMPLATE_PLAN.md   Future: extract reusable platform template
  DEPLOY_RUNBOOK.md           User-performed deploy steps (you authored most of it)
```

## Architectural facts you can rely on (don't re-derive)

- **Multi-tenant model:** `users` (keyed by Cognito `sub`) → owns
  `story_graphs` → owns `nodes`/`node_types`/`tags`/`relationships`/
  `rel_types`/`story_node_positions`. Collaboration via
  `story_collaborators (story_graph_id, user_id, role)` with role ∈
  {`editor`,`viewer`} (`owner` is implicit via `story_graphs.owner_id`).
  Plus `pending_invites` for invite-by-email-before-signup.
- **Authorization seam:** every story-scoped endpoint calls
  `assert_story_access(session, story_id, uid, min_role)` → returns the
  StoryGraph or raises **404 (never 403)** so existence isn't disclosed
  cross-tenant. ROLE_ORDER = viewer<editor<owner.
- **Relationships:** the rel's story IS the source node's story. As of
  `c1bdac6` (pending push), `create_relationship` and all by-id endpoints
  derive sid from the rel/source — no client-supplied `graph_id` needed
  except on `list_relationships`.
- **Cognito email_verified:** for federated sign-ins the backend trusts
  the IdP (Google/Apple/MS) — does NOT require `email_verified == True`
  when the token has an `identities` claim. (Cognito-native sign-ups
  still require it.) The Pre-Sign-up Lambda also sets
  `autoVerifyEmail=true` on first federated login.
- **Dev/prod parity is built into both halves:**
  - Backend dev mode: if `COGNITO_USER_POOL_ID` env unset → no JWT
    validation; `get_current_uid` returns a fixed dev user
    (`cognito_sub=dev-<DEV_UID>`).
  - Frontend dev mode: if `VITE_COGNITO_AUTHORITY` env unset → no auth
    provider, no login gate, no bearer header — app runs against the
    backend dev path.
- **`Node.meta` / `Relationship.meta`** are JSONB columns; the ORM
  attribute is `meta` (not `metadata` — SQLAlchemy reserves that name)
  but the DB column AND the JSON API key are both `"metadata"`.

## Cloud deploy state (live values)

- **AWS account:** `749263325227`, region `us-east-1`
- **App URL:** `https://hhnzqvtfad.us-east-1.awsapprunner.com`
- **App Runner service ARN:**
  `arn:aws:apprunner:us-east-1:749263325227:service/ServiceDBC79909-lK63S2jWeCvG/8377317297ed46a7964e50704c3a074c`
- **Cognito User Pool ID:** `us-east-1_X1JkDeYaL`
- **Cognito App Client ID:** `226719pt8o346crdr4ef33iagq`
- **Cognito Hosted UI domain:** `https://storygraph-749263325227.auth.us-east-1.amazoncognito.com`
- **ECR repo URI:** `749263325227.dkr.ecr.us-east-1.amazonaws.com/storygraphstack-ecrrepobb83a592-s49uquhm5ten`
- Google OAuth client_id is in SSM `/storygraph/oauth/google/client_id`;
  Google client_secret is in **Secrets Manager** at
  `/storygraph/oauth/google/client_secret`. (Apple/Microsoft IdPs are
  opt-in via `-c enableApple=true` / `-c enableMicrosoft=true`; user
  hasn't enabled them.)

## Pending push (do this when ready)

`c1bdac6` is committed but not yet built/pushed. To deploy: build image
with the VITE Cognito args (auth bakes in at build time), push to ECR,
then force an App Runner deploy. **In Git Bash with
`export MSYS_NO_PATHCONV=1` set:**

```bash
cd /c/Users/wingjl28/Projects/story-graph

aws ecr get-login-password --region us-east-1 \
  | docker login --username AWS --password-stdin 749263325227.dkr.ecr.us-east-1.amazonaws.com

docker build \
  --build-arg VITE_COGNITO_AUTHORITY="https://cognito-idp.us-east-1.amazonaws.com/us-east-1_X1JkDeYaL" \
  --build-arg VITE_COGNITO_CLIENT_ID="226719pt8o346crdr4ef33iagq" \
  -t "749263325227.dkr.ecr.us-east-1.amazonaws.com/storygraphstack-ecrrepobb83a592-s49uquhm5ten:latest" .

docker push "749263325227.dkr.ecr.us-east-1.amazonaws.com/storygraphstack-ecrrepobb83a592-s49uquhm5ten:latest"

aws apprunner start-deployment \
  --service-arn "arn:aws:apprunner:us-east-1:749263325227:service/ServiceDBC79909-lK63S2jWeCvG/8377317297ed46a7964e50704c3a074c" \
  --output json
```

Watch:
```bash
aws apprunner describe-service \
  --service-arn "arn:aws:apprunner:us-east-1:749263325227:service/ServiceDBC79909-lK63S2jWeCvG/8377317297ed46a7964e50704c3a074c" \
  --query "Service.Status" --output text
```

## Windows/Git Bash pitfalls (these bit us repeatedly — don't repeat)

1. **Always `export MSYS_NO_PATHCONV=1` first** in any Git Bash session
   that runs `aws` commands with `--name /storygraph/...` or any leading-
   slash arg. Otherwise Git Bash rewrites `/storygraph/...` to
   `C:/Program Files/Git/storygraph/...`.
2. **Always pass `--require-approval never` to `cdk deploy`** — Git Bash
   has no TTY for the security-change prompt; deploys hang/abort
   otherwise. The IAM/SG changes are already Opus-reviewed.
3. **`cdk synth` triggers AWS lookups** for the cognito-idp endpoint
   (`lookupSupportedAzs: true`). Needs AWS creds at synth time. Type-
   check only with `npx tsc --noEmit` if you need to validate code
   without lookups.
4. **App Runner auto-deploy is unreliable** for this account — always
   follow `docker push` with `aws apprunner start-deployment`.
5. **Cognito's hosted-UI session is sticky.** "Sign out → sign in" in the
   SPA doesn't kill the Cognito SSO cookie; you keep getting tokens with
   cached attributes. To force fresh claims: use the hosted-UI logout
   URL or a fresh Incognito window.
6. **`UpdatedAt` on App Runner service** reflects service-config changes,
   not image pulls. Check the `service` log group for actual deployment
   timeline. ECR's `imagePushedAt` tells you when YOU pushed; not when
   the service picked it up.

## Bring-up vs prod posture (must flip before real users)

`infra/lib/story-graph-stack.ts` is currently in BRING-UP mode (a
clearly-marked banner block at the top names this). ECR/RDS/Cognito use
`removalPolicy: DESTROY` and RDS `deletionProtection: false` so failed
deploys self-clean. **Before real users/data:** flip the three to
`RETAIN` and RDS `deletionProtection: true`, then redeploy once.

## Next-session task: local dev environment

**Goal:** fast iterate-and-test loop locally before pushing to AWS. The
user does NOT want to keep paying the 10-min docker-build + 5-min App
Runner cycle just to try a code change.

**Constraints you should respect:**
- Windows host, Git Bash terminal, Docker Desktop installed and working.
- Local Python 3.14; backend deps pin to 3.12 — *if* running backend
  directly, use a 3.12 venv. (Or just run everything in containers.)
- The cloud deploy must stay untouched while iterating locally.
- The app is already built for dev/prod parity: `COGNITO_USER_POOL_ID`
  unset = backend dev mode (DEV_UID); `VITE_COGNITO_AUTHORITY` unset =
  frontend dev mode (no auth, no bearer).

**Three viable approaches — let the user pick:**

1. **Docker Compose (Postgres container + app container in dev mode).**
   Most reproducible. Adds a `docker-compose.yml` with a postgres
   service + the app container with auth env unset. One command up. No
   hot reload by default — code changes need `docker compose build`.
2. **Local Postgres in Docker + `npm run dev` (Vite) + uvicorn
   `--reload` in a Python 3.12 venv.** Hottest iteration loop: Vite
   gives instant frontend reload, uvicorn `--reload` restarts on Python
   edits, Postgres just runs in the background. Frontend's `vite.config`
   already proxies `/api` to `localhost:8000`. The user's `dev.bat`
   from the SQLite era set up something similar — leverage it.
3. **Git worktree at the pre-cloud commit (`f778a6b`)** — the original
   SQLite app, runs with `start.bat`, no Postgres needed at all.
   Fastest to *anything running*, but exercises STALE code, so changes
   wouldn't transfer. Useful only as a sanity reference.

**Recommended: option 2 for daily dev (best loop), option 1 as a
"closer to prod" parity check before pushing.** Both should work
alongside the AWS deploy without touching it.

**Implementation tasks for option 2 (when picked):**
- Add a `docker-compose.dev.yml` (or just instructions) for a local
  Postgres: `postgres:16-alpine`, env `POSTGRES_DB=storygraph` /
  `POSTGRES_USER=postgres` / `POSTGRES_PASSWORD=postgres`, port 5432
  exposed. Persistent volume.
- Update `dev.bat` (or write a new `dev-local.sh` / `dev-local.ps1`)
  that:
  1. Ensures the postgres container is running.
  2. Activates a 3.12 venv, installs requirements, runs
     `python -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000`
     with `DB_*` env pointing at local postgres (`DB_HOST=localhost`,
     `DB_NAME=storygraph`, `DB_USER=postgres`, `DB_PASSWORD=postgres`,
     `DB_SSLMODE=disable`) and **`COGNITO_USER_POOL_ID` unset** for
     dev-mode auth bypass.
  3. In a separate terminal, `cd frontend && npm run dev` (already
     wired with the `/api` proxy). VITE_COGNITO_* must NOT be set so
     the frontend skips auth.
- Alembic auto-runs on backend startup (init_db → upgrade head) so the
  local DB gets created on first run.

**Watch for:**
- `DB_SSLMODE=require` is the default in `backend/database.py` — for
  local Postgres set `DB_SSLMODE=disable`.
- Python 3.14 may install `psycopg[binary]` 3.2.3 with grumbles. If
  pinning breaks on 3.14, use a 3.12 venv.
- DEV_UID defaults to `1` but the dev path looks up the user by
  `cognito_sub="dev-1"` and creates if missing — no manual DB seeding
  needed.

## Model-tiering discipline (continue this in next session)

Previous sessions used: **Opus** for design specs + security reviews;
**Sonnet** for implementation from a fixed spec; **Haiku** for
scaffolding + boilerplate. Every Opus design ended with a written spec
so downstream tasks didn't need Opus re-reasoning. Six expensive
deploy/security defects were caught by Opus review gates that a cheaper
review likely would have missed. Continue the same pattern — burn Opus
only on the costly-if-wrong work (security, schema design, multi-tenant
correctness). Local dev setup itself is Sonnet-tier mechanical work
with no security surface.

## What success looks like for the next session

- A documented + tested local dev loop (started with one command,
  reflects code changes in seconds, no AWS in the loop).
- The user can edit `App.jsx` or `backend/routers/*.py`, see changes
  immediately at `http://localhost:5173`, then when satisfied run the
  cloud deploy commands (above) to push to AWS.
- The Docker / docker-build path (current "edit → AWS" loop) becomes
  the *deploy* step only, not the dev step.

## Commit log highlights (most recent first)

```
c1bdac6 relationships: derive sid from source node (fixes 422 + future ops)  ← pending push
f8a7ac4 frontend: 'Create your first story' empty-state CTA for new users
2001250 auth: trust federated IdP for email verification + stop 401 redirect loop
0331e06 frontend: gate initial loads on auth + handle empty-stories first-run
4be26cd Dockerfile: copy alembic.ini into image
abf95c2 infra: OAuth secrets via Secrets Manager (CFN forbids ssm-secure in Cognito IdP)
59628c4 infra: gate App Runner behind -c enableService + DESTROY policy for bring-up
ba62b2e infra: lookupSupportedAzs on cognito-idp endpoint
4c820d4 infra: add cognito-idp interface VPC endpoint (fix 502 on auth'd requests)
be03ff4 Phase 4: AWS CDK stack (Sonnet impl, Opus-reviewed & fixed)
b590ac4 Phase 2: real Cognito JWT auth + collaboration (Sonnet impl, Opus-reviewed)
11b3351 Phase 1B+1C: routers ported to SQLAlchemy + legacy backfill + Opus security gate
70822db Phase 1A: SQLAlchemy layer + Alembic 0001_initial migration
```

## How to start the next session efficiently

Open in Claude Code; first message can be just:

> Read `context.md`. Focus on the "Next-session task" section — let's set up the local dev environment per option 2.

That + the doc is enough; the assistant should ask which option you want
if you don't say, propose a concrete plan, then implement.
