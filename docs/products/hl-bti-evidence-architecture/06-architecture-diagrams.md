# Deliverable 6 — Architecture Diagrams

Rendered with Mermaid. Existing components are marked **(exists)**; the three new bridges and the asset layer are marked **(new)**.

## 1. Current vs. corrected

```mermaid
flowchart LR
  subgraph Current["CURRENT — manual"]
    C1[Consultant] -->|enters 43 ratings| C2[bti.dimension_ratings]
    C2 --> C3[Scoring]
    C3 --> C4[Consulting engine\n not surfaced in app]
  end
  subgraph Corrected["CORRECTED — evidence-driven"]
    E1[Collectors] --> E2[discovery.evidence]
    E2 --> E3[Evidence→Dimension Map new]
    E3 --> E4[Rating-Proposal Engine new]
    E4 --> E5[Consultant validates/approves]
    E5 --> E6[bti.dimension_ratings\n evidence-linked]
    E6 --> E7[Scoring exists]
    E7 --> E8[Consulting Framework\n surfaced in Alpha]
  end
```

## 2. Evidence layer (reuses discovery.*)

```mermaid
flowchart TD
  subgraph Collectors["Collectors (discovery.collectors — registry exists)"]
    W[Website scanner ✔ CP5]
    I[Business interview ✔]
    V[VisibilityAI / SEO ○]
    D[Document analysis ○]
    A[App/Tech collectors ◆ future]
  end
  W & I & V & D & A -->|record_evidence| EV[(discovery.evidence\n single source of truth — exists)]
  EV --> MAP[Evidence→Dimension Map\n new catalog]
  MAP --> PROP[Rating-Proposal Engine\n new, deterministic]
  PROP --> RAT[Proposed ratings\n + confidence + facts + gaps]
```

## 3. Asset-based assessment

```mermaid
flowchart TD
  B[Business\n bti.businesses exists] --> AS[Assets\n bti.assets new]
  AS --> AA[Asset Assessment\n bti.asset_assessments new]
  AA --> EVi[Evidence per asset\n discovery.evidence exists]
  AA --> DR[Dimension ratings\n asset-scoped]
  DR --> AGG[Aggregate\n computeScorecard exists]
  AGG --> BP[Executive Blueprint\n per business]
```

## 4. End-to-end engagement (Step 7)

```mermaid
flowchart TD
  S1[Business enters HL-BTI] --> S2[Evidence Collection\n collectors + events dispatcher exists]
  S2 --> S3[(Evidence Repository\n discovery.evidence exists)]
  S3 --> S4[Rating Proposals\n map + engine new]
  S4 --> S5[Consultant Validation\n Alpha UI + workflows gate exists]
  S5 --> S6[Consulting Intelligence\n bti-engine/consulting exists]
  S6 --> S7[Executive Blueprint\n + branded export]
  S7 --> S8[Proposal\n sales exists]
  S8 --> S9[Implementation Plan\n bti.projects exists]
  S9 --> S10[Transformation Tracking\n bti stage machine exists]
  S10 --> S11[ROI Measurement\n bti.roi_metrics exists]
```

## 5. Consultant workflow (Step 4)

```mermaid
flowchart LR
  A[Evidence collected] --> B[HL-BTI proposes findings]
  B --> C[Consultant validates]
  C --> D[Consultant adjusts\n override = auditable]
  D --> E[Consultant approves\n workflows gate]
  E --> F[Consulting Framework executes]
```

## 6. Runtime integration

```mermaid
flowchart TD
  UI[HL-BTI Alpha\n wired to live backend] -->|bti.* RPCs| DB[(bti + discovery\n Supabase — apply 0026 first)]
  UI -->|invoke| EF[Edge function\n runs generateConsultingReport]
  EF --> ENG[@hl-bos/bti-engine\n scoring + consulting + rating-proposal]
  DB --> EF
  AIemitsAI[ai gateway + injection fence] --> EF
```
