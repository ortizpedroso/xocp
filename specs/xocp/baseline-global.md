# XOCP Baseline Global Rules

This document establishes the canonical **11 Baseline Rules** for all agents operating within the XOCP runtime. Every Technical Brief, implementation proposal, and Avaliador review gate must enforce these invariant standards.

---

## 1. Security Baseline Rules (`G-SEC-1` through `G-SEC-6`)

### `G-SEC-1`: Input Sanitization & Boundary Validation
- **Requirement:** All external input, parameters, API requests, and CLI arguments must be validated and sanitized before entering the application boundary.
- **Audit Criteria:** 
  - Schema validation must occur using strict runtime schemas (e.g., Effect Schema, Zod, or TypeBox).
  - Filename paths must be sanitized against path traversal (`..`, Windows-illegal characters `:` `*` `?` `"` `<` `>` `|`).

### `G-SEC-2`: Secret Leakage Prevention
- **Requirement:** Secrets, tokens, credentials, and private keys must never be committed to source code or dumped into logs.
- **Audit Criteria:**
  - Code diffs must not contain hardcoded credentials, JWT private keys, or API tokens.
  - Environment variables must be loaded via typed configuration modules.

### `G-SEC-3`: Secure Token Handling & Storage
- **Requirement:** Authentication tokens and session tokens must be stored using secure storage mechanisms with minimal necessary scope and bounded lifetime.
- **Audit Criteria:**
  - Token refresh routines must be atomic and handle concurrency without token theft or replay vulnerability.
  - Tokens in SQLite or filesystem cache must have restricted permissions (0600 on POSIX).

### `G-SEC-4`: Command Injection Defense
- **Requirement:** Shell commands must never concatenate unescaped user or agent inputs directly into command strings.
- **Audit Criteria:**
  - Subprocesses must be executed with parameterized argument arrays rather than shell string interpolation.
  - Where `sh -c` is required, arguments must be strictly validated against safe whitelists.

### `G-SEC-5`: SSRF (Server-Side Request Forgery) Guardrails
- **Requirement:** Any backend network fetching mechanism (including source scrapers and webhook forwarders) must restrict outgoing connections to approved protocols and destinations.
- **Audit Criteria:**
  - Requests must disallow private IP ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, `169.254.169.254`) unless explicitly configured.
  - Only `http:` and `https:` schemes are permitted.

### `G-SEC-6`: Pinned Dependency Immutability
- **Requirement:** All external tool invocations, CLI utilities, and runtime dependencies must specify exact, immutable version pins.
- **Audit Criteria:**
  - External CLI commands must use pinned versions (e.g., `uv tool run --from graphifyy==0.1.0 graphify`).
  - `package.json` dependencies must be pinned to exact versions without loose ranges.

---

## 2. UI/UX Baseline Rules (`G-UX-1` through `G-UX-5`)

### `G-UX-1`: Explicit Error Boundaries & Failure Feedback
- **Requirement:** Frontend applications and components must catch and render component failures gracefully rather than unmounting the entire application.
- **Audit Criteria:**
  - Root and route-level error boundaries must render actionable recovery controls (e.g., "Retry" or "Reset Session").
  - API communication errors must display clear contextual toast or banner notifications.

### `G-UX-2`: Responsive Constraints & Layout Stability
- **Requirement:** Layouts must remain functionally complete across all viewport sizes without content truncation or broken overflow.
- **Audit Criteria:**
  - Mobile touch targets must be at least 44x44px.
  - Desktop UI elements must not clip text or force unintended horizontal scrolling.

### `G-UX-3`: Deterministic Loading Skeletons & States
- **Requirement:** Dynamic and asynchronous data fetching must render deterministic skeleton placeholders or progress indicators rather than blank screens or layout shifts.
- **Audit Criteria:**
  - Async views must declare fallback skeletons matching the target content geometry.
  - Layout Cumulative Shift (CLS) must remain near zero during data hydration.

### `G-UX-4`: Keyboard Accessibility & Focus Trapping
- **Requirement:** All interactive controls (buttons, drawers, dialogs, tabs) must be fully navigable via keyboard.
- **Audit Criteria:**
  - Modals and slide-over drawers must trap focus while open and restore focus to trigger buttons upon closing with `Esc`.
  - All interactive elements must exhibit distinct `:focus-visible` styling and valid ARIA attributes (`aria-label`, `aria-expanded`).

### `G-UX-5`: Unified Semantic Design Tokens
- **Requirement:** All visual elements must consume centralized design tokens for colors, typography, spacing, and border radii.
- **Audit Criteria:**
  - Hardcoded arbitrary hex colors and conflicting margins are prohibited in component code.
  - Token classes (e.g., `bg-v2-background-bg-deep`, `text-v2-text-text-accent`) must ensure WCAG AA contrast compliance.
