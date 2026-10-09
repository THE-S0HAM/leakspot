// The single LeakSpot CDK v2 stack. Empty in CP0 (zero resources); CP3 adds the
// S3 buckets, DynamoDB table, Lambdas, CloudFront distribution and alarms here.

import { Stack, type StackProps } from "aws-cdk-lib";
import { type Construct } from "constructs";

export class LeakSpotStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
  }
}
