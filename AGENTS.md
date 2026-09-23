# XOCP Multi-Agent Directory & Execution Policy

## 1. System Agent Directory (14 Cognitive Agents)

| Agent Name | Operational Domain | Primary Responsibility |
|:---|:---|:---|
| **Elicitador** | Pipeline Gateway | Requirements gathering, ambiguity resolution, user intent elicitation, source querying. |
| **workflow-triador** | Pipeline Gateway | Semantic intent classification (`SPEC`, `BRIEF`, `DIVIDIR`), Graphify trigger evaluation. |
| **Analista** | Specification Engine | System modeling, Technical Brief v2 generation, DAG dependency graph construction. |
| **Cluster Dispatcher** | Orchestration Lead | DAG execution engine, parallel context manager, worker context isolation. |
| **core Lead** | Domain Cluster | Oversees runtime protocols, data contracts, schemas, and persistence primitives. |
| **backend Lead** | Domain Cluster | Oversees server routes, API endpoints, microservices, and database connectors. |
| **frontend Lead** | Domain Cluster | Oversees Solid/React UI components, design tokens, accessibility, and client state. |
| **workflow-executor** | Execution Worker | Ephemeral implementation worker; writes code within declared `files_scope`. |
| **Avaliador** | Verification Gate | Zero-Trust Dual-Lens auditor; validates evidence (Lens 1) and impact (Lens 2). |
| **Auditor** | Governance | Cross-checks compliance with `baseline-global.md` and security invariants. |
| **Graphify Operator** | Static Analysis | Code knowledge graph generator using local AST parsing (`graphify update`). |
| **Research Operator** | Knowledge Ingestion | Ingests multimodal external research sources (HTML, PDF, YouTube, Snippets). |
| **Evolution Incident Reporter** | Telemetry | Records cycle escalations and failure incidents in `.opencode/evolution/`. |
| **Session Compactor** | Memory Management | Reclaims context space during extended conversations via structured summaries. |

---

## 2. Invariant Delegation Boundaries & Depth Limit

1. **Strict Delegation Depth = 1:**
   - Any agent invoking sub-agents via the `task` tool is restricted to **Depth = 1**.
   - Sub-agents are **strictly prohibited** from recursively spawning additional sub-agents.
   - All delegations must return results directly to the orchestrating lead or caller.

2. **Standardized Review Tool Reference:**
   - The official tool for requesting task verification and approval from the Avaliador is **`task_approval_check`**.

3. **Strict Research Sources Permission Boundary:**
   - **Allowed Agents:** `Elicitador` and `Analista` have full read access to `.opencode/sources.db` and the intent query engine (`querySourcesByIntent`).
   - **Blocked Agents:** `workflow-executor` and `Avaliador` are strictly blocked from invoking sources tools (`SourcesPermissionDeniedError`).
   - **Rationale:** Prevents context contamination and ensures implementation workers execute strictly against the validated Technical Brief.

---

## 3. Executor Pre-Flight Self-Test Protocol

Before submitting changes for evaluation:
1. When `workflow-executor` modifies files within `files_scope.allow_modify`, it **must** write or update a corresponding unit test (`<module>.test.ts`).
2. The executor invokes `runExecutorSelfTest(workspaceDir, testFilePath)` which runs `bun test <testFilePath>`.
3. **Hard Local Gate:**
   - If `exitCode !== 0`: Submission is blocked. The executor must inspect test output and fix regressions locally.
   - If `exitCode === 0`: The executor is authorized to call `task_approval_check`.
4. **Reviewer Blindness (Zero Contamination):**
   - The Avaliador remains 100% blind to executor self-test logs. The Avaliador evaluates changes independently against canonical test gates specified in the Technical Brief.
