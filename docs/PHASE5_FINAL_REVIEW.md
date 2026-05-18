# Phase 5 — Final Cross-Cutting Security Review (Opus)

Holistic end-to-end review of the cloud migration (Phases 0–5). Verdict:
**Ready to deploy.** No open critical/high issues. Residual items below are
bounded and documented.

## Trust boundaries

1. Browser ↔ Cognito (hosted UI, PKCE, public client, no secret).
2. Browser ↔ API: every `/api` call carries the Cognito **ID token**;
   `api.js` is the single injection point; 401 → re-login.
3. API ↔ DB: private isolated subnet, TLS (`DB_SSLMODE=require`), one SG
   ingress from the App Runner connector only.
4. Untrusted input = the JWT and all request bodies. JWT is the only
   identity source; the DB is the only authorization source.

## Authentication (Phase 2, Phase 4 Lambda)

- RS256 hard-pinned; `aud`/`iss`/`exp`/`iat`/`token_use=id`/
  `email_verified` all enforced; JWKS via PyJWKClient; fail-closed on
  every error/misconfig path.
- The Pre-Sign-up Lambda auto-verifies email **only** for
  `PreSignUp_ExternalProvider` and **only** when the IdP actually asserts
  an email — closing the federated-login gap without weakening the
  non-federated path (which is disabled anyway: `selfSignUpEnabled:false`).
- Identity = `sub` only; `email` is used solely for invite matching/display.

## Authorization / tenant isolation (Phase 1–2, gated)

- Single chokepoint `assert_story_access` → 404 (never 403) for
  missing/no-access/insufficient-role. Reviewed verbatim, unchanged since
  Phase 1.
- Phase 1 gate caught & fixed 4 cross-tenant IDORs (relationships, tag
  attach, list-leak, count-leak). Phase 2 gate: 0 defects. Phase 4 gate:
  2 deploy-correctness defects fixed.
- Cross-story write integrity (rel source/target same story; type/tag
  visibility on node create) enforced per spec §5.

## Secrets & IAM

- No secret in source, synth, or CFN template: DB credential =
  Secrets Manager managed; OAuth secrets = `{{resolve:ssm-secure}}`
  tokens; user creates SSM params out-of-band.
- App Runner instance role: resource-scoped to the one DB secret + its
  KMS + `parameter/storygraph/*`. **Zero `*` resource or action.**
- `RETAIN` on RDS / ECR / Cognito so a stack delete cannot destroy data
  or the user pool.

## Network & cost

- No NAT; RDS not publicly accessible; no `0.0.0.0/0` ingress anywhere;
  isolated subnet has no internet route. ~$22–30/mo.

## Residual items (bounded, documented — not blockers)

1. **`unsafePlainText` on OAuth IdP secrets.** Acceptable: the value is a
   CFN `{{resolve:ssm-secure}}` token, not a real secret; CloudFormation
   resolves it at deploy and it never appears in the template body.
2. **Broad `except Exception` → 401** in token validation masks transient
   JWKS/network failures as auth failures (availability, not security).
   Fail-closed by design; optional 503 refinement later.
3. **Apple "Hide My Email" relay.** The Lambda verifies whatever email the
   IdP asserts (Apple's relay address is deliverable/Apple-verified) — fine
   for identity-by-`sub`; just note relay addresses won't match a
   real-email invite. Product nuance, not a security issue.
4. **Single-AZ RDS, no automated DR drills.** Acceptable for the stated
   ~10-user scale; documented in DEPLOYMENT_PLAN scalability section.
5. **No rate limiting / WAF.** Out of scope at this scale; App Runner +
   Cognito throttling provide baseline. Revisit before public scale-up.

## Pre-go-live checklist for the user

- [ ] Billing budget alarm created (runbook §7)
- [ ] All 8 SSM params created with correct types BEFORE deploy
- [ ] Post-deploy tenant-isolation curl suite (PHASE5_TEST_PLAN §2) passes
      with two real users
- [ ] Confirm `COGNITO_USER_POOL_ID` is set in App Runner env (auth ON) —
      it is, via CDK; verify in console once
