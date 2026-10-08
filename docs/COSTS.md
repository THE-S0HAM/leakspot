# Costs and free-tier ledger

Rules: `.kiro/steering/free-tier-guardrails.md`. Re-check allowances with the AWS Pricing MCP at CP0 and CP9.
Account plan (Free or Paid, credits remaining) — fill in from Billing → Free Tier: ______

## Resources
| Resource | Created in CP | Free allowance (verified date) | Expected monthly use | Measured (CP9) |
|---|---|---|---|---|
| Lambda ApiFn + WorkerFn | 3 | | | |
| Lambda Function URL | 3 | | | |
| DynamoDB table (10 RCU / 15 WCU) | 3 | | | |
| CloudFront distribution + 1 function | 3 | | | |
| S3 WebBucket, DataBucket | 3 | | | |
| EventBridge Scheduler (5 min) | 3 | | about 8,640 invocations | |
| CloudWatch logs (7 days), 3 alarms, 1 dashboard | 3 | | | |
| SNS topic + email subscription | 3 | | | |
| Bedrock Nova Lite (cached, capped) | 0 (probe), 3 | none — credits | | |
| CDK bootstrap (CDKToolkit stack) | 0 | | | |

## Bedrock price record
| Date | Model id | Input price / 1K tokens | Output price / 1K tokens | Source (Pricing MCP query) |
|---|---|---|---|---|
| | | | | |

## Cost Explorer snapshots
| Date | Period | Gross cost | Credits applied | Net | Notes |
|---|---|---|---|---|---|
