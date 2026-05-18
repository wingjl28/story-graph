# Phase 4 — Opus Infra Security Review (gate record)

Reviewer: Opus. Scope: `infra/lib/story-graph-stack.ts` against
PHASE4_INFRA.md §9. `cdk synth` validated offline (no creds), exit 0,
all resources present.

**Result: PASS** — architecture/IAM/network/secrets posture sound;
**2 correctness defects found & fixed** before commit; 1 documented
follow-up deferred to Phase 5.

## §9 checklist verdict

| Check | Verdict |
|---|---|
| No SG 0.0.0.0/0 inbound; DB ingress only connectorSg:5432 | ✅ |
| RDS private, encrypted, deletionProtection, isolated subnets | ✅ |
| `natGateways:0`; isolated subnet has no internet route | ✅ |
| Cognito client public, no secret, code+PKCE, preventUserExistence | ✅ |
| IAM instance role resource-scoped; **zero `*` resource/action** | ✅ (`secret.grantRead` + SSM `parameter/storygraph/*`) |
| Secrets never plaintext in source/synth | ✅ (Secrets Manager refs + `{{resolve:ssm-secure}}` tokens only) |
| `RETAIN` on UserPool/ECR/RDS | ✅ |
| `cdk synth` clean offline | ✅ exit 0 |
| No deploy performed | ✅ |

## Defects found & fixed (Opus)

1. **Broken SSM secret strategy.** Implementation created `String` SSM
   params and instructed the user to `put-parameter --type SecureString
   --overwrite`. AWS **rejects a type change on overwrite**, and Cognito
   `{{resolve:ssm-secure:...}}` requires the param to already be
   SecureString → deploy would fail. **Fix:** CDK no longer creates the
   params; the user creates them with the correct type *before* deploy.
   Split into explicit String vs SecureString name lists + two
   `CfnOutput`s; header runbook corrected to "create params → deploy →
   re-deploy with appUrl".
2. **Invalid `emailVerified` attribute mapping** (TS compile error;
   `cognito.AttributeMapping` has no such target). **Fix:** removed from
   all three IdPs; only `email` is mapped.

## Deferred to Phase 5 (documented, not a security hole)

Forcing `email_verified=true` for federated IdPs (the Phase-2 review
follow-up) **cannot** be done via Cognito L2 `attributeMapping`. The
correct mechanism is a **Pre-Sign-up Lambda trigger** that sets
`autoConfirmUser` / verified email for federated logins. Deferred to
Phase 5 (adds Lambda asset + role — real scope). Risk is bounded: the
backend already **fails closed** on unverified email (Phase 2 §7), so the
only impact is that some Apple/Microsoft "private relay / unverified"
users can't log in until the Lambda lands — an availability gap, not a
tenant-isolation or token-trust defect.

## Cost posture confirmed

No NAT, single-AZ t4g.micro, 0.25 vCPU App Runner, Cognito prefix domain
(no ACM), Secrets Manager used only for the one DB credential. Matches the
~$22–30/mo DEPLOYMENT_PLAN.md estimate.
