# Phase 2 — Opus Security Review (gate record)

Reviewer: Opus. Scope: `auth.py`, `story_graphs.py` collaborator endpoints,
`0002_pending_invites`, against the PHASE2_AUTH.md §7 checklist.

**Result: PASS — 0 defects.** (Contrast: Phase 1 port had 4 IDORs. The
Phase 2 implementation was clean — the fully-specified Opus design left
little room for the implementer to introduce isolation bugs.)

## §7 checklist verdict

| Check | Verdict |
|---|---|
| `algorithms=["RS256"]` hard-pinned; alg never from token; `none` impossible | ✅ |
| `aud` == app client id and `iss` == Cognito issuer enforced | ✅ (jwt.decode params) |
| `exp`/`iat` required; leeway ≤60s; `token_use=="id"` | ✅ |
| `email_verified` required true; email not used for authz | ✅ |
| JWKS only HTTPS to issuer; key cache bounded (lifespan=3600) | ✅ |
| JIT insert race handled (unique + rollback/reselect) | ✅ |
| 401 (auth) vs 404 (tenant) distinct; `assert_story_access` unchanged | ✅ |
| Tokens/claims never logged | ✅ |
| Collaborator endpoints owner-gated; no owner removal/role-change; role∈{editor,viewer}; no enumeration | ✅ |
| `consume_pending_invites` idempotent; respects owner/existing-collab | ✅ |
| Dev escape hatch unreachable when `COGNITO_USER_POOL_ID` set | ✅ |

## Fail-closed posture confirmed

Misconfiguration (missing `COGNITO_REGION`/`APP_CLIENT_ID` while pool id is
set) → `_get_jwk_client` KeyError / empty-audience mismatch → caught → **401**,
never an auth bypass. JWKS fetch failure → 401. Broad `except Exception`
around decode is intentional fail-closed.

## Non-blocking follow-ups (Phase 3/4, documented not fixed)

1. **Federated-IdP email edge cases.** Cognito social federation
   (Google/Apple/Microsoft) can yield tokens where `email` is absent or
   `email_verified` is false (notably Apple "Hide My Email" relay, some MS
   tenants). Current code correctly **fails closed** (401), but that means
   such users can't log in. Phase 3/4 must configure the Cognito user-pool
   attribute mapping / required scopes so a verified email is always
   asserted, or relax the identity model to not require email (use `sub`
   only, capture email lazily). Track before go-live.
2. Broad `except Exception` → 401 also masks transient JWKS/network errors
   as auth failures (availability, not security). Acceptable at this scale;
   consider a 503 branch later.

Both are functional/availability items, not isolation or token-trust
defects. They do not block the Phase 2 commit.
