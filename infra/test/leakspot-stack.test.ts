// Verifies the CP0 LeakSpot stack synthesizes to an empty template (zero
// resources beyond CDK's own metadata) and is pinned to the project account and
// region, using only aws-cdk-lib directly so the test needs no AWS credentials.

import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { LeakSpotStack } from "../lib/leakspot-stack";

describe("LeakSpotStack", () => {
  it("synthesizes with no resources beyond CDK metadata", () => {
    const app = new App();
    const stack = new LeakSpotStack(app, "LeakSpot", {
      env: { account: "753036487793", region: "ap-south-1" },
    });

    const template = Template.fromStack(stack);
    const resources = template.toJSON().Resources ?? {};
    const nonMetadata = Object.values(resources).filter(
      (resource) => (resource as { Type?: string }).Type !== "AWS::CDK::Metadata",
    );

    expect(nonMetadata).toHaveLength(0);
  });

  it("pins the stack to the LeakSpot account and ap-south-1 region", () => {
    const app = new App();
    const stack = new LeakSpotStack(app, "LeakSpot", {
      env: { account: "753036487793", region: "ap-south-1" },
    });

    expect(stack.account).toBe("753036487793");
    expect(stack.region).toBe("ap-south-1");
  });
});
