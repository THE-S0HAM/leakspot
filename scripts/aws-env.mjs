// Single source of truth for the AWS profile and region used by every script (deploy, smoke,
// probe-bedrock). Override the profile with LEAKSPOT_AWS_PROFILE; region is fixed to ap-south-1.
// Imported by both .mjs and .ts scripts (tsx resolves .mjs).

export const AWS_PROFILE = process.env.LEAKSPOT_AWS_PROFILE ?? "Dev-AWSTW";
export const AWS_REGION = "ap-south-1";
