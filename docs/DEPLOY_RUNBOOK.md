# Story Graph — Deploy Runbook (USER-PERFORMED)

Everything Claude can build is built. These steps require **your** AWS
account, your OAuth developer accounts, and your credentials — Claude
cannot do them for you. Copy-paste friendly; replace `<...>` placeholders.

## 0. Prerequisites (your machine)

### 0.1 Which terminal to use (Windows)

This runbook is written in **bash** (`export VAR=...`, `$(...)`). On Windows
those do **not** work in PowerShell or cmd. Use **Git Bash**, which was
installed with Git for Windows (you already ran `git clone`, so you have it):

- Start menu → type "Git Bash" → open it.
- `cd` to the repo, e.g.:
  ```bash
  cd /c/Users/wingjl28/Projects/story-graph
  ```
  (In Git Bash, `C:\Users\...` is written `/c/Users/...`.)
- Run **every** command block in this file from Git Bash. (WSL Ubuntu also
  works if you prefer.)
- **Critical Git-Bash fix — run this FIRST, before anything else:**
  ```bash
  export MSYS_NO_PATHCONV=1
  ```
  Without it, Git Bash silently rewrites any argument starting with `/`
  into a Windows path (e.g. `--name /storygraph/...` becomes
  `C:/Program Files/Git/storygraph/...`), which breaks every
  `aws ssm put-parameter --name /...` and IAM ARN in this runbook.
  (Not needed on WSL/Linux/macOS.)

> Both `export` lines above (and the §0.4 vars) live only for the current
> terminal session. Keep one Git Bash window open for the whole runbook.
> If you close it, re-run `export MSYS_NO_PATHCONV=1` and the §0.4 block
> before continuing.

### 0.2 Verify the AWS CLI is configured

You ran `aws configure` with your access key — confirm it actually works:

```bash
aws --version                 # expect: aws-cli/2.x  (must be v2, not 1.x)
aws configure list            # shows access_key (masked), region, profile
aws sts get-caller-identity   # the real test — see below
```

`aws sts get-caller-identity` should print JSON with `Account`, `UserId`,
`Arn`. If it does, your credentials work. If it errors
(`Unable to locate credentials` / `InvalidClientTokenId`), redo
`aws configure` (Access key ID + Secret access key from the IAM user you
gave `AdministratorAccess` + MFA — your Option A choice).

If `aws configure list` shows **no region**, set one:
```bash
aws configure set region us-east-1
```

### 0.3 Verify the other tools

```bash
node -v          # expect v20.x or newer
docker --version # any recent; also ensure Docker Desktop is RUNNING
git --version    # any
```

**Python 3.14 — fine, not a blocker.** The deploy itself uses **no local
Python**: CDK runs on Node, and DB migrations run automatically inside the
container on startup. Local Python is only needed for the *optional*
legacy-data import in §6, whose dependencies pin to Python **3.12**. If you
choose to run that import later, install Python 3.12 and use a venv just
for it (instructions in §6) — otherwise your 3.14 is irrelevant here.
You do **not** need to do anything about Python now.

### 0.4 Set the deploy variables (run this block in Git Bash)

These commands just compute and store values reused by later steps — the
last line prints the redirect URI you'll paste into the 3 OAuth apps in §1.

```bash
export AWS_REGION=us-east-1                     # pick your region (match §0.2)
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export HOSTED_UI_DOMAIN="storygraph-${ACCOUNT_ID}"
export IDP_REDIRECT="https://${HOSTED_UI_DOMAIN}.auth.${AWS_REGION}.amazoncognito.com/oauth2/idpresponse"
echo "ACCOUNT_ID = $ACCOUNT_ID"
echo "Use this redirect URI in all 3 OAuth apps: $IDP_REDIRECT"
```

If `ACCOUNT_ID` prints empty, your AWS CLI isn't configured — fix §0.2
first. A 12-digit number means you're good to proceed to §1.

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

