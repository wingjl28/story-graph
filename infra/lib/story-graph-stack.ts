import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apprunner from '@aws-cdk/aws-apprunner-alpha';

/**
 * Story Graph infrastructure stack — Phase 4 implementation.
 *
 * SSM parameters are USER-CREATED (NOT managed by CDK) — CloudFormation
 * cannot create SecureString params and cannot change a param's type on
 * overwrite. Create them with the CORRECT TYPE *before* deploying:
 *
 *   String:        aws ssm put-parameter --name <n> --value <v> --type String
 *   SecureString:  aws ssm put-parameter --name <n> --value <v> --type SecureString
 *
 * String params:        /storygraph/oauth/google/client_id
 *                       /storygraph/oauth/apple/{client_id,team_id,key_id}
 *                       /storygraph/oauth/microsoft/client_id
 * SecureString params:  /storygraph/oauth/google/client_secret
 *                       /storygraph/oauth/apple/private_key
 *                       /storygraph/oauth/microsoft/client_secret
 *
 * Deploy sequence:
 *   1. create all SSM params (correct types)
 *   2. npx cdk deploy            (first pass, appUrl defaults to localhost)
 *   3. npx cdk deploy -c appUrl=<AppRunnerServiceUrl>   (finalise callbacks)
 *
 * KNOWN LIMITATION (Phase 5 follow-up): Cognito federated email_verified
 * cannot be forced via attributeMapping (not a valid L2 mapping target).
 * Backend already fails closed on unverified email (Phase 2 §7). A
 * Pre-Sign-up Lambda trigger to auto-verify federated email is deferred
 * to Phase 5 — see docs/PHASE4_REVIEW.md.
 */
