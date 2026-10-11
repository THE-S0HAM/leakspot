# Costs

LeakSpot runs entirely on serverless, pay-per-use AWS services in one CDK stack. Nothing runs (or
bills) between requests except storage. No dollar figures are given here; prices change, so check the
linked AWS pricing pages for your region (the live demo uses ap-south-1, Mumbai).

## What is deployed

| Resource                                              | Billing model                                       | What drives the cost                                                   | Pricing page                                                     |
| ----------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------- |
| CloudFront distribution + 1 CloudFront Function       | Per request and per GB out; function per invocation | Page loads and API calls from judges and phones                        | [CloudFront pricing](https://aws.amazon.com/cloudfront/pricing/) |
| S3 web bucket (the React app)                         | Per GB-month stored, per request                    | A few MB of static files; reads go through the CloudFront cache        | [S3 pricing](https://aws.amazon.com/s3/pricing/)                 |
| S3 photo bucket (citizen photos)                      | Per GB-month stored, per request                    | Each photo is ≤ 400 KB and deleted after 30 days                       | [S3 pricing](https://aws.amazon.com/s3/pricing/)                 |
| Lambda API (1 function, 1024 MB, arm64, Function URL) | Per request and per GB-second                       | One invocation per API call; a tick takes milliseconds of compute      | [Lambda pricing](https://aws.amazon.com/lambda/pricing/)         |
| DynamoDB table (on-demand)                            | Per read/write request and per GB stored            | One item per run, read and written once per tick or action             | [DynamoDB pricing](https://aws.amazon.com/dynamodb/pricing/)     |
| Amazon Bedrock, Nova 2 Lite                           | Per input and output token                          | One call per citizen photo (scripted demo reports do not call Bedrock) | [Bedrock pricing](https://aws.amazon.com/bedrock/pricing/)       |
| CloudWatch Logs (7-day retention)                     | Per GB ingested and stored                          | Lambda request logs; old logs are deleted after 7 days                 | [CloudWatch pricing](https://aws.amazon.com/cloudwatch/pricing/) |

The CDK bootstrap stack (one S3 bucket and an ECR repository for deploy assets) is created once per
account and region and stores only small deployment artifacts.

## Why it stays small at demo traffic

- **No idle cost.** There are no servers, containers, NAT gateways or provisioned capacity. With no
  traffic, the only charges are storage of a few MB.
- **A whole demo day is small.** A simulated day is 56 fifteen-minute slots. Playing it end to end
  is a few hundred Lambda invocations and DynamoDB requests: one per tick or action, plus one read every 3
  seconds while the Command Centre is open and paused.
- **Bedrock is the only per-use cost that scales with people.** It is called once per real citizen
  photo, photos are compressed on the phone before upload, and reports are limited to 20 per 10
  minutes per IP address.
- **Data stays small.** Photos are deleted after 30 days and logs after 7 days. A run is one DynamoDB
  item of a few KB (the table has TTL enabled on `expiresAt`, but runs are not given an expiry yet).
- **Many requests are covered by the AWS Free Tier**, depending on your account's plan and age (see
  each pricing page).

## Keeping an eye on it

- Set an AWS Budget with an email alert on the account before sharing the demo link.
- Use Cost Explorer filtered by service to see Bedrock separately from everything else.
- To stop all charges, delete the stack (`cdk destroy LeakSpot`) and empty the photo bucket.
