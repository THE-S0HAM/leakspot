# Architecture

Kiro keeps this file current from CP1 onward. Starting point:

```mermaid
flowchart LR
  subgraph Users
    C[Citizen phone<br/>public]
    J[Judge / engineer<br/>access code]
  end
  subgraph AWS["AWS ap-south-1 (CDK stack LeakSpot)"]
    CF[CloudFront<br/>+ SPA rewrite function]
    WB[(S3 WebBucket<br/>React app)]
    API[Lambda ApiFn<br/>Function URL, IAM auth]
    WK[Lambda WorkerFn<br/>report pipeline, showcase tick]
    DB[(DynamoDB LeakSpot<br/>provisioned, single table)]
    DATA[(S3 DataBucket<br/>photos, seed photos)]
    BR[Amazon Bedrock<br/>Nova Lite vision]
    SCH[EventBridge Scheduler<br/>every 5 min]
    CW[CloudWatch logs,<br/>dashboard, 3 alarms]
    SNS[SNS email]
  end
  C --> CF
  J --> CF
  CF -- "/*" OAC --> WB
  CF -- "/api/*" OAC --> API
  API --> DB
  API --> DATA
  API -- async invoke --> WK
  WK --> DB
  WK --> DATA
  WK --> BR
  SCH --> WK
  API -.-> CW
  WK -.-> CW
  CW -- alarm --> SNS
```

## Module map
| Layer | Package | Knows about | Never imports |
|---|---|---|---|
| Domain: simulator | packages/core/src/sim | ground truth (leaks, NPCs) | — |
| Domain: engine | packages/core/src/engine | readings, reports, actions | sim/ |
| Domain: run | packages/core/src/run | sim + engine, composes them | anything outside core |
| Contracts | packages/contracts | zod schemas | core, AWS |
| Use cases | services/api/src/app | ports, core, contracts | adapters, AWS SDK |
| Adapters | services/api/src/adapters | AWS SDK, memory, fakes | — |
| Web | apps/web | contracts, core (world data, counterfactual) | AWS SDK |

## Request flows
1. **Tick** (command or scheduler): read run META → `sim.generateSlot` → `engine.applySlot` → autopilot
   actions → conditional write META + TICK item → return state.
2. **Citizen report**: validate → store photo in S3 → put REPORT (stage `received`) → async invoke worker →
   202. Worker: `stored` → `located` → `classifying` (cache → quota → Bedrock) → `classified` → `matching`
   (engine merge/fusion on META with optimistic lock) → `scored` → `done`.
3. **Dispatch / repair**: command action → pure reducer → conditional write → new state.
