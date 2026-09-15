import fs from "fs/promises"
import path from "path"
import crypto from "crypto"

export interface IncidentPayload {
  id: string
  timestamp: string
  task_id: string
  cycles_used: number
  root_cause_category: "cycle_threshold_reached" | "brief_insufficient_contract" | string
  symptom: string
  context_snapshot: Record<string, unknown>
}

export async function recordIncident(
  directory: string,
  params: Omit<IncidentPayload, "id" | "timestamp"> & { id?: string; timestamp?: string }
): Promise<IncidentPayload> {
  const incidentDir = path.join(directory, ".opencode", "evolution")
  await fs.mkdir(incidentDir, { recursive: true })

  const id = params.id || `inc-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`
  const timestamp = params.timestamp || new Date().toISOString()

  const incident: IncidentPayload = {
    id,
    timestamp,
    task_id: params.task_id,
    cycles_used: params.cycles_used,
    root_cause_category: params.root_cause_category,
    symptom: params.symptom,
    context_snapshot: params.context_snapshot || {}
  }

  const filePath = path.join(incidentDir, `incident-${id}.json`)
  await Bun.write(filePath, JSON.stringify(incident, null, 2))
  return incident
}