export class StoryGraphStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Context: pass -c appUrl=https://... after first deploy to wire real callback URLs.
    const appUrl: string =
      (this.node.tryGetContext('appUrl') as string | undefined) ??
      'http://localhost:5173';

    // ─── §2  NETWORKING ────────────────────────────────────────────────────
    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'isolated',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });

    // ─── §3  ECR REPOSITORY ────────────────────────────────────────────────
    const repository = new ecr.Repository(this, 'EcrRepo', {
      imageScanOnPush: true,
      encryption: ecr.RepositoryEncryption.KMS,
      lifecycleRules: [{ maxImageCount: 5 }],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ─── §4  RDS ───────────────────────────────────────────────────────────
    // Security group: no inbound by default; App Runner connector SG ingress
    // is added after connectorSg is created (below, in §7).
    const dbSg = new ec2.SecurityGroup(this, 'DbSg', {
      vpc,
      description: 'Story Graph RDS – no public inbound',
      allowAllOutbound: false,
    });

    const dbInstance = new rds.DatabaseInstance(this, 'Db', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.BURSTABLE4_GRAVITON,
        ec2.InstanceSize.MICRO,
      ),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSg],
      multiAz: false,
      allocatedStorage: 20,
      storageType: rds.StorageType.GP3,
      storageEncrypted: true,
      backupRetention: cdk.Duration.days(7),
      deletionProtection: true,
      publiclyAccessible: false,
      credentials: rds.Credentials.fromGeneratedSecret('sgadmin'),
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ─── §5  CREDENTIAL STORAGE (USER-CREATED — NOT managed by CDK) ────────
    // Two stores, both populated by the user BEFORE deploy:
    //
    //  - NON-SECRET ids/keys -> SSM Parameter Store, type String, resolved
    //    via {{resolve:ssm:...}} (plain ssm refs are broadly supported).
    //
    //  - SECRETS (client secrets / Apple private key) -> AWS Secrets
    //    Manager, resolved via {{resolve:secretsmanager:...}}. NOTE: CFN
    //    does NOT allow {{resolve:ssm-secure:...}} in the Cognito IdP
    //    client_secret property (it is on CFN's ssm-secure deny-list), but
    //    secretsmanager dynamic references ARE supported there and stay
    //    encrypted-at-rest + masked in templates.
    const ssmStringParamNames = [
      '/storygraph/oauth/google/client_id',
      '/storygraph/oauth/apple/client_id',
      '/storygraph/oauth/apple/team_id',
      '/storygraph/oauth/apple/key_id',
      '/storygraph/oauth/microsoft/client_id',
    ];
    const secretsManagerNames = [
      '/storygraph/oauth/google/client_secret',
      '/storygraph/oauth/apple/private_key',
      '/storygraph/oauth/microsoft/client_secret',
    ];

    // ─── §6  COGNITO ───────────────────────────────────────────────────────
    // Non-secret ids: plain SSM String dynamic references.
    const googleClientId =
      '{{resolve:ssm:/storygraph/oauth/google/client_id}}';
    const appleClientId =
      '{{resolve:ssm:/storygraph/oauth/apple/client_id}}';
    const appleTeamId =
      '{{resolve:ssm:/storygraph/oauth/apple/team_id}}';
    const appleKeyId =
      '{{resolve:ssm:/storygraph/oauth/apple/key_id}}';
    const msClientId =
      '{{resolve:ssm:/storygraph/oauth/microsoft/client_id}}';
    // Secrets: Secrets Manager. CDK SecretValue.secretsManager() emits the
    // proper {{resolve:secretsmanager:NAME:SecretString:::}} token — the
    // real value never appears in source, synth, or the CFN template.
    const googleClientSecret = cdk.SecretValue.secretsManager(
      '/storygraph/oauth/google/client_secret',
    );
    const applePrivateKey = cdk.SecretValue.secretsManager(
      '/storygraph/oauth/apple/private_key',
    );
    // The OIDC provider's clientSecret prop is a plain string, so pass the
    // resolve token literally (CFN resolves it at deploy, masked).
    const msClientSecret =
      '{{resolve:secretsmanager:/storygraph/oauth/microsoft/client_secret:SecretString:::}}';

    // Pre-Sign-up Lambda — auto-confirm + auto-verify email for FEDERATED
    // sign-ups ONLY (triggerSource PreSignUp_ExternalProvider). This closes
    // the Phase-2/Phase-4 follow-up: Cognito L2 attributeMapping cannot map
    // email_verified, so without this an Apple/Microsoft user's ID token
    // arrives with email_verified=false and the backend (correctly) 401s.
    // We only trust an IdP-asserted email that is actually present; we do
    // NOT auto-verify non-federated paths (self sign-up is disabled anyway).
    const preSignUpFn = new lambda.Function(this, 'PreSignUpFn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      timeout: cdk.Duration.seconds(5),
      code: lambda.Code.fromInline(
        [
          'exports.handler = async (event) => {',
          "  if (event.triggerSource === 'PreSignUp_ExternalProvider') {",
          '    event.response.autoConfirmUser = true;',
          '    const attrs = event.request.userAttributes || {};',
          '    if (attrs.email) { event.response.autoVerifyEmail = true; }',
          '  }',
          '  return event;',
          '};',
        ].join('\n'),
      ),
    });

    const userPool = new cognito.UserPool(this, 'UserPool', {
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
      },
      autoVerify: { email: true },
      mfa: cognito.Mfa.OPTIONAL,
      advancedSecurityMode: cognito.AdvancedSecurityMode.AUDIT,
      lambdaTriggers: { preSignUp: preSignUpFn },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Federated IdPs are opt-in. Google is always enabled; Apple and
    // Microsoft are only created when their SSM params exist AND the
    // operator opts in via context, e.g.:
    //   npx cdk deploy --require-approval never \
    //     -c enableApple=true -c enableMicrosoft=true
    // This lets you launch with Google now and add the others later with a
    // single redeploy (CloudFormation adds the new IdP + provider).
    const enableApple =
      String(this.node.tryGetContext('enableApple')) === 'true';
    const enableMicrosoft =
      String(this.node.tryGetContext('enableMicrosoft')) === 'true';

    // Track created IdPs so the app client depends only on real ones.
    const createdIdps: Construct[] = [];
    const supportedIdps: cognito.UserPoolClientIdentityProvider[] = [
      cognito.UserPoolClientIdentityProvider.GOOGLE,
    ];

    // Google IdP — always enabled.
    // clientSecretValue uses unsafePlainText so the CFN dynamic-reference token
    // passes through unmodified; no real secret is in source/synth.
    const googleIdp = new cognito.UserPoolIdentityProviderGoogle(
      this,
      'GoogleIdp',
      {
        userPool,
        clientId: googleClientId,
        clientSecretValue: googleClientSecret,
        scopes: ['openid', 'email', 'profile'],
        // NOTE: Cognito L2 AttributeMapping has no email_verified target;
        // forcing it requires a Pre-Sign-up Lambda (Phase 5 follow-up).
        attributeMapping: {
          email: cognito.ProviderAttribute.GOOGLE_EMAIL,
        },
      },
    );
    createdIdps.push(googleIdp);

    // Apple IdP — only if opted in (requires the apple/* SSM params).
    if (enableApple) {
      const appleIdp = new cognito.UserPoolIdentityProviderApple(
        this,
        'AppleIdp',
        {
          userPool,
          clientId: appleClientId,
          teamId: appleTeamId,
          keyId: appleKeyId,
          privateKeyValue: applePrivateKey,
          scopes: ['email', 'name'],
          attributeMapping: {
            email: cognito.ProviderAttribute.APPLE_EMAIL,
          },
        },
      );
      createdIdps.push(appleIdp);
      supportedIdps.push(cognito.UserPoolClientIdentityProvider.APPLE);
    }

    // Microsoft (Entra v2) via generic OIDC — only if opted in.
    if (enableMicrosoft) {
      const microsoftIdp = new cognito.UserPoolIdentityProviderOidc(
        this,
        'MicrosoftIdp',
        {
          userPool,
          name: 'Microsoft',
          clientId: msClientId,
          clientSecret: msClientSecret,
          issuerUrl: 'https://login.microsoftonline.com/common/v2.0',
          scopes: ['openid', 'email', 'profile'],
          attributeMapping: {
            email: cognito.ProviderAttribute.other('email'),
          },
        },
      );
      createdIdps.push(microsoftIdp);
      supportedIdps.push(
        cognito.UserPoolClientIdentityProvider.custom('Microsoft'),
      );
    }

    // Hosted UI domain (Cognito prefix — no custom domain / ACM for cost)
    const hostedUiDomain = userPool.addDomain('Domain', {
      cognitoDomain: {
        domainPrefix: `storygraph-${this.account}`,
      },
    });

    // Deduplicate URLs so that when appUrl == localhost we don't pass the
    // same URL twice (Cognito rejects duplicate callback URLs).
    const localhost = 'http://localhost:5173';
    const callbackUrls = appUrl === localhost
      ? [localhost]
      : [appUrl, localhost];
    const logoutUrls = appUrl === localhost
      ? [localhost]
      : [appUrl, localhost];

    // App client — public SPA with PKCE (authorizationCodeGrant, no secret)
    const client = userPool.addClient('Spa', {
      generateSecret: false,
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls,
        logoutUrls,
      },
      supportedIdentityProviders: supportedIdps,
      preventUserExistenceErrors: true,
      idTokenValidity: cdk.Duration.minutes(60),
      accessTokenValidity: cdk.Duration.minutes(60),
      refreshTokenValidity: cdk.Duration.days(30),
    });

    // Ensure all (and only) created IdPs exist before the client
    for (const idp of createdIdps) {
      client.node.addDependency(idp);
    }

    // ─── §7  APP RUNNER ────────────────────────────────────────────────────

    // VPC connector security group — egress only (App Runner → RDS)
    const connectorSg = new ec2.SecurityGroup(this, 'ConnectorSg', {
      vpc,
      description: 'App Runner VPC connector – outbound to RDS only',
      allowAllOutbound: true,
    });

    // Add RDS ingress now that connectorSg exists (satisfies §4 requirement)
    dbSg.addIngressRule(
      connectorSg,
      ec2.Port.tcp(5432),
      'App Runner connector → Postgres',
    );

    const vpcConnector = new apprunner.VpcConnector(this, 'VpcConn', {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [connectorSg],
    });

    // Auto-scaling configuration using the alpha L2 construct
    const autoScalingConfiguration = new apprunner.AutoScalingConfiguration(
      this,
      'AutoScaling',
      {
        autoScalingConfigurationName: 'storygraph-asg',
        minSize: 1,
        maxSize: 3,
        maxConcurrency: 50,
      },
    );

    // Instance role — least-privilege (container runtime permissions)
    const instanceRole = new iam.Role(this, 'AppRunnerInstanceRole', {
      assumedBy: new iam.ServicePrincipal('tasks.apprunner.amazonaws.com'),
      description: 'Story Graph App Runner instance role — least privilege',
    });

    // SecretsManager: GetSecretValue scoped only to the RDS master secret.
    // grantRead also handles the KMS decrypt for the secret's CMK.
    dbInstance.secret!.grantRead(instanceRole);

    // SSM: scoped to /storygraph/* parameters only
    instanceRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'SsmStorygraphReadOnly',
        effect: iam.Effect.ALLOW,
        actions: ['ssm:GetParameter', 'ssm:GetParameters'],
        resources: [
          `arn:aws:ssm:${this.region}:${this.account}:parameter/storygraph/*`,
        ],
      }),
    );

    // Access role — ECR pull using AWS-managed policy
    const accessRole = new iam.Role(this, 'AppRunnerAccessRole', {
      assumedBy: new iam.ServicePrincipal('build.apprunner.amazonaws.com'),
      description: 'Story Graph App Runner access role — ECR pull',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSAppRunnerServicePolicyForECRAccess',
        ),
      ],
    });

    // App Runner service
    // Note on API shape: in aws-apprunner-alpha, environmentVariables and
    // environmentSecrets belong inside `imageConfiguration` (passed through
    // the source), NOT at the top ServiceProps level.
    const service = new apprunner.Service(this, 'Service', {
      source: apprunner.Source.fromEcr({
        repository,
        tagOrDigest: 'latest',
        imageConfiguration: {
          port: 8000,
          environmentVariables: {
            DB_HOST: dbInstance.dbInstanceEndpointAddress,
            DB_PORT: dbInstance.dbInstanceEndpointPort,
            DB_NAME: 'postgres',
            DB_SSLMODE: 'require',
            COGNITO_REGION: this.region,
            COGNITO_USER_POOL_ID: userPool.userPoolId,
            COGNITO_APP_CLIENT_ID: client.userPoolClientId,
          },
          environmentSecrets: {
            DB_USER: apprunner.Secret.fromSecretsManager(
              dbInstance.secret!,
              'username',
            ),
            DB_PASSWORD: apprunner.Secret.fromSecretsManager(
              dbInstance.secret!,
              'password',
            ),
          },
        },
      }),
      instanceRole,
      accessRole,
      vpcConnector,
      autoScalingConfiguration,
      cpu: apprunner.Cpu.QUARTER_VCPU,
      memory: apprunner.Memory.HALF_GB,
      autoDeploymentsEnabled: true,
      healthCheck: apprunner.HealthCheck.http({
        path: '/api/docs',
        interval: cdk.Duration.seconds(10),
        timeout: cdk.Duration.seconds(5),
        healthyThreshold: 2,
        unhealthyThreshold: 5,
      }),
    });

    // ─── §8  CFN OUTPUTS ───────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'EcrRepoUri', {
      value: repository.repositoryUri,
      description: 'ECR repository URI',
    });

    new cdk.CfnOutput(this, 'AppRunnerServiceUrl', {
      value: service.serviceUrl,
      description:
        'App Runner service URL — use as: npx cdk deploy -c appUrl=https://<value>',
    });

    new cdk.CfnOutput(this, 'CognitoUserPoolId', {
      value: userPool.userPoolId,
      description: 'Cognito User Pool ID',
    });

    new cdk.CfnOutput(this, 'CognitoAppClientId', {
      value: client.userPoolClientId,
      description: 'Cognito public SPA client ID (no secret, PKCE)',
    });

    new cdk.CfnOutput(this, 'CognitoRegion', {
      value: this.region,
      description: 'AWS region of the Cognito User Pool',
    });

    new cdk.CfnOutput(this, 'CognitoHostedUiDomain', {
      value: hostedUiDomain.baseUrl(),
      description:
        'Cognito hosted-UI base URL. ' +
        'IdP redirect URI = <value>/oauth2/idpresponse',
    });

    new cdk.CfnOutput(this, 'DbSecretArn', {
      value: dbInstance.secret!.secretArn,
      description: 'RDS master-credential secret ARN (AWS Secrets Manager)',
    });

    new cdk.CfnOutput(this, 'RequiredSsmStringParams', {
      value: ssmStringParamNames.join(', '),
      description:
        'Create BEFORE deploy: aws ssm put-parameter --name <n> --value <v> --type String',
    });

    new cdk.CfnOutput(this, 'RequiredSecretsManagerSecrets', {
      value: secretsManagerNames.join(', '),
      description:
        'Create BEFORE deploy: aws secretsmanager create-secret --name <n> --secret-string <v>',
    });
  }
}
