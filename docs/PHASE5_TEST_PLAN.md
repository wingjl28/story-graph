# Phase 5 — Test Plan: Multi-Tenant Authorization

## Part 1 — Local dev-mode smoke

**Pre-condition:** `COGNITO_USER_POOL_ID` is NOT set; local Postgres is running
and migrations applied (`alembic upgrade head`).

```bash
# Start the API (dev escape-hatch active, DEV_UID=1)
uvicorn backend.main:app --reload

# 1. Create a story (auto-creates dev user id=1)
curl -s -X POST http://localhost:8000/story-graphs \
  -H "Content-Type: application/json" \
  -d '{"title":"Smoke Test Story"}' | jq .

# 2. Read it back (expect 200 with the story object)
curl -s http://localhost:8000/story-graphs/1 | jq .

# 3. Create a node
curl -s -X POST "http://localhost:8000/nodes?graph_id=1" \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","type_id":null}' | jq .

# 4. Create a relationship between two nodes (create a second node first)
#    Then verify GET /relationships?graph_id=1 returns the new relationship.

# 5. Confirm auth is bypassed: no Authorization header needed for any call above.
#    (If COGNITO_USER_POOL_ID were set, all calls would return 401.)
```

**Pass criteria:** all four calls return 2xx; no 401/403/404.

---

## Part 2 — Post-deploy tenant-isolation verification

**Setup:**

```
export URL=https://<your-app-runner-host>
export TOKEN_A=<Cognito ID token for User A>
export TOKEN_B=<Cognito ID token for User B>
```

### Step 1 — Create User A's story and nodes

```bash
# User A creates a story
STORY_A=$(curl -sf -X POST $URL/story-graphs \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d '{"title":"Story of A"}' | jq -r .id)

echo "Story A id: $STORY_A"

# User A creates two nodes
NODE_A1=$(curl -sf -X POST "$URL/nodes?graph_id=$STORY_A" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d '{"name":"NodeA1"}' | jq -r .id)

NODE_A2=$(curl -sf -X POST "$URL/nodes?graph_id=$STORY_A" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d '{"name":"NodeA2"}' | jq -r .id)

# User A creates a relationship
REL_A=$(curl -sf -X POST "$URL/relationships?graph_id=$STORY_A" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d "{\"source_id\":$NODE_A1,\"target_id\":$NODE_A2,\"label\":\"knows\"}" | jq -r .id)
```

### Step 2 — User B cannot access User A's resources (expect 404 everywhere)

```bash
# B tries to GET A's story -> 404
curl -si -X GET $URL/story-graphs/$STORY_A \
  -H "Authorization: Bearer $TOKEN_B" | head -1
# Expected: HTTP/... 404

# B tries to PUT A's story -> 404
curl -si -X PUT $URL/story-graphs/$STORY_A \
  -H "Authorization: Bearer $TOKEN_B" \
  -H "Content-Type: application/json" \
  -d '{"title":"Hacked"}' | head -1
# Expected: HTTP/... 404

# B tries to DELETE A's story -> 404
curl -si -X DELETE $URL/story-graphs/$STORY_A \
  -H "Authorization: Bearer $TOKEN_B" | head -1
# Expected: HTTP/... 404

# B tries to GET A's node -> 404
curl -si -X GET "$URL/nodes/$NODE_A1?graph_id=$STORY_A" \
  -H "Authorization: Bearer $TOKEN_B" | head -1
# Expected: HTTP/... 404

# B tries to GET A's relationship -> 404
curl -si -X GET "$URL/relationships/$REL_A?graph_id=$STORY_A" \
  -H "Authorization: Bearer $TOKEN_B" | head -1
# Expected: HTTP/... 404

# B tries to PUT A's relationship -> 404
curl -si -X PUT "$URL/relationships/$REL_A?graph_id=$STORY_A" \
  -H "Authorization: Bearer $TOKEN_B" \
  -H "Content-Type: application/json" \
  -d '{"label":"infiltrated"}' | head -1
# Expected: HTTP/... 404

# B tries to DELETE A's relationship -> 404
curl -si -X DELETE "$URL/relationships/$REL_A?graph_id=$STORY_A" \
  -H "Authorization: Bearer $TOKEN_B" | head -1
# Expected: HTTP/... 404

# B tries to tag A's node -> 404
curl -si -X POST "$URL/nodes/$NODE_A1/tags/1?graph_id=$STORY_A" \
  -H "Authorization: Bearer $TOKEN_B" | head -1
# Expected: HTTP/... 404
```

### Step 3 — List endpoints do not leak across tenants

```bash
# B creates their own story
STORY_B=$(curl -sf -X POST $URL/story-graphs \
  -H "Authorization: Bearer $TOKEN_B" \
  -H "Content-Type: application/json" \
  -d '{"title":"Story of B"}' | jq -r .id)

# B lists their own stories — must NOT include Story A
curl -sf $URL/story-graphs \
  -H "Authorization: Bearer $TOKEN_B" | jq '[.[].id]'
# Expected: array contains $STORY_B, does NOT contain $STORY_A

# B lists relationships for their own story (no results yet, but 200 not 404)
curl -si "$URL/relationships?graph_id=$STORY_B" \
  -H "Authorization: Bearer $TOKEN_B" | head -1
# Expected: HTTP/... 200

# B cannot list A's relationships
curl -si "$URL/relationships?graph_id=$STORY_A" \
  -H "Authorization: Bearer $TOKEN_B" | head -1
# Expected: HTTP/... 404
```

### Step 4 — Collaborator invite flow

```bash
# Determine User B's email from their token (decode the JWT payload, field "email")
EMAIL_B=$(echo $TOKEN_B | cut -d. -f2 | base64 -d 2>/dev/null | jq -r .email)

# A invites B as viewer
curl -sf -X POST "$URL/story-graphs/$STORY_A/collaborators" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL_B\",\"role\":\"viewer\"}"

# B (re-)authenticates so pending invites are consumed, then reads A's story -> 200
curl -si $URL/story-graphs/$STORY_A \
  -H "Authorization: Bearer $TOKEN_B" | head -1
# Expected: HTTP/... 200

# B as viewer CAN list A's nodes -> 200
curl -si "$URL/nodes?graph_id=$STORY_A" \
  -H "Authorization: Bearer $TOKEN_B" | head -1
# Expected: HTTP/... 200

# B as viewer CANNOT create a node -> 404 (insufficient role, not 403)
curl -si -X POST "$URL/nodes?graph_id=$STORY_A" \
  -H "Authorization: Bearer $TOKEN_B" \
  -H "Content-Type: application/json" \
  -d '{"name":"Intruder"}' | head -1
# Expected: HTTP/... 404

# A upgrades B to editor
curl -sf -X PUT "$URL/story-graphs/$STORY_A/collaborators/$STORY_A" \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d '{"role":"editor"}'
# (use the collaborator row id returned from the POST above, not $STORY_A)

# B as editor CAN create a node -> 201
curl -si -X POST "$URL/nodes?graph_id=$STORY_A" \
  -H "Authorization: Bearer $TOKEN_B" \
  -H "Content-Type: application/json" \
  -d '{"name":"LegitNode"}' | head -1
# Expected: HTTP/... 201

# B as editor CANNOT delete A's story (owner-only) -> 404
curl -si -X DELETE $URL/story-graphs/$STORY_A \
  -H "Authorization: Bearer $TOKEN_B" | head -1
# Expected: HTTP/... 404
```

**Pass criteria for Part 2:** every curl marked "Expected: 404" returns 404;
every curl marked "Expected: 200/201" returns that status; no 403 appears
anywhere in the denial cases.
