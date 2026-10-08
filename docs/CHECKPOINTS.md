# Checkpoints

Statuses: `NOT STARTED` · `IN PROGRESS` · `DONE`. When I paste a checkpoint prompt, mark it `IN PROGRESS`.
Only one checkpoint is ever `IN PROGRESS`. Fill "Evidence" with the exact commands run and their results.

| CP | Name | Goal | Gate (summary; full text in MASTER_PROMPT.md) | Status | Date | Tag | Evidence |
|---|---|---|---|---|---|---|---|
| 0 | Foundation | Monorepo, guardrails, scripts, hooks on, Bedrock probe | verify green; secrets + stub scans pass; all 6 photos classify as expected; .env.deploy ignored | NOT STARTED | | cp-00 | |
| 1 | Core engine | Pure simulator + engine + run reducers | score vectors exact; scenario outcome test; determinism; no engine→sim import; coverage ≥ 90% | NOT STARTED | | cp-01 | |
| 2 | API (local) | Contracts, ports/adapters, router, local server | every route tested; local end-to-end loop; coverage ≥ 85% | NOT STARTED | | cp-02 | |
| 3 | AWS infra | CDK stack, AWS adapters, first deploy | guardrail test; deploy; smoke against live URL | NOT STARTED | | cp-03 | |
| 4 | Design system | Tokens, fonts, icons, components, i18n, client | contrast test; axe clean on /__kit; screenshots reviewed | NOT STARTED | | cp-04 | |
| 5 | Citizen app | Full citizen journey | e2e both report types; 360 px + desktop; 3 languages complete; phone checklist | NOT STARTED | | cp-05 | |
| 6 | Command Centre | Full command loop on the 2D map | e2e: code → run → autopilot → verify → replay → counterfactual → inject | NOT STARTED | | cp-06 | |
| 7 | 3D world | Voxel Jaldhara wired to the store | perf budget; no colour drift; no console errors | NOT STARTED | | cp-07 | |
| 8 | Showcase + polish | Scheduler loop, sound, states, headers | showcase ticks for 1 h; live e2e green | NOT STARTED | | cp-08 | |
| 9 | Hardening | Security review, abuse test, cost audit | findings closed; costs inside free tier + credits | NOT STARTED | | cp-09 | |
| 10 | Submission | README, demo script, runbook, final deploy | a stranger completes the loop from README | NOT STARTED | | v1.0.0 | |

## Phone checklist (CP5, run on a real phone against the live URL)
- [ ] Landing loads on mobile data in under 5 s; "Simulated city" label visible
- [ ] Language switch to मराठी and हिंदी; no English left on citizen screens
- [ ] Camera opens from "I see a leak"; photo upload shows real progress
- [ ] Pipeline log reaches "done" or "rejected"; ticket page updates on its own
- [ ] "Low / no water" works without a photo
- [ ] QR from Command Centre opens the right run with the sector pre-selected
- [ ] Airplane mode shows the offline message, and sending works after reconnecting
