// The single LeakSpot CDK v2 stack (deadline mode): web bucket + CloudFront (OAC to S3,
// SPA rewrite function), a /api/* behaviour to the API Lambda Function URL (AuthType NONE,
// no OAC), a private photo bucket, one provisioned DynamoDB table, and the API Lambda.
// Resources cut by 00-deadline-mode.md (worker, scheduler, SNS, alarms, dashboard, OAC-to-Lambda)
// are intentionally absent. Output: SiteUrl.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import {
  AllowedMethods,
  CachePolicy,
  Distribution,
  Function as CfFunction,
  FunctionCode,
  FunctionEventType,
  OriginRequestPolicy,
  ViewerProtocolPolicy,
} from "aws-cdk-lib/aws-cloudfront";
import { FunctionUrlOrigin, S3BucketOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";
import { AnyPrincipal, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Architecture, FunctionUrlAuthType, Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { BlockPublicAccess, Bucket, BucketEncryption } from "aws-cdk-lib/aws-s3";
import { type Construct } from "constructs";

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(thisDir, "..", "..");

const BEDROCK_MODEL_ID = "global.amazon.nova-2-lite-v1:0";

// SPA rewrite for the default (web) behaviour only: extension-less paths map to /index.html.
const SPA_REWRITE = `
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (uri === '/' || uri.indexOf('.') === -1) {
    request.uri = '/index.html';
  }
  return request;
}
`;

export class LeakSpotStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const table = new Table(this, "Table", {
      partitionKey: { name: "pk", type: AttributeType.STRING },
      sortKey: { name: "sk", type: AttributeType.STRING },
      billingMode: BillingMode.PROVISIONED,
      readCapacity: 25,
      writeCapacity: 25,
      timeToLiveAttribute: "expiresAt",
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const photoBucket = new Bucket(this, "PhotoBucket", {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      lifecycleRules: [{ prefix: "photos/", expiration: Duration.days(30) }],
    });

    const apiFn = new NodejsFunction(this, "ApiFn", {
      entry: path.join(repoRoot, "services", "api", "src", "handlers", "api.ts"),
      handler: "handler",
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      memorySize: 512,
      timeout: Duration.seconds(15),
      logGroup: new LogGroup(this, "ApiFnLogs", { retention: RetentionDays.ONE_WEEK }),
      bundling: { format: OutputFormat.ESM, target: "node22" },
      environment: {
        TABLE_NAME: table.tableName,
        PHOTO_BUCKET: photoBucket.bucketName,
        BEDROCK_MODEL_ID,
        COMMAND_CODE_SHA256: readCommandCodeSha256(),
        APP_VERSION: process.env["APP_VERSION"] ?? "0.1.0",
      },
    });

    table.grantReadWriteData(apiFn);
    photoBucket.grantReadWrite(apiFn, "photos/*");
    apiFn.addToRolePolicy(bedrockInvokePolicy(this));

    const fnUrl = apiFn.addFunctionUrl({ authType: FunctionUrlAuthType.NONE });
    // AuthType NONE created via CloudFormation needs an explicit public resource policy. Since
    // Oct 2025 a public function URL requires BOTH lambda:InvokeFunctionUrl and lambda:InvokeFunction
    // (lambda urls-auth.html). CDK's addFunctionUrl adds only InvokeFunctionUrl, so add both here.
    apiFn.addPermission("FnUrlPublicInvokeUrl", {
      principal: new AnyPrincipal(),
      action: "lambda:InvokeFunctionUrl",
      functionUrlAuthType: FunctionUrlAuthType.NONE,
    });
    apiFn.addPermission("FnUrlPublicInvoke", {
      principal: new AnyPrincipal(),
      action: "lambda:InvokeFunction",
      invokedViaFunctionUrl: true,
    });

    const webBucket = new Bucket(this, "WebBucket", {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const spaRewrite = new CfFunction(this, "SpaRewrite", {
      code: FunctionCode.fromInline(SPA_REWRITE),
    });

    const distribution = new Distribution(this, "Distribution", {
      defaultRootObject: "index.html",
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(webBucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        compress: true,
        functionAssociations: [
          { function: spaRewrite, eventType: FunctionEventType.VIEWER_REQUEST },
        ],
      },
      additionalBehaviors: {
        // /api/* goes straight to the Function URL (no OAC, AuthType NONE), caching disabled,
        // all viewer headers except Host forwarded, so the app and API share one origin (no CORS).
        "/api/*": {
          origin: new FunctionUrlOrigin(fnUrl),
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: AllowedMethods.ALLOW_ALL,
          cachePolicy: CachePolicy.CACHING_DISABLED,
          originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
    });

    new CfnOutput(this, "SiteUrl", { value: `https://${distribution.distributionDomainName}` });
  }
}

// A deterministic, obviously-fake hash used when no real code is available (unit synth / tests).
// 64 hex chars so config.ts accepts it; it never matches any real code, so a stack synthesised
// without .env.deploy cannot authenticate command routes. The deploy script refuses to run
// without .env.deploy, so a real deploy always carries the real hash.
const PLACEHOLDER_SHA256 = "0".repeat(64);

/**
 * SHA-256 of the command code for the Lambda env, resolved at synth without emitting the plaintext:
 * an already-set COMMAND_CODE_SHA256 env var wins; otherwise LEAKSPOT_COMMAND_CODE from .env.deploy;
 * otherwise the placeholder (so `cdk synth` and tests work on a checkout with no secret file).
 */
function readCommandCodeSha256(): string {
  const preComputed = process.env["COMMAND_CODE_SHA256"];
  if (preComputed && /^[0-9a-f]{64}$/.test(preComputed)) return preComputed;

  const envPath = path.join(repoRoot, ".env.deploy");
  if (!existsSync(envPath)) return PLACEHOLDER_SHA256;

  const line = readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((candidate) => candidate.startsWith("LEAKSPOT_COMMAND_CODE="));
  const raw = line?.slice("LEAKSPOT_COMMAND_CODE=".length).trim();
  if (!raw) return PLACEHOLDER_SHA256;

  return createHash("sha256").update(raw.toUpperCase()).digest("hex");
}

/** Scope bedrock:InvokeModel to the Nova Lite inference profiles + their foundation-model ARNs. */
function bedrockInvokePolicy(stack: Stack): PolicyStatement {
  const { account, region } = stack;
  return new PolicyStatement({
    actions: ["bedrock:InvokeModel"],
    resources: [
      `arn:aws:bedrock:${region}:${account}:inference-profile/global.amazon.nova-2-lite-v1:0`,
      `arn:aws:bedrock:${region}:${account}:inference-profile/apac.amazon.nova-lite-v1:0`,
      "arn:aws:bedrock:*::foundation-model/amazon.nova-2-lite-v1:0",
      "arn:aws:bedrock:::foundation-model/amazon.nova-2-lite-v1:0",
      "arn:aws:bedrock:*::foundation-model/amazon.nova-lite-v1:0",
      "arn:aws:bedrock:::foundation-model/amazon.nova-lite-v1:0",
    ],
  });
}
