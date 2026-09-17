import { Schema } from "effect"
import type { TechnicalBriefV2 } from "../brief/types"

export type DomainClusterId = "core" | "backend" | "frontend" | "integration"

export interface DomainClusterDefinition {
  id: DomainClusterId
  name: string
  description: string
  responsibilities: string[]
  filePatterns: string[]
}

export const DOMAIN_CLUSTERS: Record<DomainClusterId, DomainClusterDefinition> = {
  core: {
    id: "core",
    name: "Core Domain Cluster",
    description: "Database schemas, SQLite/ORM migrations, business domain models, and core invariants.",
    responsibilities: [
      "Database schemas and tables",
      "Migrations and storage engines",
      "Core domain contracts and types",
      "Cross-cutting primitives",
    ],
    filePatterns: [
      "packages/core/**",
      "**/db/**",
      "**/schema/**",
      "**/models/**",
    ],
  },
  backend: {
    id: "backend",
    name: "Backend Domain Cluster",
    description: "API routes, controllers, middleware, business services, and server protocols.",
    responsibilities: [
      "API route handlers and server endpoints",
      "Business services and controllers",
      "Middleware, authentication, and validation",
      "External service integrations",
    ],
    filePatterns: [
      "packages/server/**",
      "**/api/**",
      "**/routes/**",
      "**/services/**",
    ],
  },
  frontend: {
    id: "frontend",
    name: "Frontend Domain Cluster",
    description: "Components, Vite/React views, CSS tokens, client state, and interactive UI.",
    responsibilities: [
      "React/Vite UI components and pages",
      "Client state management and hooks",
      "CSS design tokens and styling",
      "User event interactions and accessibility",
    ],
    filePatterns: [
      "packages/app/**",
      "packages/web/**",
      "**/components/**",
      "**/pages/**",
      "**/views/**",
    ],
  },
  integration: {
    id: "integration",
    name: "Integration Domain Cluster",
    description: "Cross-boundary glue: shared contract packages, protocol/schema packages, and end-to-end flows that stitch the other clusters together. The only cluster allowed to cross cluster boundaries — it is the sole consumer of two-or-more parallel branches (contract-first root, or n-th brief after its dependencies)",
    responsibilities: [
      "Shared contract packages (protocol, schema)",
      "End-to-end integration tests",
      "Contract-first wiring between two or more parallel branches",
      "Cross-cluster consistency invariants",
    ],
    filePatterns: [
      "packages/protocol/**",
      "packages/schema/**",
      "e2e/**",
      "**/integration/**",
      "**/contracts/**",
    ],
  },
}

export interface WorkerContext {
  workerId: string
  clusterId: DomainClusterId
  briefId: string
  taskId: string
  status: "pending" | "running" | "completed" | "failed" | "blocked"
  delegationDepth: number // Invariant: depth strictly <= 1
  assignedFiles: {
    allow_modify: string[]
    allow_read_only: string[]
    strictly_forbidden: string[]
  }
}

export interface ClusterSynthesisReport {
  clusterId: DomainClusterId
  briefsHandled: string[]
  filesTouched: string[]
  exportedContracts: string[]
  testAssertionsPassed: number
  allApproved: boolean
  timestamp: string
}
