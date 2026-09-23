# XOCP System Architecture Specification

## 1. Executive Summary & Architectural Vision
XOCP (**eXtensible Open Code Platform**) is an autonomous multi-agent software engineering runtime engineered for zero-drift execution, high-assurance orchestration, and deterministic validation. Built on **Bun (>= 1.3.14)**, **Effect-TS**, and **SQLite internals**, XOCP enforces rigorous boundaries across agents, execution contexts, and persistent storage layers.

The system ensures that cognitive agents collaborate without speculative feature drift, unauthorized scope expansion, or cascading runtime failures.

---

## 2. Five-Agent Pipeline Topology & Execution Lifecycle

The core execution lifecycle orchestrates tasks through five specialized cognitive agents:

```
                      [User Request]
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                         Elicitador                          │
│  - Requirements elicitation & intent grounding             │
│  - Queries .opencode/sources.db via FTS5 BM25              │
└────────────────────────────┬────────────────────────────────┘
                             │ (Elicited Spec)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                      workflow-triador                       │
│  - Intent triage: SPEC, BRIEF, or DIVIDIR                   │
│  - Heuristic Graphify trigger (multi-module refactoring)    │
└────────────────────────────┬────────────────────────────────┘
                             │ (Triage Action)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                          Analista                           │
│  - Structured Technical Brief generation (YAML v2.0)        │
│  - DAG dependency declaration (depends_on)                  │
│  - Explicit scope boundaries (files_scope)                  │
└────────────────────────────┬────────────────────────────────┘
                             │ (Technical Briefs DAG)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│               Cluster Dispatcher (DAG Engine)               │
│  ┌───────────────────┐ ┌───────────────────┐ ┌────────────┐ │
│  │   core Cluster    │ │  backend Cluster  │ │  frontend  │ │
│  │ (Schemas, Models) │ │  (APIs, Services) │ │  (UI, CSS) │ │
│  └───────────────────┘ └───────────────────┘ └────────────┘ │
│  - Parallel worker contexts (depends_on: [])                │
│  - Strict Delegation Depth = 1 constraint                   │
│  - Pre-Flight Self-Test Guard (bun test covering changes)   │
└────────────────────────────┬────────────────────────────────┘
                             │ (Code Modifications)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                   Avaliador (+ Auditor)                     │
│  - Zero-Trust Dual-Lens Verification Engine                 │
│  - Lens 1: Evidence Panel (Deterministic Shell Checks)      │
│  - Lens 2: Impact Panel (Scope & Boundary Enforcement)      │
└────────────────────────────┬────────────────────────────────┘
                             │
             ┌───────────────┴───────────────┐
             ▼                               ▼
       [Approved 100%]              [Rejected / Failed]
             │                               │
             ▼                               ▼
     Task Completion &             Atomic Cycle Tracker
     Handoff Persistence         (.opencode/workflow-cycles.db)
                                             │
                                     [If cycle > 3]
                                             │
                                             ▼
                                  CycleLimitExceededError
                                             │
                                             ▼
                                    Telemetry Incident
                             (.opencode/evolution/incident.json)
```

---

## 3. Core Architectural Flow Diagrams

### Diagram 1: Parallel Context Isolation (Independent DAG Nodes)
Tasks with `depends_on: []` execute simultaneously in completely isolated worker contexts with zero cross-talk, consuming shared state only through deterministic read-only boundaries:

```
┌───────────────────────────────────────────────────────────────────────────┐
│                      SHARED STORAGE & SYSTEM SERVICES                     │
│                                                                           │
│  ┌───────────────────────┐  ┌───────────────────────┐  ┌───────────────┐  │
│  │ SQLite Handoff Memory │  │  FTS5 Knowledge Base  │  │ Graphify Map  │  │
│  │   (<= 2000 chars)     │  │ (.opencode/sources.db)│  │ (graph.json)  │  │
│  └───────────┬───────────┘  └───────────┬───────────┘  └───────┬───────┘  │
└──────────────┼──────────────────────────┼──────────────────────┼──────────┘
               │                          │                      │
       ┌───────┴──────────────────────────┼──────────────────────┴───────┐
       │ (Read-Only)                      │ (Read-Only)                  │
       ▼                                  ▼                              ▼
┌──────────────┐                  ┌──────────────┐               ┌──────────────┐
│   Worker 1   │                  │   Worker 2   │               │   Worker 3   │
│ (core domain)│                  │(backend dom.)│               │(frontend dom)│
├──────────────┤                  ├──────────────┤               ├──────────────┤
│ Context:     │  NÃO DEPENDEM    │ Context:     │  NÃO DEPENDEM │ Context:     │
│ Isolated     │ ◄──────────────► │ Isolated     │ ◄───────────► │ Isolated     │
│ Task: Schema │  (ZERO CROSS-    │ Task: API    │  (ZERO CROSS- │ Task: Views  │
│ Scope: Core  │      TALK)       │ Scope: Route │      TALK)    │ Scope: Tokens│
└──────┬───────┘                  └──────┬───────┘               └──────┬───────┘
       │                                 │                              │
       │ (Pre-Flight Self-Test)          │ (Pre-Flight Self-Test)       │ (Self-Test)
       ▼                                 ▼                              ▼
  [Pass: Ready]                     [Pass: Ready]                  [Pass: Ready]
```

