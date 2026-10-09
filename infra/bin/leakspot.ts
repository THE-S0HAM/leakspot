// CDK app entry point. Instantiates the one LeakSpot stack pinned to the project
// account and region as literals (never from env, profile or CDK context), so
// synthesis is deterministic and needs no AWS credentials.

import { App } from "aws-cdk-lib";
import { LeakSpotStack } from "../lib/leakspot-stack";

const app = new App();
new LeakSpotStack(app, "LeakSpot", {
  env: { account: "753036487793", region: "ap-south-1" },
});
