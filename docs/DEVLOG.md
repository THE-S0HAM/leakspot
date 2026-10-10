# Dev log

Newest entries at the top. One entry per working session plus one line per completed task (the
checkpoint-log hook adds those). Record numbers, not adjectives: coverage, FPS, cold-start ms, bundle KB.

Entry format:
```
## YYYY-MM-DD · CP-NN
- Done: …
- Measured: …
- Surprises / problems: …
- Next: …
```

Handover note format (when a session gets long):
```
## Handover YYYY-MM-DD HH:MM
Checkpoint: CP-NN · Tasks done: … · In progress: … · Open problems: … · Next step: …
```

## Handover 2026-10-10 01:21
Checkpoint: CP-00 · Tasks done: 1 (CP0 in progress); 2 (covered by the kickoff backup `..\leakspot-kit-backup\cp-pre`);
3 (monorepo scaffold); 4.1-4.2 (core units + tests); 5.1-5.2 (contracts ids, photo limits + tests); 6.1-6.2 (api
config + tests); 7.1-7.2 (web shell, build script + test); 8.1-8.2 (empty infra stack + test); 12.1 (vision port).
15 commits, f1d3b4f to ca889ee. · In progress: 9.1 (ESLint, Prettier, lint and test scripts). The first attempt
stopped when the task tools dropped out; its uncommitted package.json/lockfile edits were restored and its six new
files deleted, then `npm ci`, typecheck and build passed. · Open problems: TypeScript moves from 7.0.2 to 6.0.3
(ADR-013) because typescript-eslint supports <6.1.0 only; ADR-014 lists the CP0 supporting packages; the build and
typecheck scripts spawn tools with `shell: true` plus arguments, which Node 24 flags as DEP0190 (fix in the hygiene
task by running each tool's JS entry with `process.execPath`); the checkpoint-log hook has added no task lines yet
(check in Task 19). · Next step: Task 9.1 with typescript 6.0.3, then Task 10.1.

## 2026-10-09 · Kickoff (before CP0)
- Done: machine check (node v24.17.0, npm 11.17.0, git 2.49.0, AWS CLI 2.31.13, uv 0.10.7); profile
  hackthon-dev resolves to the expected IAM user in ap-south-1; 17 plan clarifications recorded as ADR-011.
- Done: the Kiro starter kit stays local and out of git; only submission-ready files are tracked.
- Backup: kit snapshot at `..\leakspot-kit-backup\cp-pre` (29 files, hashes match the originals).
- Surprises / problems: the one-line robocopy form with folder names after the destination fails
  ("Invalid Parameter"); backups use one robocopy call per folder.
- Next: CP0 once the six seed photos are added and the budget alert email is real.

## 2026-10-10 — Deadline mode
- Entered deadline mode (<10 h to submission): dropped vitest coverage block, marked CP0 PARTIAL (tag cp-00-partial), added `.kiro/steering/00-deadline-mode.md` and ADR-015; now work from block prompts, not specs.
- Block 1 (AWS skeleton): one CDK stack (DynamoDB 25/25, 2 private buckets, API Lambda nodejs22 arm64 + public Function URL AuthType NONE, CloudFront with SPA-rewrite function + /api/* behaviour, WebDeploy BucketDeployment); API router/handler + local :8787 server; dev/deploy scripts; installed aws-cdk 2.1145.0, esbuild 0.28.2 (infra), tsx 4.23.15 (root). Docs MCP confirmed a public Function URL now needs both lambda:InvokeFunctionUrl and lambda:InvokeFunction (Oct-2025), both added. Command-code hash computed at synth from .env.deploy; deploy sets LEAKSPOT_DEPLOY=1 so the placeholder hash can never deploy.
- Block 2 (core engine): pure TS packages/core — world/jaldhara (layout, no leaks, exported as @leakspot/core/world), sim/ (mulberry32 RNG, demand, readings with 2% missing, 4 scripted leaks + 12 NPC reports), engine/ (balance+ratio imputation, baseline/anomaly, incidents with rule 2a→2b, score, vision, counterfactual; never imports sim/), run/ (RunState + createRun/tick/addReport/dispatch/repair/setAutopilot). Score vectors 96/39/31/25/80 exact; scenario (seed 42, autopilot) reproduces the full expected outcome — B2 suspected 06:15, C3 CONFIRMED 06:45 P96, 4 incidents + D1 rejected, C3 verified 08:15, B2 verified 18:00, A1/D4 closed_logged, zero history alarms, deterministic, RunState JSON 7.4 KB. Two fixes found via probe: repairLeakAt matches by pin-proximity first (C3 leak is visible, not hidden), and verifying sectors are shielded from re-triggering rule 1 (no spurious 5th incident). 141 tests green.
- Block 3 (API): contracts zod schemas (api.ts); simplified config.ts to the deadline-mode env (TABLE_NAME, PHOTO_BUCKET, BEDROCK_MODEL_ID, COMMAND_CODE_SHA256); ports RunStore/PhotoStore with dynamo/s3/memory/fake adapters; async router with read→reduce→conditional-put→retry(3)→BUSY, x-leakspot-code constant-time auth, JPEG magic-byte + 400 KB check, 5-char run ids + ULID report ids. Two-step report flow (create stores photo + pending report in RunState; classify reads S3 + Bedrock + addReport) stays stateless by keeping pendingReports in RunState. scripts/smoke.ts loops tick with autopilot until C3 VERIFIED. 140 tests green; smoke verified end-to-end against the local in-memory server (C3 verified 08:15, water recovered 179,310 L/day). Installed @aws-sdk/client-dynamodb, lib-dynamodb, client-s3, s3-request-presigner (3.1148.0).
- Block 3 add-ons: module-level getContext(seed) cache so a warm Lambda rebuilds the 14-day history once (one rebuild ≈ 150 ms locally; cached lookup ≈ 0.004 ms); ApiFn memory 512→1024 MB (more vCPU, still inside the free 400,000 GB-s). smoke --photo <path.jpg> sends a real leak_photo to C3, classifies via the live Lambda, prints label/confidence/selfReported and fails loudly if it fell back to self-reported (Bedrock not working). Verified locally with FakeVision (label=burst, confidence 0.95, not a fallback). Note: use `npx tsx scripts/smoke.ts <url> --photo <path>` — npm swallows args after `--` on Windows. 140 tests green.
- Bedrock failure diagnosis: smoke --photo returned label=self_reported. Root cause via `aws bedrock-runtime converse` (both global.amazon.nova-2-lite-v1:0 and apac.amazon.nova-lite-v1:0) and scripts/probe-bedrock.ts on images/water-wastage-image-1.jpeg: ThrottlingException "Too many tokens per day" on BOTH profiles — the account's daily Bedrock on-demand token quota is exhausted. NOT access-denied (call reached the model) and NOT a parsing failure (no reply). Verified the deployed Lambda role already allows bedrock:InvokeModel on both inference-profile ARNs + the regional/region-less foundation-model ARNs — IAM is correct. Hardening done anyway: adapter now console.errors the failure category+name+message (never photo bytes); classify response carries fallbackReason; parser replaced with extractFirstJsonObject (first balanced {...}, string-aware) so code fences, prose and reasoning blocks are tolerated — 11 new unit tests cover those shapes. Added scripts/probe-bedrock.ts (uses the shared adapter via probeConverse, no SDK import in scripts) and images/ to .gitignore. 151 tests green. BLOCKED on the daily token quota: it resets at UTC midnight, or raise it in the Bedrock Service Quotas console.
- Account move (ADR-016): project moved from 753036487793 (daily Bedrock token quota, resets after deadline) to 838814606498, profile Dev-AWSTW, region ap-south-1 (already bootstrapped). infra/bin pins the new account; scripts/aws-env.mjs is the single profile source (env LEAKSPOT_AWS_PROFILE, default Dev-AWSTW) used by deploy/smoke/probe; Bedrock IAM ARNs come from Stack.of(this).account (no literal); DynamoDB switched PROVISIONED 25/25 → PAY_PER_REQUEST; infra test updated; steering + mcp pricing-profile updated (.kiro/settings/mcp.json is sandbox-protected and left as-is, pricing-only). probe-bedrock on images/water-wastage-image-1.jpeg returned label=minor_drip confidence=0.9 (inside a ```json fence, parsed cleanly) — Bedrock confirmed working on the new account. 151 tests green. Cleared stale infra/cdk.out from the old account.