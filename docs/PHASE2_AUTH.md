# Phase 2 — Cognito Auth & Collaboration (Authoritative Spec)

> Opus design deliverable. The Sonnet implementation follows this exactly.
> A final Opus security review gates the commit (checklist in §7).
> Phase 1 left exactly one seam to fill: `backend/auth.py::get_current_uid`.
> All *authorization* logic (`assert_story_access`, per-router guards) is
> already real and reviewed — Phase 2 only establishes *who the caller is*
> and adds the collaboration (sharing) endpoints.

## 1. Token model decision

The SPA sends the Cognito **ID token** as `Authorization: Bearer <jwt>`.

Rationale (first-party SPA + first-party API, ~10 users):
- The ID token carries `sub`, `email`, `email_verified`, `name` /
  `cognito:username` — needed for JIT user provisioning and invite-by-email.
- Single audience (our app client) → clean `aud` pinning.
- The stricter "access token for authz + /userInfo for email" split adds a
  network round-trip per request for no benefit at this scale. Documented as
  the scale-up path, not implemented now.

Identity = the `sub` claim **only**. `email` is used solely for invite
matching and display, never for authorization, and only when
`email_verified == true`.

## 2. Validation algorithm (exact)

Use **PyJWT** with `jwt.PyJWKClient` (built-in JWKS fetch + key cache).
Add to `requirements.txt`: `pyjwt[crypto]==2.9.0`.

Per request, in `get_current_uid`:

1. Extract bearer via `fastapi.security.HTTPBearer(auto_error=True)`.
2. `issuer = f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_USER_POOL_ID}"`
3. `jwks_url = issuer + "/.well-known/jwks.json"` — module-level singleton
   `PyJWKClient(jwks_url, cache_keys=True, lifespan=3600)`.
4. `signing_key = jwk_client.get_signing_key_from_jwt(token)` (raises on
   unknown `kid`; PyJWKClient refetches JWKS automatically).
5. `claims = jwt.decode(token, signing_key.key, algorithms=["RS256"],`
   `audience=COGNITO_APP_CLIENT_ID, issuer=issuer,`
   `options={"require": ["exp", "iat", "sub", "aud", "iss"]},`
   `leeway=60)`
6. Hard checks (raise 401 on any failure):
   - `claims["token_use"] == "id"`
   - `claims.get("email_verified") is True`
7. JIT provision (see §3) → return `users.id` (int).

Any failure → `HTTPException(status_code=401, detail=..., headers={"WWW-Authenticate": "Bearer"})`.
Never log the token or full claims. `algorithms` is **hard-pinned to
`["RS256"]`** — never read alg from the token; `none` is impossible.

## 3. JIT user provisioning (race-safe)

```
sub   = claims["sub"]
email = claims["email"]
name  = claims.get("name") or claims.get("cognito:username") or email

u = session.execute(select(User).where(User.cognito_sub == sub)).scalar_one_or_none()
if u is None:
    u = User(cognito_sub=sub, email=email, display_name=name)
    session.add(u); 
    try:
        session.commit()
    except IntegrityError:           # concurrent first request, unique(cognito_sub)
        session.rollback()
        u = session.execute(select(User).where(User.cognito_sub == sub)).scalar_one()
else:
    if u.email != email or u.display_name != name:   # keep profile fresh
        u.email = email; u.display_name = name; session.commit()
consume_pending_invites(session, u)   # §5
return u.id
```

## 4. Dependency wiring (no router changes)

Routers already do `uid: int = Depends(get_current_uid)` and separately
`session: Session = Depends(get_session)`. Change `get_current_uid`'s
signature to depend on the bearer scheme and the **same** `get_session`
so FastAPI deduplicates the session within a request:

```
_bearer = HTTPBearer(auto_error=True)
def get_current_uid(
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
    session: Session = Depends(get_session),
) -> int: ...
```

Routers are untouched — this is the seam Phase 1 deliberately created.

### Local-dev escape hatch (must not weaken prod)
If `COGNITO_USER_POOL_ID` is **unset**, fall back to the Phase 1 behavior:
return `int(os.environ.get("DEV_UID", "1"))` and ensure a `users` row with
that id exists (create a dev user `cognito_sub="dev-<id>"` if missing).
If `COGNITO_USER_POOL_ID` **is set**, the dev path is unreachable — real
validation always runs. Document loudly that prod always sets it.

