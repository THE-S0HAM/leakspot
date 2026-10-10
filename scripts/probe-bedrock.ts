// Probe the Bedrock vision path locally with the AWS profile from scripts/aws-env.mjs
// (LEAKSPOT_AWS_PROFILE, default Dev-AWSTW), using the SAME adapter code the Lambda uses (via
// probeConverse), so a local run reproduces production behaviour. Prints the model's raw reply text
// and the parse result for one JPEG. Never prints the photo bytes.
//
// Usage: npx tsx scripts/probe-bedrock.ts <photo.jpg> [--model <modelId>]
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AWS_PROFILE, AWS_REGION } from "./aws-env.mjs";
import {
  probeConverse,
  type BedrockModelId,
} from "../services/api/src/adapters/bedrock/bedrock-vision-adapter";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const PRIMARY: BedrockModelId = "global.amazon.nova-2-lite-v1:0";
const FALLBACK: BedrockModelId = "apac.amazon.nova-lite-v1:0";
const REGION = AWS_REGION;
const PROFILE = AWS_PROFILE;

function parseArgs(argv: readonly string[]): { photo?: string; model: BedrockModelId } {
  const args = argv.slice(2);
  let photo: string | undefined;
  let model: BedrockModelId = PRIMARY;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--model") {
      const next = args[i + 1];
      if (next === FALLBACK || next === PRIMARY) model = next;
      i += 1;
    } else if (arg && !arg.startsWith("--") && !photo) {
      photo = arg;
    }
  }
  return { photo, model };
}

async function main(): Promise<void> {
  const { photo, model } = parseArgs(process.argv);
  if (!photo) throw new Error("probe-bedrock: pass a <photo.jpg> path.");
  const resolved = path.isAbsolute(photo) ? photo : path.join(rootDir, photo);
  if (!existsSync(resolved)) throw new Error(`probe-bedrock: file not found: ${resolved}`);

  const jpeg = new Uint8Array(readFileSync(resolved));
  // Credentials come from the profile via the standard provider chain.
  process.env["AWS_PROFILE"] = process.env["AWS_PROFILE"] ?? PROFILE;
  process.env["AWS_REGION"] = REGION;

  console.log(
    `probe-bedrock: model=${model} region=${REGION} profile=${process.env["AWS_PROFILE"]}`,
  );
  console.log(`probe-bedrock: photo=${photo} bytes=${jpeg.length}`);

  try {
    const { rawText, parsed } = await probeConverse(model, jpeg, REGION);
    console.log("\n--- raw model text ---\n" + (rawText || "(no text block)"));
    console.log("\n--- parse result ---");
    console.log(parsed ? JSON.stringify(parsed, null, 2) : "PARSE FAILED (no valid JSON object)");
  } catch (error) {
    const name = error instanceof Error ? error.name : "UnknownError";
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\nprobe-bedrock: Converse FAILED name=${name} message=${message}`);
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
