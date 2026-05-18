# Story Graph — Deploy Runbook (USER-PERFORMED)

Everything Claude can build is built. These steps require **your** AWS
account, your OAuth developer accounts, and your credentials — Claude
cannot do them for you. Copy-paste friendly; replace `<...>` placeholders.

## 0. Prerequisites (your machine)

- AWS CLI v2 configured (`aws configure`) with an admin-capable IAM user.
- Node 20+, Docker, Python 3.12.
- `git clone` of this repo.

```bash
export AWS_REGION=us-east-1                     # pick your region
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export HOSTED_UI_DOMAIN="storygraph-${ACCOUNT_ID}"
export IDP_REDIRECT="https://${HOSTED_UI_DOMAIN}.auth.${AWS_REGION}.amazoncognito.com/oauth2/idpresponse"
echo "Use this redirect URI in all 3 OAuth apps: $IDP_REDIRECT"
```

## 1. Register the 3 OAuth apps (external — your developer accounts)

For **each**, set the authorized redirect URI to `$IDP_REDIRECT`.

- **Google**: Google Cloud Console → APIs & Services → Credentials → Create
  OAuth client ID → Web application. Note Client ID + Client secret.
- **Microsoft**: Entra ID → App registrations → New → Web, redirect
  `$IDP_REDIRECT`. Create a client secret. Note Application (client) ID +
  secret. (Issuer used by the stack: `login.microsoftonline.com/common/v2.0`.)
- **Apple**: Apple Developer → Identifiers → Services ID (this is the
  client_id), configure Sign in with Apple, return URL `$IDP_REDIRECT`;
  create a Key (.p8) for Sign in with Apple → note Key ID + Team ID + the
  .p8 private key contents.

## 2. Create the SSM parameters BEFORE deploying

CDK does **not** create these (CFN can't make SecureString, and Cognito
resolves them at deploy). Correct types matter.

```bash
# --- String params ---
aws ssm put-parameter --type String --name /storygraph/oauth/google/client_id      --value "<google_client_id>"
aws ssm put-parameter --type String --name /storygraph/oauth/apple/client_id       --value "<apple_services_id>"
aws ssm put-parameter --type String --name /storygraph/oauth/apple/team_id         --value "<apple_team_id>"
aws ssm put-parameter --type String --name /storygraph/oauth/apple/key_id          --value "<apple_key_id>"
aws ssm put-parameter --type String --name /storygraph/oauth/microsoft/client_id   --value "<ms_client_id>"
# --- SecureString params ---
aws ssm put-parameter --type SecureString --name /storygraph/oauth/google/client_secret     --value "<google_secret>"
aws ssm put-parameter --type SecureString --name /storygraph/oauth/apple/private_key         --value "$(cat AuthKey_XXXX.p8)"
aws ssm put-parameter --type SecureString --name /storygraph/oauth/microsoft/client_secret   --value "<ms_secret>"
```

## 3. Bootstrap + first deploy

```bash
cd infra && npm install
npx cdk bootstrap aws://${ACCOUNT_ID}/${AWS_REGION}      # once per acct/region
npx cdk deploy                                            # appUrl defaults to localhost
```

**Expected:** ECR, RDS, Cognito (+ Pre-Sign-up Lambda), VPC create fine.
The **App Runner service may fail/pause on first deploy because no image
exists yet in ECR** — this is expected. ECR has `RETAIN`, so proceed.

## 4. Build & push the image (auth config is baked in at build time)

Get values from the deploy outputs:

```bash
export ECR_URI=$(aws cloudformation describe-stacks --stack-name StoryGraphStack --query "Stacks[0].Outputs[?OutputKey=='EcrRepoUri'].OutputValue" --output text)
export POOL_ID=$(aws cloudformation describe-stacks --stack-name StoryGraphStack --query "Stacks[0].Outputs[?OutputKey=='CognitoUserPoolId'].OutputValue" --output text)
export CLIENT_ID=$(aws cloudformation describe-stacks --stack-name StoryGraphStack --query "Stacks[0].Outputs[?OutputKey=='CognitoAppClientId'].OutputValue" --output text)

aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin "${ECR_URI%/*}"

cd ..   # repo root (Dockerfile lives here)
docker build \
  --build-arg VITE_COGNITO_AUTHORITY="https://cognito-idp.${AWS_REGION}.amazonaws.com/${POOL_ID}" \
  --build-arg VITE_COGNITO_CLIENT_ID="${CLIENT_ID}" \
  -t "${ECR_URI}:latest" .
docker push "${ECR_URI}:latest"
```

## 5. Re-deploy to finalize App Runner + Cognito callback URLs

```bash
cd infra && npx cdk deploy        # App Runner now finds the image
export APP_URL=$(aws cloudformation describe-stacks --stack-name StoryGraphStack --query "Stacks[0].Outputs[?OutputKey=='AppRunnerServiceUrl'].OutputValue" --output text)
npx cdk deploy -c appUrl="https://${APP_URL}"   # adds the real SPA callback/logout URL to Cognito
```

> If you change `VITE_*` (e.g. after the appUrl is known you may want the
> SPA's OIDC redirect to be the App Runner URL), rebuild & push the image
> (step 4) with `--build-arg VITE_COGNITO_REDIRECT_URI="https://${APP_URL}"`,
> then App Runner auto-deploys the new image.

## 6. Database migrations

Automatic: the container runs `alembic upgrade head` on startup
(`backend.database.init_db()` via FastAPI lifespan). No manual step.

Optional — import the old single-tenant SQLite data:
```bash
# one-off, after you have signed in once so a Cognito sub exists for you
BOOTSTRAP_OWNER_SUB=<your-cognito-sub> BOOTSTRAP_OWNER_EMAIL=<you@x.com> \
LEGACY_SQLITE_PATH=story_graph.db \
python -m backend.scripts.backfill_legacy   # run with prod DB_* env set
```

## 7. Billing guardrail (do this — cost protection)

```bash
aws budgets create-budget --account-id $ACCOUNT_ID --budget '{
  "BudgetName":"storygraph-monthly","BudgetLimit":{"Amount":"50","Unit":"USD"},
  "TimeUnit":"MONTHLY","BudgetType":"COST"}'
```
Add an email notification at 80% in the Budgets console.

## 8. Verify

Open `https://${APP_URL}` → you should hit the Cognito hosted UI → sign in
via Google/Apple/Microsoft → land in the app. Then run
`docs/PHASE5_TEST_PLAN.md` (post-deploy tenant-isolation section).

## 9. Teardown

```bash
cd infra && npx cdk destroy
```
`RETAIN` resources survive on purpose: **RDS instance, ECR repo, Cognito
user pool**, and your SSM params. Delete them manually if you truly want
them gone (this prevents accidental data/secret loss).

## Expected steady-state cost

~$22–30/month (no NAT; t4g.micro single-AZ; 0.25 vCPU App Runner;
Cognito free < 50k MAU; Secrets Manager $0.40 for the one DB secret).
