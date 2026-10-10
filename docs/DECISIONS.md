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

## ADR-011: Kickoff clarifications
Date: 2026-10-09 · Status: accepted
Context: a review of the plan before CP0 found gaps and small contradictions. Each is settled here.
Guiding principle: every feature maps to a judging criterion and fits one sentence of the demo video;
when two designs both work, choose the simpler one.
Decision:
1. Tooling hooks: path matchers accept both `/` and `\`; each hook is triggered once in CP0 and the result
   logged in DEVLOG.
2. No placeholder scripts: each root npm script arrives in the checkpoint that makes it work (CP0 build, test,
   lint, typecheck, verify:fast, verify; CP2 dev; CP3 deploy, smoke; CP5 e2e; CP8 e2e:live). CP0 gives every
   workspace a small real module with real tests (core units, contract ids, API config, web shell, empty
   infra stack). Unused code is caught by TS `noUnusedLocals`/`noUnusedParameters` and ESLint, no extra tool.
3. Secret scan flags AWS keys, private keys, the real access code, and literals assigned to `accessCode`,
   `commandCode` or `LEAKSPOT_COMMAND_CODE` only; ordinary error codes such as `"CONFLICT"` are fine.
4. Access code: 8 characters from `ABCDEFGHJKMNPQRSTVWXYZ23456789` (no I, L, O, U); trimmed and uppercased
   before hashing, so it is case-insensitive; the code input shows uppercase.
5. Report fusion order: a leak photo first attaches to the sector's open hidden incident without a photo
   (moving the pin to the photo), and only then merges by distance. The scenario's C3 pin is (13, 85);
   the example why-line says "hospital 90 m away".
6. Calendar: day 1 is a Monday (days 7 and 14 are Sundays, day 15 is a Monday). Exactly 15 building meters
   per sector; a data gap is 4 or more missing readings. Runs start and reset in a dry "before slot 0" state
   labelled 05:45.
7. Controls: Play ticks from the browser every 2 s while the tab is visible, Pause stops, Step ticks once;
   Autopilot only automates crew dispatch and repair inside each tick; the Showcase is ticked by the
   scheduler with autopilot on.
8. Reports without a run link go to the public Showcase. The run META carries a `cycle` number, incremented
   on reset and stored on each report; tickets from an earlier cycle show "Archived". Showcase reports
   expire after 2 days.
9. Offline: no queue. The form keeps the photo and choices, shows an offline banner, and Send works again
   after reconnecting.
10. Unaccounted water is drawn in the 3D world only after the engine detects it, never before.
11. No FakeVision switch in production; the abuse test uses low-water reports plus one cached seed photo.
12. Capacity: the Showcase is polled every 15 s and a private run every 2 s only while paused (a tick
    response is the state while playing). `/api/*` uses one cache policy that honours origin
    `Cache-Control` (default TTL 0, max 60, query strings in the key, no headers or cookies); the API sends
    `public, max-age=10` only on public Showcase GETs and `no-store` elsewhere. META stays near 3 KB:
    baselines are recomputed from the seed and only open incidents are stored there.
13. The web app imports core only through `@leakspot/core/world` (layout, no leaks) and
    `@leakspot/core/counterfactual`; a test fails if the built bundle contains a scripted leak id or position.
14. Copy: "Crew starts at 07:00"; "Repair logged, below meter resolution".
15. Inject leak takes only (x, z); the sector is derived server-side; a point outside every sector is a
    validation error, "Pick a point inside a sector".
16. Status badges: sector (Normal, Watch, Suspected, Confirmed, Data gap, Verifying, Verified), incident
    (Open, Crew dispatched, Crew on site, Verifying, Verified, Reopened, Repair logged), report (Rejected,
    Archived).
17. Each sector inlet meter sits at the midpoint of the sector edge closest to the central avenue (x = 50);
    pipe routes along streets are visual only.
Consequences: the engine, API and UI checkpoints start from one unambiguous rule set. Showcase reads are
mostly served from the CloudFront cache, so DynamoDB read capacity is no longer tied to the number of open
landing pages.

## ADR-012: Corrected the Crockford base32 character class in the id schemas
Date: 2026-10-09 · Status: accepted
Context: design.md and tasks.md (CP0) specified the Crockford char class as `[0-9A-HJ-NP-TV-Z]`. The range
`J-N` includes `L`, so that class wrongly accepts `L`, which Crockford base32 excludes (no I, L, O, U)
and which Requirement 8.2 requires `RunId`/`ReportId` to reject.
Decision: use `[0-9A-HJKMNP-TV-Z]` in `packages/contracts/src/ids.ts` (defined once as a shared
`CROCKFORD_CHAR` constant and reused for both `RunId` and `ReportId`). This matches exactly
`0123456789ABCDEFGHJKMNPQRSTVWXYZ`. The CP0 spec docs (design.md, tasks.md) were corrected to the same
class; the access-code alphabet in ADR-011 (4) was already correct and is unchanged.
Consequences: id validation rejects I, L, O, U as intended. The CP1 ULID/run-id generator must emit only
this alphabet so generated ids pass `ReportId`/`RunId`.

## ADR-013: TypeScript 6.0.3 instead of TypeScript 7
Date: 2026-10-09 · Status: accepted
Context: CP0 first installed `typescript` 7.0.2 (the npm `latest`). `typescript-eslint` 8.71.1, its parser and
`typescript-estree` declare the peer `typescript >=4.8.4 <6.1.0`; TS 7 offers no compiler API that
typescript-eslint can use until TS 7.1, so linting could only work by forcing the peer with npm overrides.
Decision: pin `typescript` to exactly 6.0.3, the latest 6.0.x. No npm overrides, `--force` or
`--legacy-peer-deps`. Never TypeScript 7 in this project: typescript-eslint supports <6.1.0 only.
Consequences: lint and typecheck share one compiler version with no peer warnings. Do not upgrade
TypeScript mid-project. This supersedes the "latest stable major at CP0" rule for TypeScript only.

## ADR-014: CP0 test tooling and supporting packages
Date: 2026-10-09 · Status: accepted
Context: tech.md names the main libraries per workspace; CP0 also needs a few packages it does not name.
Decision: install these at exact versions, each for one reason:
- `@vitest/coverage-v8` 5.0.3 (root, dev): coverage provider for the gates in `npm run verify`.
- `jsdom` 30.1.2 (apps/web, dev): DOM environment for the web component tests.
- `@types/node` 22.20.5 (root, dev): Node typings for scripts, the API and infra (runtime floor Node 22).
- `@types/react` 19.3.0 and `@types/react-dom` 19.3.0 (apps/web, dev): typings for the strict React shell.
- `zod` 4.6.5 as a direct dependency of `services/api`: `config.ts` validates the environment itself, so it
  declares zod instead of relying on the copy installed for `packages/contracts`.
`esbuild` and the `aws-cdk` CLI are pinned but not installed until CP3.
Consequences: every installed package is used in CP0; nothing is pulled in transitively by accident.

## ADR-015: Deadline mode
Date: 2026-10-10 · Status: accepted
Context: under 10 hours to submission; the checkpoint/spec workflow and several free-tier hardening
features cannot all land in time. The core loop and demo must take priority.
Decision: adopt deadline mode, defined in `.kiro/steering/00-deadline-mode.md`, which overrides every
other steering file where they conflict. It drops the spec workflow, coverage thresholds, and the
scan/stub scripts; cuts three.js (isometric SVG city instead), the showcase run and scheduler, replay,
sound, sessions, rate limits, caps, the vision cache, the worker Lambda, OAC-to-Lambda, Playwright; and
simplifies the architecture to one Lambda behind a Function URL (AuthType NONE) served through CloudFront
at `/api/*`, one DynamoDB table (25/25), synchronous Bedrock, and an `x-leakspot-code` header checked by
SHA-256. It keeps the validated engine numbers and score vectors, the access code, EN/हिंदी/मराठी, the
real-step pipeline log, the with-vs-without panel, and the design-system tokens and fonts.
Consequences: supersedes ADR-001 (OAC + session + x-amz-content-sha256), ADR-003 (worker Lambda), and
ADR-010 (scheduler-driven showcase) for the remainder of this build; relaxes the DynamoDB capacity of
ADR-006 to 25/25. CP0 is marked PARTIAL and the checkpoint gates no longer apply. See the steering file
for the authoritative list.

## ADR-016: Move to account 838814606498 (profile Dev-AWSTW); DynamoDB on-demand
Date: 2026-10-10 · Status: accepted
Context: the original account 753036487793 hit a new-account daily Bedrock token quota (ADR-015 debugging
confirmed ThrottlingException "Too many tokens per day" on both Nova profiles); it resets after the
deadline. A second account, 838814606498 (profile Dev-AWSTW, region ap-south-1), is bootstrapped and has
a working Bedrock test.
Decision: move the whole project to 838814606498. `infra/bin/leakspot.ts` pins the new account; every
script reads the profile from one place (`scripts/aws-env.mjs`: env `LEAKSPOT_AWS_PROFILE`, default
`Dev-AWSTW`). Bedrock IAM ARNs are built from `Stack.of(this).account`, never a literal. The DynamoDB
table switches from PROVISIONED 25/25 to PAY_PER_REQUEST (on-demand), because this account may already
use its free provisioned-capacity allowance elsewhere and our request volume is tiny; still one table,
no GSI/stream/PITR. Supersedes the account/profile in ADR-001/002/011 and the provisioned mode in ADR-006.
Consequences: deploys and probes target the new account via Dev-AWSTW. On-demand DynamoDB is billed per
request (fractions of a cent at our volume) rather than from the always-free provisioned tier.
