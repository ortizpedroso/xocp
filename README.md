# XOCP (eXtensible Open Code Platform)

Autonomous, deterministic, multi-agent software engineering runtime built with **Bun (>= 1.3.14)**, **Effect-TS**, and **SQLite internals**.

---

## 🚀 Key Features

- **Cognitive Pipeline Orchestration:** End-to-end task workflow through `Elicitador` -> `Analista` -> `Cluster Dispatcher` -> `workflow-executor` -> `Avaliador`.
- **DAG Cluster Dispatcher:** Simultaneous parallel execution of independent tasks (`depends_on: []`) in isolated worker contexts with zero cross-talk.
- **Zero-Trust Dual-Lens Avaliador:** Independent blind evaluation of implementation proposals across **Lens 1 (Evidence - Deterministic Shell Checks)** and **Lens 2 (Impact - Scope & Graphify Boundary Enforcement)**.
- **Local Knowledge Sources Engine:** Ingests HTML, PDF, YouTube transcripts, and code snippets into normalized Markdown with YAML frontmatter, indexed in SQLite FTS5 for intent-aligned query retrieval (`querySourcesByIntent`).
- **Strict Permission Barriers:** Research sources are indexed exclusively for `Elicitador` and `Analista`; `workflow-executor` and `Avaliador` access is strictly blocked (`SourcesPermissionDeniedError`).
- **Executor Pre-Flight Self-Test Guard:** Local hard gate blocking submission to Avaliador if unit tests fail, maintaining complete reviewer blindness.
- **Atomic Cycle Tracking & Incident Telemetry:** Bounded re-try loop (max 3 cycles) backed by atomic SQLite transactions and automated incident logging in `.opencode/evolution/`.

---

## 🗺️ Roadmap & Status

| Milestone | Status | Description |
|:---|:---|:---|
| **Pipeline & Path Hardening** | ✅ Complete | Windows-safe path sanitization and contract validation |
| **Cluster Orchestration (Dispatcher)** | ✅ Complete | DAG engine with parallel context isolation |
| **Dual-Lens Avaliador Engine** | ✅ Complete | Zero-Trust evidence and impact audit gates |
| **Deterministic Source Normalization** | ✅ Complete | Multi-format transformers (HTML, PDF, YouTube, Code) |
| **FTS5 Intent-Aligned Search** | ✅ Complete | BM25 indexing and intent keyword suppression filter |
| **Sources Web Drawer Component** | ✅ Complete | Multi-tab UI drawer integrated into app titlebar |
| **Distributed Remote Workers** | 🔄 Upcoming | Worker node distribution over secure gRPC |

---

## ⚡ Quickstart

### Prerequisites
- [Bun](https://bun.sh) (>= 1.3.14)
- Node.js (for optional web tooling)

### Installation
```bash
# Clone the repository
git clone https://github.com/ortizpedroso/xocp.git
cd xocp

# Install dependencies across all monorepo workspaces
bun install
```

### Development Commands
```bash
# Start backend core development server (Port 4096)
bun dev

# Start frontend application with Vite (Port 3000)
bun dev web
```

### Running Test Suites
```bash
# Run core test suites (Workflow Review, Transformers, Sources, Self-Test)
bun test test/workflow-review/ test/sources/ test/workflow-executor/

# Run complete repository test suite
bun test
```

---

## 📄 License
MIT License. Copyright (c) 2026 XOCP Contributors.
