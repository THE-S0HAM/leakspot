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

## 2026-10-09 · Kickoff (before CP0)
- Done: machine check (node v24.17.0, npm 11.17.0, git 2.49.0, AWS CLI 2.31.13, uv 0.10.7); profile
  hackthon-dev resolves to the expected IAM user in ap-south-1; 17 plan clarifications recorded as ADR-011.
- Done: the Kiro starter kit stays local and out of git; only submission-ready files are tracked.
- Backup: kit snapshot at `..\leakspot-kit-backup\cp-pre` (29 files, hashes match the originals).
- Surprises / problems: the one-line robocopy form with folder names after the destination fails
  ("Invalid Parameter"); backups use one robocopy call per folder.
- Next: CP0 once the six seed photos are added and the budget alert email is real.
