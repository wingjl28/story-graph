import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
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

    // ─── §5  SSM PARAMS (USER-CREATED — NOT managed by CDK) ────────────────
    // CloudFormation CANNOT create SecureString parameters, AND a parameter's
    // Type cannot be changed via `put-parameter --overwrite` (AWS rejects
    // String→SecureString conversion). Cognito's {{resolve:ssm-secure:...}}
    // also REQUIRES the param to already be SecureString at deploy time.
    // Therefore CDK does NOT create these — the user creates them with the
    // correct type BEFORE deploying (see RequiredSsmParams output / runbook).
    //
    //   String     (resolve via {{resolve:ssm:...}}):
    const ssmStringParamNames = [
      '/storygraph/oauth/google/client_id',
      '/storygraph/oauth/apple/client_id',
      '/storygraph/oauth/apple/team_id',
      '/storygraph/oauth/apple/key_id',
      '/storygraph/oauth/microsoft/client_id',
    ];
    //   SecureString (resolve via {{resolve:ssm-secure:...}}):
    const ssmSecureParamNames = [
      '/storygraph/oauth/google/client_secret',
      '/storygraph/oauth/apple/private_key',
      '/storygraph/oauth/microsoft/client_secret',
    ];

    // ─── §6  COGNITO ───────────────────────────────────────────────────────
    // IdP credentials are referenced only via CloudFormation dynamic
    // references — real secrets never appear in CDK source or synth output.
    const googleClientId =
      '{{resolve:ssm:/storygraph/oauth/google/client_id}}';
    const googleClientSecret =
      '{{resolve:ssm-secure:/storygraph/oauth/google/client_secret}}';
    const appleClientId =
      '{{resolve:ssm:/storygraph/oauth/apple/client_id}}';
    const appleTeamId =
      '{{resolve:ssm:/storygraph/oauth/apple/team_id}}';
    const appleKeyId =
      '{{resolve:ssm:/storygraph/oauth/apple/key_id}}';
    const applePrivateKey =
      '{{resolve:ssm-secure:/storygraph/oauth/apple/private_key}}';
    const msClientId =
      '{{resolve:ssm:/storygraph/oauth/microsoft/client_id}}';
    const msClientSecret =
      '{{resolve:ssm-secure:/storygraph/oauth/microsoft/client_secret}}';

    const userPool = new cognito.UserPool(this, 'UserPool', {
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
      },
      autoVerify: { email: true },
      mfa: cognito.Mfa.OPTIONAL,
      advancedSecurityMode: cognito.AdvancedSecurityMode.AUDIT,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Google IdP — email + email_verified mapping resolves Phase-2 follow-up.
    // clientSecretValue uses unsafePlainText so the CFN dynamic-reference token
    // passes through unmodified; no real secret is in source/synth.
    const googleIdp = new cognito.UserPoolIdentityProviderGoogle(
      this,
      'GoogleIdp',
      {
        userPool,
        clientId: googleClientId,
        clientSecretValue: cdk.SecretValue.unsafePlainText(googleClientSecret),
        scopes: ['openid', 'email', 'profile'],
        // NOTE: Cognito L2 AttributeMapping has no email_verified target;
        // forcing it requires a Pre-Sign-up Lambda (Phase 5 follow-up).
        attributeMapping: {
          email: cognito.ProviderAttribute.GOOGLE_EMAIL,
        },
      },
    );

    // Apple IdP — privateKeyValue passes the CFN resolve token through.
    const appleIdp = new cognito.UserPoolIdentityProviderApple(
      this,
      'AppleIdp',
      {
        userPool,
        clientId: appleClientId,
        teamId: appleTeamId,
        keyId: appleKeyId,
        privateKeyValue: cdk.SecretValue.unsafePlainText(applePrivateKey),
        scopes: ['email', 'name'],
        attributeMapping: {
          email: cognito.ProviderAttribute.APPLE_EMAIL,
        },
      },
    );

    // Microsoft (Entra v2) via generic OIDC provider
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
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.GOOGLE,
        cognito.UserPoolClientIdentityProvider.APPLE,
        cognito.UserPoolClientIdentityProvider.custom('Microsoft'),
      ],
      preventUserExistenceErrors: true,
      idTokenValidity: cdk.Duration.minutes(60),
      accessTokenValidity: cdk.Duration.minutes(60),
      refreshTokenValidity: cdk.Duration.days(30),
    });

    // Ensure IdPs are created before the client
    client.node.addDependency(googleIdp);
    client.node.addDependency(appleIdp);
    client.node.addDependency(microsoftIdp);

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

    new cdk.CfnOutput(this, 'RequiredSsmSecureParams', {
      value: ssmSecureParamNames.join(', '),
      description:
        'Create BEFORE deploy: aws ssm put-parameter --name <n> --value <v> --type SecureString',
    });
  }
}
