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
