import path from "path"
import { ContractNotFound } from "./error"
import { contractRelativePath } from "./task-path"
import { readBriefStatus, readSpecStatus, writeBriefStatus, writeSpecStatus, type Status } from "./status"
import { taskKind } from "./task-path"

export async function readContractStatus(directory: string, task_id: string) {
  const relativePath = contractRelativePath(task_id)
  const filePath = path.join(directory, relativePath)
  if (!(await Bun.file(filePath).exists())) {
    throw new ContractNotFound({ task_id, path: relativePath })
  }

  const content = await Bun.file(filePath).text()
  const status =
    taskKind(task_id) === "spec"
      ? readSpecStatus(content, relativePath)
      : readBriefStatus(content, relativePath)

  return { relativePath, content, status }
}

export type ContractRead = {
  relativePath: string
  content: string
  status: Status
}

export async function writeContractStatus(directory: string, task_id: string, new_status: Status) {
  const contract = await readContractStatus(directory, task_id)
  const content =
    taskKind(task_id) === "spec"
      ? writeSpecStatus(contract.content, new_status)
      : writeBriefStatus(contract.content, new_status)

  const filePath = path.join(directory, contract.relativePath)
  await Bun.write(filePath, content)

  return {
    relativePath: contract.relativePath,
    content,
    status: new_status,
    previous_status: contract.status,
  }
}
