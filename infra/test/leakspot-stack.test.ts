// Verifies the deadline-mode LeakSpot stack synthesizes with the expected skeleton:
// one provisioned DynamoDB table, two private S3 buckets, the API Lambda with a public
// (AuthType NONE) Function URL, a CloudFront distribution with one CloudFront Function,
// and a SiteUrl output. Uses only aws-cdk-lib/assertions, so it needs no AWS credentials.
// (Lambda bundling runs esbuild locally and reads .env.deploy for COMMAND_CODE_SHA256.)

import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { LeakSpotStack } from "../lib/leakspot-stack";

function synth(): Template {
  const app = new App();
  const stack = new LeakSpotStack(app, "LeakSpot", {
    env: { account: "753036487793", region: "ap-south-1" },
  });
  return Template.fromStack(stack);
}

describe("LeakSpotStack", () => {
  it("pins the stack to the LeakSpot account and ap-south-1 region", () => {
    const app = new App();
    const stack = new LeakSpotStack(app, "LeakSpot", {
      env: { account: "753036487793", region: "ap-south-1" },
    });
    expect(stack.account).toBe("753036487793");
    expect(stack.region).toBe("ap-south-1");
  });

  it("creates one provisioned DynamoDB table at 25/25 with a TTL and no stream", () => {
    const template = synth();
    template.resourceCountIs("AWS::DynamoDB::Table", 1);
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      BillingMode: Match.absent(),
      ProvisionedThroughput: { ReadCapacityUnits: 25, WriteCapacityUnits: 25 },
      TimeToLiveSpecification: { AttributeName: "expiresAt", Enabled: true },
    });
  });

  it("blocks public access on every S3 bucket", () => {
    const template = synth();
    const buckets = template.findResources("AWS::S3::Bucket");
    expect(Object.keys(buckets).length).toBeGreaterThanOrEqual(2);
    for (const bucket of Object.values(buckets)) {
      expect(bucket.Properties.PublicAccessBlockConfiguration).toEqual({
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      });
    }
  });

  it("runs the API Lambda on arm64 nodejs22 with a 15 s timeout", () => {
    const template = synth();
    template.hasResourceProperties("AWS::Lambda::Function", {
      Runtime: "nodejs22.x",
      Architectures: ["arm64"],
      MemorySize: 512,
      Timeout: 15,
    });
  });

  it("exposes a public Function URL (AuthType NONE)", () => {
    const template = synth();
    template.hasResourceProperties("AWS::Lambda::Url", { AuthType: "NONE" });
  });

  it("retains Lambda logs for one week (7 days)", () => {
    const template = synth();
    template.hasResourceProperties("AWS::Logs::LogGroup", { RetentionInDays: 7 });
  });

  it("has exactly one CloudFront Function and a distribution", () => {
    const template = synth();
    template.resourceCountIs("AWS::CloudFront::Function", 1);
    template.resourceCountIs("AWS::CloudFront::Distribution", 1);
  });

  it("outputs SiteUrl", () => {
    const template = synth();
    const outputs = template.toJSON().Outputs ?? {};
    expect(Object.keys(outputs)).toContain("SiteUrl");
  });
});
