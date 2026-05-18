# Phase 4 — AWS Infrastructure (Authoritative CDK Spec)

> Opus design deliverable. The Sonnet CDK task implements `infra/lib/
> story-graph-stack.ts` to this spec exactly; an Opus IAM/security review
> gates the commit. **No deployment happens here** — deploy is a
> user-performed action (see §8). All resource code must be written so a
> `cdk synth` succeeds offline without AWS credentials.

## 1. Stack composition (single stack, `eu`/`us` region of user's choice)

VPC → ECR → Secrets/SSM → RDS → Cognito → App Runner. One CDK stack
`StoryGraphStack`. Region/account from `CDK_DEFAULT_*` (already in
`infra/bin/story-graph.ts`).

## 2. Networking — `ec2.Vpc`

- `maxAzs: 2`, subnets: 1 PUBLIC (`/24`) + 1 PRIVATE_ISOLATED (`/24`) per AZ.
- **`natGateways: 0`** — no NAT (saves ~$32/mo/AZ). RDS is
  `PRIVATE_ISOLATED`; App Runner reaches it via a VPC connector; App Runner
  reaches the internet (Cognito JWKS) on its **own** default egress, not
  through the VPC. No internet path is needed from the isolated subnet.
- No VPC endpoints needed (App Runner→RDS is intra-VPC; nothing in the
  isolated subnet calls AWS APIs).

## 3. Container registry — `ecr.Repository`

- `imageScanOnPush: true`, `encryption: KMS` (AWS-managed),
  `lifecycleRules: [{ maxImageCount: 5 }]`, `removalPolicy: RETAIN`.

## 4. Database — `rds.DatabaseInstance`

- Engine `POSTGRES` 16, `instanceType: t4g.micro`, `multiAz: false`,
  `allocatedStorage: 20`, `storageType: GP3`, `storageEncrypted: true`
  (AWS-managed KMS), `backupRetention: 7 days`,
  `deletionProtection: true`, `publiclyAccessible: false`,
  vpcSubnets PRIVATE_ISOLATED.
- **Credentials: `credentials: rds.Credentials.fromGeneratedSecret('sgadmin')`**
  → AWS Secrets Manager-managed master secret. *Deliberate
  security-over-cost call (~$0.40/mo):* no generated DB password ever lives
  in CDK source, synth output, or CloudFormation state, and rotation is
  available later. Everything *else* (OAuth secrets, app config) uses the
  cheaper SSM SecureString — Secrets Manager is used **only** for the DB
  credential.
- Security group `dbSg`: **no inbound rules in CDK by default**; add exactly
  one ingress: from `appRunnerConnectorSg` on tcp/5432. No 0.0.0.0/0, ever.

## 5. Config storage — SSM Parameter Store (SecureString)

CDK **creates the parameter names/paths** but NOT secret values the user
must supply. Convention: `/storygraph/<key>`.

| Param | Who sets value | Notes |
|---|---|---|
| `/storygraph/oauth/google/client_id` | user (post-deploy) | from Google Cloud Console |
| `/storygraph/oauth/google/client_secret` | user | SecureString |
| `/storygraph/oauth/apple/*` | user | Apple service id / key |
| `/storygraph/oauth/microsoft/*` | user | Entra app reg |

CDK declares these as `ssm.StringParameter` of type `SecureString` with a
placeholder value `"REPLACE_ME"` and `RETAIN` removal policy (so user-set
values survive stack updates). Document in §8 that the user overwrites them
via `aws ssm put-parameter --overwrite` after first deploy, then
re-deploys/updates Cognito IdPs. The DB credential is **not** here — it's
the RDS-managed Secrets Manager secret (§4).

## 6. Cognito — `cognito.UserPool` + client + domain + IdPs

- UserPool: `selfSignUpEnabled: false` (federated only),
  `signInAliases: { email: true }`,
  `standardAttributes: { email: { required: true, mutable: true } }`,
  `autoVerify: { email: true }`, `removalPolicy: RETAIN`,
  `mfa: OPTIONAL`, advanced security `AUDIT`.
- **Federated IdPs** (`UserPoolIdentityProviderGoogle/Apple/Oidc`):
  client id/secret read via
  `ssm.StringParameter.fromSecureStringParameterAttributes(...)` at deploy
  time (NOT hardcoded). **Attribute mapping**: map provider email →
  Cognito `email`, and force `email_verified` true via the provider mapping
  / a pre-token-generation note. *This directly resolves the Phase 2
  review follow-up* (federated tokens missing verified email). Microsoft =
  generic OIDC provider (Entra `/v2.0` issuer).
- App client (`addClient`): **public client, `generateSecret: false`**
  (SPA PKCE), `authFlows: { userSrp: false }`,
  `oAuth: { flows: { authorizationCodeGrant: true },
  scopes: [OPENID, EMAIL, PROFILE],
  callbackUrls: [<AppRunner URL>, http://localhost:5173],
  logoutUrls: [...] }`, `supportedIdentityProviders: [GOOGLE, APPLE,
  <microsoft>]`, `preventUserExistenceErrors: true`,
  token validity: ID/access 60 min, refresh 30 days.
- Hosted-UI domain: `userPool.addDomain` with a Cognito prefix domain
  (`storygraph-<accountid>`); no custom domain/ACM (cost).