> **Windows/Git Bash:** you must have run `export MSYS_NO_PATHCONV=1`
> (§0.1) or every `--name /storygraph/...` becomes a mangled
> `C:/Program Files/Git/...` path and fails. Also requires the IAM user
> to actually have `AdministratorAccess` attached (verify:
> `aws iam list-attached-user-policies --user-name <you>`), else you get
> `AccessDeniedException ... ssm:PutParameter`.
> Prefer the **AWS Console → Systems Manager → Parameter Store → Create
> parameter** if you'd rather avoid the CLI for these 8 — names must be
> exactly as below, types as labelled.

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
npx cdk deploy --require-approval never                   # appUrl defaults to localhost
```

> `--require-approval never` is used on purpose: this stack's IAM/security-
> group changes were already designed + security-reviewed
> (docs/PHASE4_REVIEW.md §9, docs/PHASE5_FINAL_REVIEW.md). Git Bash on
> Windows also can't service CDK's interactive approval prompt (no TTY), so
> the flag is required there regardless. RDS `deletionProtection` +
> `RETAIN` on RDS/ECR/Cognito remain your real safety net.

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
cd infra && npx cdk deploy --require-approval never   # App Runner now finds the image
export APP_URL=$(aws cloudformation describe-stacks --stack-name StoryGraphStack --query "Stacks[0].Outputs[?OutputKey=='AppRunnerServiceUrl'].OutputValue" --output text)
npx cdk deploy --require-approval never -c appUrl="https://${APP_URL}"   # adds the real SPA callback/logout URL to Cognito
```

> If you change `VITE_*` (e.g. after the appUrl is known you may want the
> SPA's OIDC redirect to be the App Runner URL), rebuild & push the image
> (step 4) with `--build-arg VITE_COGNITO_REDIRECT_URI="https://${APP_URL}"`,
> then App Runner auto-deploys the new image.

## 6. Database migrations

Automatic: the container runs `alembic upgrade head` on startup
(`backend.database.init_db()` via FastAPI lifespan). No manual step.

### Optional — import the old single-tenant SQLite data

This is **optional and non-critical** (the old `story_graph.db` is local
dev data). Skip it unless you specifically want that data in the cloud.

**Important constraint:** RDS lives in a *private isolated* subnet with no
public access (by design — see the security review). You therefore
**cannot run this from your laptop** against the cloud DB. Pick one:

- **Easiest — just don't.** Start fresh in the deployed app. Recommended
  for a 10-user launch.
- **If you must import it:** run the script from *inside the VPC*. Least-
  effort path: launch a tiny throwaway EC2 (Amazon Linux, in a private
  subnet of the stack's VPC, SG allowed to reach the DB SG on 5432),
  `scp` `story_graph.db` + the repo onto it, then run the command below
  there with the `DB_*` env pointing at the RDS endpoint + the Secrets
  Manager credentials (`DbSecretArn` output). Terminate the EC2 after.

Local Python note: the script's deps pin to **Python 3.12** (your machine
has 3.14). On whatever machine you run it, use a 3.12 venv:
```bash
py -3.12 -m venv .venv            # or: python3.12 -m venv .venv
source .venv/Scripts/activate     # Git Bash on Windows
#   (Linux/EC2: source .venv/bin/activate)
pip install -r requirements.txt

# one-off, after you've signed in once so a Cognito sub exists for you:
BOOTSTRAP_OWNER_SUB=<your-cognito-sub> BOOTSTRAP_OWNER_EMAIL=<you@x.com> \
LEGACY_SQLITE_PATH=story_graph.db \
DB_HOST=<rds-endpoint> DB_PORT=5432 DB_NAME=postgres \
DB_USER=<from-secret> DB_PASSWORD=<from-secret> DB_SSLMODE=require \
python -m backend.scripts.backfill_legacy
```
(Find your Cognito `sub`: sign in to the deployed app, then in the browser
devtools decode the ID token, or check the Cognito console → Users.)

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
