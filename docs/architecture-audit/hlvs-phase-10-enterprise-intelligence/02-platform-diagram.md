# 2 · Updated Platform Diagram

## Full platform (layered)

```mermaid
flowchart TB
  HLG["Herman Legacy Group"] --> HLBOS

  subgraph HLBOS["HL-BOS Enterprise Platform"]
    direction TB

    subgraph EXP["L4 · Experience"]
      PORTAL["Executive Portal (read-only, cloud, 5 roles)"]
      CC["Control Center (local-only)"]
    end

    subgraph EIL["L3 · Enterprise Intelligence Layer"]
      direction LR
      HLVS["HLVS Intelligence\nCatalog · Registry · Capability Library\nDiscovery · Build Queue"]
      BTI["HL-BTI Intelligence\nAssess · Gap · Proposal · ROI · Plan"]
      VIS["Visibility Intelligence\nSEO · Reputation · Competitive · Marketing"]
      TRN["Transportation Intelligence\nFleet · Dispatch · Freight · Fuel · Maint · Compliance"]
    end

    subgraph SPS["L2 · Shared Platform Services"]
      direction LR
      AUTH["Auth / Identity"]
      COMMS["Comms + Notifications"]
      WF["Workflow (human gate)"]
      BILL["Billing"]
      STOR["Storage"]
      ENT["Entitlements"]
      INT["Integrations"]
      AIGW["AI Gateway (advisory only)"]
      EVT["Event Bus"]
    end

    subgraph CORE["L1 · Core Platform"]
      TEN["Tenancy"]
      IDN["Identity"]
      AUD["Audit (immutable)"]
      BUS["Event backbone"]
    end

    EXP --> EIL
    EIL --> SPS
    SPS --> CORE
  end

  AIGW -. metered, guard-railed .-> PROV["Model providers (Anthropic)"]
```

## Data-plane mapping (schemas → subsystems)

```mermaid
flowchart LR
  subgraph HLVSsub["HLVS Intelligence"]
    C1["catalog* (proposed)"]
    C2["hlvs (Software Factory)"]
    C3["discovery (research + rules)"]
  end
  subgraph BTIsub["HL-BTI Intelligence"]
    B1["bti (assessments, scores, ROI)"]
  end
  subgraph VISsub["Visibility Intelligence"]
    V1["visibility"]
  end
  subgraph TRNsub["Transportation Intelligence"]
    T1["transportation* (proposed, greenfield)"]
  end
  subgraph Shared["Shared / Core"]
    S1["identity · platform · audit · events"]
    S2["comms · workflows · billing · storage · entitlements · integrations · ai"]
  end
  HLVSsub --> Shared
  BTIsub --> Shared
  VISsub --> Shared
  TRNsub --> Shared
```

`* proposed` = designed in this blueprint, not implemented. Everything else exists today (17 live schemas, 27 migrations, 100% RLS).

## Engine-plane mapping (packages → subsystems)

| Package (today)                        | Serves              | Role                                                                   |
| -------------------------------------- | ------------------- | ---------------------------------------------------------------------- |
| `@hl-bos/catalog`                      | HLVS                | Enterprise Catalog + Application Registry + Software Factory assembler |
| `@hl-bos/transformation-intelligence`  | HL-BTI + Government | Pipeline, impact/ROI, factory reuse, approval gating                   |
| `@hl-bos/bti-engine`                   | HL-BTI + Visibility | Scoring, consulting findings, growth/SEO dimensions                    |
| `@hl-bos/config`                       | all                 | The only sanctioned env reader                                         |
| _(proposed)_ `@hl-bos/discovery-intel` | HLVS                | External-research collectors + opportunity scoring                     |
| _(proposed)_ `@hl-bos/transport-intel` | Transportation      | Fleet/dispatch/fuel deterministic engines                              |

## The single control loop

```mermaid
flowchart LR
  EV["Evidence / signals"] --> ENG["Deterministic engine"]
  ENG --> AI["Advisory AI (gateway)"]
  AI --> ENG
  ENG --> GATE{"Human approval\n(workflows)"}
  GATE -- approved --> ACT["Governed action\n(build / provision / deploy)"]
  GATE -- held --> PORTAL["Executive Portal\n(read-only)"]
  ENG --> PORTAL
  ACT --> AUD["Audit (immutable)"]
```

Every subsystem plugs into this one loop. There is no second control plane, no second UI, and no second approval mechanism — which is precisely how "one platform, no duplication" is enforced structurally rather than by policy.
