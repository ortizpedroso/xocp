import { NotApproved } from "./error"
import { readContractStatus } from "./contract"

export async function taskApprovalCheck(directory: string, task_id: string) {
  const contract = await readContractStatus(directory, task_id)
  if (contract.status !== "aprovada") {
    throw new NotApproved({
      task_id,
      path: contract.relativePath,
      status: contract.status,
    })
  }

  return contract
}