---

### Diagram 2: The Dual-Lens Avaliador Gate (Zero-Trust Verification)
The Avaliador operates under a strict **Zero-Trust policy**, remaining completely blind to executor claims and auditing solely empirical evidence and code diffs:

```
                  [Executor Submission Proposal]
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                    DUAL-LENS AVALIADOR GATE                     │
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ Lens 1: Evidence Panel (Lente: Evidência)               │   │
│   │                                                         │   │
│   │   Deterministic Shell Execution:                        │   │
│   │   - bun typecheck                                       │   │
│   │   - bun test <verification_gates.shell_checks>          │   │
│   │                                                         │   │
│   │   If exitCode !== 0 -> REJECTED (INSUFFICIENT_EVIDENCE) │   │
│   └────────────────────────────┬────────────────────────────┘   │
│                                │                                │
│                                ▼                                │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ Lens 2: Impact Panel (Lente: Operação/Impacto)          │   │
│   │                                                         │   │
│   │   Empirical git diff Inspection:                        │   │
│   │   - Strictly forbidden files touched?                   │   │
│   │   - Unmapped out-of-scope files modified?               │   │
│   │   - Graphify community boundaries breached?             │   │
│   │                                                         │   │
│   │   If boundary breached -> REJECTED (UNACCEPTABLE_IMPACT)│   │
│   └────────────────────────────┬────────────────────────────┘   │
│                                │                                │
│                                ▼                                │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ Blind Validation Cross-Check                            │   │
│   │                                                         │   │
│   │   Independently compares expected vs actual diff        │   │
│   │   before reconciling executor checklist claims.         │   │
│   └─────────────────────────────────────────────────────────┘   │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
       [Both Lenses Pass 100%]          [Any Check Fails]
                 │                               │
                 ▼                               ▼
            [APPROVED]                      [REJECTED]
```

---

### Diagram 3: Sources Ingestion & Normalization Pipeline
Raw multimodal research artifacts are ingested, normalized into structured Markdown with YAML frontmatter, and indexed into SQLite FTS5 for intent-aligned retrieval:

```
  [Raw Ingestion Inputs]
  - HTML Web Articles
  - PDF Documents
  - YouTube Transcripts
  - Code & Text Snippets
           │
           ▼
┌─────────────────────────────────────────────────────────────────┐
│                NORMALIZATION TRANSFORMER PIPELINE               │
│                                                                 │
│  - html-transformer: Strips scripts/nav/ads -> Clean GFM        │
│  - pdf-transformer: Strips headers/footers/page# -> Unwraps     │
│  - transcript-transformer: Punctuates & groups by [timestamp]   │
│  - code-transformer: Enforces fenced blocks with language tags  │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│            CANONICAL NORMALIZED MARKDOWN STORAGE                │
│            (.opencode/sources/normalized/<source_id>.md)        │
│                                                                 │
│   ---                                                           │
│   source_id: "src-10294"                                        │
│   title: "Architecture Specification"                           │
│   source_type: "html"                                           │
│   original_uri: "https://docs.example.com/spec"                 │
│   ingested_at: "2026-09-13T10:00:00Z"                           │
│   summary: "Deterministic DAG pipeline description..."          │
│   key_entities: ["Dispatcher", "Avaliador", "FTS5"]             │
│   ---                                                           │
│   # Document Content...                                         │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                 HEADING-AWARE SEMANTIC CHUNKING                 │
│  Splits around headings (#, ##, ###) to preserve code blocks    │
│  and logical route functions intact within chunk boundaries.    │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                 SQLITE FTS5 TWO-TIER INDEXING                   │
│                    (.opencode/sources.db)                       │
│                                                                 │
│  Tier 1: Document Catalog (sources table)                       │
│  Tier 2: Heading Chunks FTS5 (source_chunks_fts with BM25)      │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                    INTENT QUERY FILTER ENGINE                   │
│                   (querySourcesByIntent)                        │
│                                                                 │
│  - Evaluates user prompt objective keywords against BM25 ranks  │
│  - Suppresses off-topic document chunks                         │
│  - Accessible ONLY by Elicitador & Analista                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Operational Invariants & Storage Boundaries

1. **Runtime:** Bun >= 1.3.14 with native TypeScript execution and SQLite WAL mode.
2. **Session Compaction (`compaction.ts`):** Reclaims active context memory (~20k tokens) during long sessions.
3. **Durable Handoff (`handoff/`):** Persistent key-value memory across sessions, strictly capped at **<= 2000 characters**.
4. **Code Graph Mapping (Graphify):** External CLI invoked via `uv tool run --from graphifyy==<PINNED> graphify update <dir>`, generating `graphify-out/graph.json` with zero LLM token consumption.
5. **Research Sources Barrier:** Sources are indexed exclusively for `Elicitador` and `Analista`. `workflow-executor` and `Avaliador` are strictly blocked (`SourcesPermissionDeniedError`).
6. **Delegation Depth Limit:** Agent delegation via `task` tool is strictly constrained to **depth = 1**.
7. **Atomic Cycle Tracking:** Re-executions are tracked in `.opencode/workflow-cycles.db` via `BEGIN IMMEDIATE` / `UPSERT` queries. Exceeding 3 cycles halts execution with `CycleLimitExceededError` and logs an evolution incident in `.opencode/evolution/`.
