# LeakSpot: project brief for Claude Code

LeakSpot is a solo hackathon entry (track: Heat and Water → Leaks). One line: **"Find the water the city can't see."**
Building water meters detect water-balance anomalies per sector. Citizens confirm with photos (classified by Amazon
Bedrock) or "low / no water" reports. Incidents merge and are ranked by a fixed, explainable score; one crew is
dispatched; the repair is **verified** only when the sector's loss returns to baseline. The demo runs in the
simulated block city **Jaldhara** (16 sectors A1–D4, one day: Day 15, 06:00–20:00).

Judging: idea and impact · built on AWS · design and usability · execution ("one feature that runs beats five
that almost do") · a 3-minute demo video. Live site: https://d16l2tljxlr7ci.cloudfront.net

The project was built with Kiro (steering in `.kiro/steering/`, plan in `docs/`). Claude Code now takes over.

## Read these first
@docs/FINAL_PLAN.md
@.kiro/steering/00-deadline-mode.md

Before touching an area, read its steering file (Kiro loads these automatically, you must open them yourself):
| Touching | Read |
|---|---|
| packages/core (engine, scoring, sim) | `.kiro/steering/domain-engine.md`, `.kiro/steering/scenario-jaldhara.md` |
| services/api, packages/contracts, web api/state | `.kiro/steering/api-contract.md`, `.kiro/steering/security-and-access.md` |
| infra, deploy scripts | `.kiro/steering/aws-infra.md`, `.kiro/steering/free-tier-guardrails.md` |
| apps/web UI | `.kiro/steering/design-system.md` |
| apps/web/src/world (3D city), landing | `.kiro/steering/world-3d.md` (FINAL_PLAN "Stage 1-3D" overrides it where they differ) |
| tests | `.kiro/steering/testing.md` |
History and reasons: `docs/DEVLOG.md`, `docs/DECISIONS.md` (ADRs).

## Repo
npm workspaces: `@leakspot/web` (apps/web, Vite + React 19), `@leakspot/api` (services/api, one Lambda),
`@leakspot/core` (packages/core: world, sim, engine, run), `@leakspot/contracts` (zod), `@leakspot/infra` (CDK).
TypeScript 6.0.3 strict with noUncheckedIndexedAccess (TS 7 is incompatible with typescript-eslint, keep 6).

Hard rules:
- **Web import boundary**: apps/web imports only `@leakspot/core/world` and `@leakspot/core/counterfactual`.
  Never sim/scenario/run (a bundle test checks no scripted leak ids reach the bundle).
- **Engine invariants** (tests enforce): score vectors C3 96, B2 39, A1 31, D4 25, sewage floor 80; scenario:
  B2 suspected 06:15, C3 confirmed 06:45, C3 verified 08:15 when handled on time, A1/D4 close as "repair logged";
  day ends after 19:45 (tick → 409 "The day is over").
- **Stateless Lambda**: all runtime facts live in RunState (one DynamoDB item per run, version-checked).
  RunState test budget 24 KB (soft). RunContext is pure seed-derived data.
- **Honesty**: the detector never sees where the simulator put leaks; hidden leak positions are never exposed by
  the API; "Simulated city" label stays visible; decoration (traffic, people) is seeded and not data.
- Command Centre auth: header `x-leakspot-code`, SHA-256 compared server side. Never print or commit the real
  access code. **Never read `.env.deploy`.**

## Commands (PowerShell on Windows)
| Do | Command |
|---|---|
| Dev (web :5173 + API :8787, in-memory) | `$env:COMMAND_CODE_SHA256="9ac2197d9258257b1ae8463e4214e4cd0a578bc1517f2415928b91be4283fc48"; npm run dev` then code `ABCDEFGH` (local test code only) |
| Checks | `npm run typecheck` · `npm run lint` · `npm test` · `npm run build` |
| E2E | see apps/web package.json (Playwright, Chromium installed; health-bar spec) |
| Live smoke | `npx tsx scripts/smoke.ts https://d16l2tljxlr7ci.cloudfront.net` (add `--photo <jpg>` for Bedrock) |
| Deploy (the USER runs this) | `node scripts/build.mjs; cd infra; $env:LEAKSPOT_DEPLOY="1"; npx cdk deploy LeakSpot --profile Dev-AWSTW --require-approval broadening --outputs-file cdk-outputs.json; Remove-Item Env:LEAKSPOT_DEPLOY; cd ..` |
AWS: account 838814606498, region ap-south-1, profile `Dev-AWSTW`. Never run deploy, destroy or any AWS command
that changes resources yourself; prepare it and ask. `npm run deploy` is broken on Windows (path with spaces); use
the manual command.

Gotchas already solved (don't re-debug): `scripts/dev.mjs` spawns vite/tsx directly with stdin ignored (Playwright
on Windows); stale processes on :5173/:8787 cause 401s or EADDRINUSE, kill them first; CommandCentre component tests
mock `world/CityCanvas` (jsdom has no WebGL) and use MemoryRouter + "Start my run"; full parallel test runs can be
slow, so don't weaken assertions to make them pass.

## Architecture (deadline mode, all in one CDK stack)
CloudFront → S3 (web, OAC, SPA rewrite function) and `/api/*` → Lambda Function URL (nodejs22.x arm64, 1024 MB) →
DynamoDB (on-demand, one table, `RUN#id`), S3 photo bucket (private, 30-day lifecycle, presigned 5-min reads,
command only), Amazon Bedrock Nova 2 Lite (`global.amazon.nova-2-lite-v1:0`, Converse API, synchronous; failure →
report marked "self-reported" and still counts). Citizen reports: 20 per 10 min per IP; command endpoints unlimited.

## Design system (apps/web)
- Command Centre and landing: **Monsoon Night** (night #0E1828, cloud #172539, ink #E7EEF7, jal #35D3F0,
  neem #49D49A, haldi #F4B43A, sindoor #FF7183). Citizen app: **Neel Limewash** (lime #EDF2F5, ink #13233F,
  tank #0B5FB0). Tokens in `apps/web/src/styles/tokens.css`.
- Type: Pixelify Sans ONLY for the logo and headings without digits. Every id, number, score, clock and litre value
  uses JetBrains Mono with tabular-nums (Pixelify made "C3" read as "03"). Labels ≥ 13 px, panels ≥ 14 px.
- Block buttons with a hard side face; no spinners anywhere (PipelineLog, SegmentBar, TankGauge only); sentence
  case; human words (never `#3`, `S15-5-10`, `major_leak`, `undefined`); citizen screens in en/hi/mr with key parity.
- Original art only: pixel-block / low-poly Indian city. No look-alikes of any existing game, brand or character.

## Where we are (handover from Kiro, 2026-10-11 ~01:20 IST)
Done and deployed: the full loop (meters → citizen photo + Bedrock → incident → dispatch → repair → verified),
Command Centre HUD (Next-move bar, mission briefing, quest cards with score bars, toasts, Day report, run resume via
`?run=`, live polling, report pins + photo panel), citizen app `/report` + ticket `/t/:run/:rid` with Result card
(en/hi/mr), landing, 404 + error boundaries, Stage 0 of FINAL_PLAN.

In progress: **FINAL_PLAN "Stage 1-3D"** (react-three-fiber city replacing the flat SVG map).
- PART 0 (readable numbers) is committed.
- PART 1a was written by Kiro but **not committed** when Kiro was cut off: `apps/web/src/world/City3D.tsx`,
  `City3D.module.css`, `CityCanvas.tsx` (lazy City3D, WebGL check, `?view=2d` and error fallback to the SVG
  `CityView`), `sky.ts`, `palette.ts`, `city3d-geometry.ts`, a TankGauge loader, three@0.186.1 /
  @react-three/fiber@9.8.1 / @react-three/drei@10.7.9 / @types/three@0.186.0 pinned. Tests were green (192); the
  e2e had not been re-run.
- User verdict on the old map: "weird boxes and small squares, pipes don't reach the blocks, looks like a broken
  simulation, numbers unreadable. Wants different home types, gardens, trees, roads, traffic lights, citizens, crew
  vehicle, normal vehicles, every small detail." That is the bar for Stage 1-3D.

## How to work here
- **Check your own visuals.** You can read PNGs. After any visual change, capture Playwright screenshots of
  /command (after Start my run, at 05:45, 06:45 and with X-ray on), / and /report at 1440×900 and 390×844 into
  `apps/web/e2e/screenshots/` (gitignored), look at them, and iterate before reporting. Judge against the art
  direction in FINAL_PLAN Stage 1-3D, not against "it renders".
- Commit after each part with conventional commits (`feat(web): …`, `fix(core): …`). Keep typecheck, lint, tests
  and build green. Never `git clean`, `git reset --hard` or rewrite history; never force-push.
- Stop and tell the user before a deploy, then list exactly what to check on the live site.
- Time: deadline ≈ 04:35 IST. Build freeze 03:20, then video + README. Hard time boxes: when one runs out, drop the
  remaining items of that part completely (no half-built UI) and note it in docs/DEVLOG.md.
- Performance: ≤ 200 draw calls, instance everything repeated, no per-frame allocations, pause when the tab is
  hidden, shadows off on phones, prefers-reduced-motion respected.
