import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

/**
 * Story Graph infrastructure stack.
 *
 * SKELETON ONLY — real resources are defined in Phase 4 of DEPLOYMENT_PLAN.md.
 * Planned resources (see DEPLOYMENT_PLAN.md section 4):
 *  - VPC (2 AZs, public + private subnets, NO NAT gateway)
 *  - ECR repository (lifecycle: keep last 5 images)
 *  - Cognito User Pool + app client (PKCE) + hosted UI domain + federated IdPs
 *  - RDS PostgreSQL db.t4g.micro, single-AZ, private subnet
 *  - App Runner service (0.25 vCPU / 0.5 GB, VPC connector to RDS)
 *  - SSM Parameter Store SecureString params for DB + OAuth secrets
 *  - CloudWatch log retention 14 days
 */
export class StoryGraphStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // TODO(Phase 4): define resources per DEPLOYMENT_PLAN.md section 4.
  }
}
