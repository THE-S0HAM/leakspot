# Architecture decision records

Format for new entries (newest at the bottom):

```
## ADR-NNN: <decision in one line>
Date: YYYY-MM-DD · Status: accepted | superseded by ADR-xxx
Context: why a decision was needed.
Decision: what we chose.
Consequences: what gets better, what we give up, what to watch.
```

The first entries record how the team plan in the ideation doc was cut down for a one-person,
free-tier build. Kiro: do not re-introduce anything listed here without a new ADR that supersedes it.

## ADR-001: Lambda Function URL behind CloudFront instead of API Gateway
Date: 2026-10-09 · Status: accepted
Context: API Gateway is not part of the always-free set for new accounts and adds CORS and a second domain.
Decision: one Lambda Function URL (AuthType AWS_IAM) reached only through CloudFront Origin Access Control,
served under `/api/*` on the same domain as the web app.
Consequences: same-origin, no CORS, always-free. POST bodies must carry `x-amz-content-sha256`, and the
session travels in `x-leakspot-session` because the `Authorization` header conflicts with OAC signing.

## ADR-002: Access code + signed session instead of Amazon Cognito
Date: 2026-10-09 · Status: accepted
Context: judges need instant access; citizens need none; one person cannot also build user management.
Decision: public citizen side; one shared 8-character command code (SHA-256 compared in Lambda) exchanged
for a 12-hour HMAC-signed session token. The code lives only in `.env.deploy`.
Consequences: no user accounts or roles beyond "command". Brute force is rate-limited. Rotation = redeploy.

## ADR-003: Async worker Lambda + stage log instead of Step Functions
Date: 2026-10-09 · Status: accepted
Context: the report pipeline is five short steps; Step Functions adds cost risk and setup for a solo build.
Decision: the API Lambda returns 202 and invokes a worker Lambda asynchronously; the worker appends each
stage to the report item, which the UI polls to drive the PipelineLog.
Consequences: the loader still shows real pipeline state; retries are handled by Lambda async retry +
idempotent stage writes.

## ADR-004: No SMS or phone numbers; SNS used only for alarm email
Date: 2026-10-09 · Status: accepted
Context: SMS is billed per message and Indian SMS needs sender registration; phone numbers are personal data.
Decision: citizens track tickets in the app; SNS sends CloudWatch alarm emails to the developer only.
Consequences: no notification when a repair is confirmed unless the citizen reopens the ticket.

## ADR-005: S3 + CloudFront via CDK instead of Amplify Hosting
Date: 2026-10-09 · Status: accepted
Context: everything else is in one CDK stack; Amplify would add a second deployment path.
Decision: the web build is deployed by CDK BucketDeployment to a private bucket behind the same distribution.
Consequences: one `npm run deploy` for the whole system.

## ADR-006: One DynamoDB table in provisioned mode, no indexes
Date: 2026-10-09 · Status: accepted
Context: the always-free DynamoDB allowance covers provisioned capacity only.
Decision: single table, PROVISIONED 10 RCU / 15 WCU, all access by partition key (`RUN#<id>`), TTL for cleanup,
optimistic locking on the run aggregate.
Consequences: a few judges can play at once; heavier bursts get `BUSY` and the client backs off.

## ADR-007: Amazon Nova Lite on Bedrock with cache and daily cap
Date: 2026-10-09 · Status: accepted
Context: Bedrock has no free tier; spend must stay tiny and bounded.
Decision: Nova 2 Lite via the global cross-Region profile from ap-south-1 (fallback: Nova Lite via the APAC
profile); results cached by photo SHA-256; daily cap; self-reported fallback.
Consequences: scripted photos are classified once ever; worst-case daily spend is bounded by the cap.

## ADR-008: Removed from the team plan
Date: 2026-10-09 · Status: accepted
Removed: Amazon Location Service, SageMaker, Isolation Forest, image-similarity deduplication,
Bedrock-written briefs, IoT hardware, BattLeDIM cross-check, native apps, offline report queue, separate
engineer/officer logins, before/after repair photos, a separate sandbox mode (the inject-leak tool covers it).
Reason: none is needed for the core loop; each adds a failure point for a one-person build.

## ADR-009: Changes to engine numbers relative to the ideation doc
Date: 2026-10-09 · Status: accepted
- Data-gap threshold raised from 10% to 20% missing meters: with ~15 meters per sector and 2% missing per
  reading, 10% would trigger on about 3.5% of slots and break detection.
- Trunk-main criticality applies only when the pin is within 20 m of the main (on it), not within 300 m.
- The scripted C3 incident now has 7 reports (5 photos + 2 low-water), so its score is 96 (the ideation doc's
  worked example used 4 reports and showed 94). A1 is a `major_leak` with 3 reports (31); D4 added (25).
- Crew shift starts at 07:00 so the score, not the clock, decides which incident is fixed first.
- Building-meter demand noise set to 8% (a bulk meter aggregates ~25 households), missing readings are
  imputed with a ratio-scaled median, and excess litres are divided by (1 − baseline loss). A reference
  simulation over 10 seeds showed: detection on the scripted slots every time, zero false alarms (worst
  history excursion 0.052 against the 0.08 threshold), all repairs verify, runtime scores C3 96–99, B2 38–40.

## ADR-010: Showcase run driven by EventBridge Scheduler
Date: 2026-10-09 · Status: accepted
Context: judges arrive at random times; the landing page must always show a living city.
Decision: a permanent `SHOWCASE` run advanced every 5 minutes by EventBridge Scheduler with autopilot on, and
reset when the scenario ends. Private runs are for hands-on play.
Consequences: about 8,640 scheduled invocations per month, inside the free allowances.