- Circular-dependency note: the App Runner service URL is needed in the
  client callback list but isn't known until App Runner is created, and
  App Runner needs Cognito ids as env. Resolve by: create UserPool+client
  WITHOUT the App Runner URL first, pass Cognito ids into App Runner env,
  then add the App Runner default domain to callback/logout URLs via a
  second deploy OR a `cognito.CfnUserPoolClient` updated post-hoc. Spec:
  parameterize callback URLs through an SSM/string context value
  `appUrl` (default to localhost) so first deploy works; document the
  one-time "re-run with -c appUrl=<url>" step in §8.

## 7. App Runner — `@aws-cdk/aws-apprunner-alpha` or L1 `CfnService`

- Source: ECR image (the repo from §3), `latest` tag, auto-deploy on push.
- Instance config: **0.25 vCPU / 0.5 GB**.
- `autoScalingConfiguration`: minSize 1, maxSize 3, maxConcurrency 50.
- Health check: HTTP path `/` (the SPA index) or `/api/docs`, interval 10s.
- VPC connector: in the VPC, security group `appRunnerConnectorSg`
  (egress only). `egressType: VPC` only if DB is the sole private dep —
  but App Runner also needs public egress for Cognito JWKS, so use
  **`egressConfiguration` = DEFAULT (public)** and reach RDS via the VPC
  connector attached for the DB SG path. (If the chosen App Runner API
  forces a single egress mode, prefer DEFAULT public egress + ensure RDS
  reachable; revisit in review.)
- **Instance role (least privilege)** — the running container's role:
  - `secretsmanager:GetSecretValue` on **exactly** the RDS master secret ARN
  - `ssm:GetParameter`/`GetParameters` on **exactly** `arn:.../storygraph/*`
  - `kms:Decrypt` on **only** the SSM + Secrets Manager CMKs used above
  - nothing else. No `*` resources, no broad actions.
- **Access role** (ECR pull): managed
  `AWSAppRunnerServicePolicyForECRAccess` scoped to the repo, or an inline
  least-priv policy for `ecr:GetDownloadUrlForLayer`,`BatchGetImage`,
  `GetAuthorizationToken`.
- Env vars injected: `DB_HOST` (RDS endpoint), `DB_PORT`, `DB_NAME`,
  `DB_USER`/`DB_PASSWORD` (from the RDS Secrets Manager secret via runtime
  fetch OR App Runner secret refs), `DB_SSLMODE=require`,
  `COGNITO_REGION`, `COGNITO_USER_POOL_ID`, `COGNITO_APP_CLIENT_ID`.
  Presence of `COGNITO_USER_POOL_ID` flips backend auth ON (per Phase 2 §6).

## 8. CfnOutputs + the user runbook (deploy is USER-performed)

CDK `CfnOutput`: `EcrRepoUri`, `AppRunnerServiceUrl`, `CognitoUserPoolId`,
`CognitoAppClientId`, `CognitoRegion`, `CognitoHostedUiDomain`,
`DbSecretArn`.

These map to app config:
- backend (App Runner env, set by CDK): `COGNITO_*`, `DB_*` — automatic.
- frontend build: `VITE_COGNITO_AUTHORITY =
  https://cognito-idp.<region>.amazonaws.com/<userPoolId>`,
  `VITE_COGNITO_CLIENT_ID = <appClientId>` — baked at `npm run build`
  inside the Docker image; the Dockerfile/runbook must pass them as build
  args (Phase 5 wires this).

**USER-ONLY ACTIONS (I will not/cannot do these):**
1. Create AWS account; configure CLI creds; set an AWS Budgets alarm.
2. `cd infra && npm install`.
3. Register OAuth apps: Google Cloud Console, Apple Developer, Microsoft
   Entra. Note each client id/secret + the Cognito redirect URI
   (`https://<hostedUiDomain>/oauth2/idpresponse`) once known.
4. `npx cdk deploy` (first pass, `-c appUrl=http://localhost:5173`).
5. `aws ssm put-parameter --overwrite` the real OAuth secrets into the
   `/storygraph/oauth/*` SecureString params.
6. Re-deploy `-c appUrl=<AppRunnerServiceUrl>` so Cognito callback URLs +
   IdPs finalize.
7. Build & push the container image to ECR (Phase 5 runbook gives exact
   commands incl. `--build-arg VITE_*`).

## 9. Opus review-gate checklist (before Phase 4 commit)

- [ ] No security group has 0.0.0.0/0 inbound; DB SG ingress is only the
      App Runner connector SG on 5432
- [ ] RDS `publiclyAccessible:false`, `storageEncrypted:true`,
      `deletionProtection:true`, isolated subnets
- [ ] `natGateways:0`; isolated subnet has no internet route
- [ ] Cognito app client is **public, no secret**, auth-code+PKCE only,
      `preventUserExistenceErrors:true`, federated email→verified mapping
- [ ] IAM instance role: resource-scoped to the specific secret/SSM/KMS
      ARNs; zero `*` resource or `*` action
- [ ] OAuth/secret values never appear in CDK source or synth output
      (only SSM SecureString refs / RDS-managed secret)
- [ ] `removalPolicy: RETAIN` on UserPool, ECR, SSM params, DB (no
      accidental data/secret loss on stack delete)
- [ ] `cdk synth` succeeds offline (no creds, no network)
- [ ] No deploy performed by the agent

## 10. Definition of done

- [ ] `infra/lib/story-graph-stack.ts` implements §2–§8 (Sonnet)
- [ ] required `aws-cdk-lib` constructs + apprunner-alpha in
      `infra/package.json` (Sonnet)
- [ ] `npx cdk synth` clean offline (Sonnet validates)
- [ ] Opus §9 review, then commit
- [ ] Phase 5 writes the end-to-end deploy runbook + the user hands off