## 5. Collaboration (sharing) — schema delta + API

Invite-by-email must work even if the invitee hasn't signed in yet (no
Cognito `sub` exists for them). Add a pending-invite table.

### Migration `0002_pending_invites` (Sonnet, Alembic)
```sql
CREATE TABLE pending_invites (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    story_graph_id BIGINT NOT NULL REFERENCES story_graphs(id) ON DELETE CASCADE,
    email          TEXT   NOT NULL,
    role           TEXT   NOT NULL CHECK (role IN ('editor','viewer')),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (story_graph_id, lower(email))
);
CREATE INDEX ix_pending_invites_email ON pending_invites (lower(email));
```
Add matching `PendingInvite` model to `backend/db_models.py`.
`consume_pending_invites(session, user)`: select invites where
`lower(email) == lower(user.email)`; for each, upsert a
`story_collaborators(story_graph_id, user.id, role)` row (skip if the user
is the story owner or already a collaborator), then delete the invite.
Idempotent.

### Endpoints (in `story_graphs.py`; all `Depends(get_current_uid)`)
- `GET  /api/story-graphs/{gid}/collaborators` — viewer+ (uses
  `assert_story_access(gid, uid, "viewer")`). Returns owner + collaborators
  (user id, email, display_name, role) + pending invites (email, role).
- `POST /api/story-graphs/{gid}/collaborators` body `{email, role}` —
  **owner only** (`assert_story_access(gid, uid, "owner")`).
  `role ∈ {editor, viewer}` (reject `owner`). If a `users` row with
  `lower(email)` exists and isn't the owner/already-collab → create
  `story_collaborators`. Else → upsert `pending_invites` (idempotent on
  `(gid, lower(email))`). Never reveal whether the email is a registered
  user (respond 200 either way) to avoid account enumeration.
- `PATCH /api/story-graphs/{gid}/collaborators/{user_id}` body `{role}` —
  owner only. Cannot target the owner.
- `DELETE /api/story-graphs/{gid}/collaborators/{user_id}` — owner only,
  OR the caller removing themselves (`user_id == uid`). Cannot remove owner.
- `DELETE /api/story-graphs/{gid}/invites?email=` — owner only; revoke a
  pending invite.

Ownership transfer is **out of scope** for Phase 2 (note it).

## 6. Config / env contract (consumed by code; set by CDK in Phase 4)

| Var | Required (prod) | Notes |
|---|---|---|
| `COGNITO_REGION` | yes | e.g. `us-east-1` |
| `COGNITO_USER_POOL_ID` | yes | presence flips auth ON |
| `COGNITO_APP_CLIENT_ID` | yes | `aud` to pin |
| `DEV_UID` | no | local-only, ignored when pool id set |

No client secret is consumed by the API (SPA uses PKCE, public client).

## 7. Opus review gate checklist (before Phase 2 commit)

- [ ] `algorithms=["RS256"]` hard-pinned; alg never taken from token; `none` impossible
- [ ] `aud` == app client id and `iss` == Cognito issuer both enforced
- [ ] `exp`/`iat` required; small leeway only (≤60s); `token_use=="id"`
- [ ] `email_verified` required true; email never used for authz
- [ ] JWKS only over HTTPS to the Cognito issuer; key cache bounded/TTL
- [ ] JIT insert race handled via unique(cognito_sub) + rollback/reselect
- [ ] 401 (auth) vs 404 (tenant access, unchanged from Phase 1) kept distinct
- [ ] Tokens/claims never logged
- [ ] Collaborator endpoints owner-gated; no owner removal/role-change;
      role∈{editor,viewer}; no account enumeration via invite response
- [ ] `consume_pending_invites` idempotent; respects owner/existing-collab
- [ ] Dev escape hatch unreachable whenever `COGNITO_USER_POOL_ID` is set

## 8. Definition of done

- [ ] `pyjwt[crypto]==2.9.0` added to requirements.txt (Sonnet)
- [ ] `backend/auth.py`: real `get_current_uid` per §2–§4; `PyJWKClient`
      singleton; dev fallback gated (Sonnet)
- [ ] `0002_pending_invites` migration + `PendingInvite` model +
      `consume_pending_invites` (Sonnet)
- [ ] Collaborator/invite endpoints per §5 (Sonnet)
- [ ] `python -m py_compile` clean across backend (Sonnet)
- [ ] Opus security review against §7, then commit
