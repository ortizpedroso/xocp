import { statfs } from "node:fs/promises"
import path from "node:path"
import semver from "semver"

export type CheckStatus = "pass" | "fail" | "warn" | "info"

export type CheckResult = {
  id: string
  status: CheckStatus
  title: string
  detail?: string
  hint?: string
}

export type DoctorDeps = {
  platform: NodeJS.Platform
  bunVersion: string
  nodeVersion: string | undefined
  requiredBunVersion: string
  requiredNodeVersion: string
  env: NodeJS.ProcessEnv
  cwd: string
  runCommand: (cmd: string[], options?: { env?: NodeJS.ProcessEnv }) => Promise<CommandResult>
  fetchRegistry: () => Promise<{ ok: boolean; certError: boolean; message?: string }>
  freeDiskBytes: () => Promise<number | undefined>
}

type CommandResult = {
  exitCode: number
  stdout: string
  stderr: string
}

const MIN_PYTHON_VERSION = "3.6.0"
const RECOMMENDED_PYTHON_VERSION = "3.11.0"
const MIN_FREE_DISK_GB = 5
const FAIL_FREE_DISK_GB = 1
const NPM_REGISTRY_URL = "https://registry.npmjs.org"

export const OFFICIAL_DOWNLOAD_URLS = {
  bun: "https://bun.sh",
  node: "https://nodejs.org",
  python: "https://python.org",
  npm: "https://nodejs.org",
} as const

const GUIDE_ONLY_FIX_IDS = new Set(["bun", "node", "python", "npm"])

export function osLabel(platform = process.platform) {
  if (platform === "win32") return "Windows"
  if (platform === "darwin") return "macOS"
  return "Linux"
}

export function readRequiredBunVersion(packageManager = "bun@1.3.14") {
  const match = packageManager.match(/^bun@(.+)$/)
  return match?.[1] ?? "1.3.14"
}

export function parsePythonVersion(output: string) {
  const match = output.match(/Python\s+(\d+\.\d+(?:\.\d+)?)/i)
  return match?.[1]
}

export function uvInstallCommand(platform = process.platform) {
  if (platform === "win32") {
    return 'powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"'
  }
  return "curl -LsSf https://astral.sh/uv/install.sh | sh"
}

export function parseDoctorArgs(argv = process.argv.slice(2)) {
  return { fix: argv.includes("--fix") }
}

export function isAffirmative(answer: string) {
  const normalized = answer.trim().toLowerCase()
  return normalized === "s" || normalized === "sim" || normalized === "y" || normalized === "yes"
}

export function officialDownloadUrl(checkId: string) {
  if (checkId in OFFICIAL_DOWNLOAD_URLS) {
    return OFFICIAL_DOWNLOAD_URLS[checkId as keyof typeof OFFICIAL_DOWNLOAD_URLS]
  }
}

export function formatBytes(bytes: number) {
  const gb = bytes / (1024 ** 3)
  if (gb >= 1) return `${gb.toFixed(1)} GB`
  const mb = bytes / (1024 ** 2)
  return `${mb.toFixed(0)} MB`
}

async function defaultRunCommand(cmd: string[], options?: { env?: NodeJS.ProcessEnv }) {
  try {
    const proc = Bun.spawn({
      cmd,
      stdout: "pipe",
      stderr: "pipe",
      env: options?.env ?? process.env,
    })
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])
    return { exitCode, stdout, stderr }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { exitCode: 1, stdout: "", stderr: message }
  }
}

async function defaultFetchRegistry() {
  try {
    const response = await fetch(NPM_REGISTRY_URL, { signal: AbortSignal.timeout(10_000) })
    return { ok: response.ok, certError: false }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : ""
    const certError =
      /SELF_SIGNED_CERT|UNABLE_TO_VERIFY|CERT_|certificate/i.test(`${code} ${message}`)
    return { ok: false, certError, message }
  }
}

async function defaultFreeDiskBytes(cwd: string, platform = process.platform) {
  if (platform === "win32") {
    const drive = path.parse(path.resolve(cwd)).root.replace(/\\$/, "")
    const letter = drive.replace(":", "")
    const proc = Bun.spawn({
      cmd: [
        "powershell",
        "-NoProfile",
        "-Command",
        `(Get-PSDrive -Name '${letter}').Free`,
      ],
      stdout: "pipe",
      stderr: "pipe",
    })
    const stdout = (await new Response(proc.stdout).text()).trim()
    await proc.exited
    const free = Number.parseInt(stdout, 10)
    return Number.isFinite(free) ? free : undefined
  }

  const stats = await statfs(cwd)
  return stats.bavail * stats.bsize
}

export function defaultDoctorDeps(): DoctorDeps {
  return {
    platform: process.platform,
    bunVersion: Bun.version,
    nodeVersion: process.versions.node,
    requiredBunVersion: readRequiredBunVersion(),
    requiredNodeVersion: "22.0.0",
    env: process.env,
    cwd: process.cwd(),
    runCommand: defaultRunCommand,
    fetchRegistry: defaultFetchRegistry,
    freeDiskBytes: () => defaultFreeDiskBytes(process.cwd(), process.platform),
  }
}

export async function loadDoctorDeps(root = process.cwd()): Promise<DoctorDeps> {
  const packageJsonPath = path.join(root, "package.json")
  const packageJson = await Bun.file(packageJsonPath).json().catch(() => ({ packageManager: "bun@1.3.14" }))
  const deps = defaultDoctorDeps()
  deps.requiredBunVersion = readRequiredBunVersion(
    typeof packageJson.packageManager === "string" ? packageJson.packageManager : "bun@1.3.14",
  )
  deps.cwd = root
  deps.freeDiskBytes = () => defaultFreeDiskBytes(root, deps.platform)
  return deps
}

async function tryPython(
  deps: DoctorDeps,
  cmd: string[],
): Promise<{ version: string; source: string } | undefined> {
  const result = await deps.runCommand(cmd, { env: deps.env })
  const output = `${result.stdout}\n${result.stderr}`.trim()
  if (result.exitCode !== 0) return
  const version = parsePythonVersion(output)
  if (!version || !semver.valid(version) || !semver.gte(version, MIN_PYTHON_VERSION)) return
  return { version, source: cmd.join(" ") }
}

async function windowsPythonCandidates(deps: DoctorDeps) {
  const localAppData = deps.env.LOCALAPPDATA ?? deps.env.UserProfile
  const programFiles = deps.env.ProgramFiles
  const join = path.win32.join
  const paths = [
    ["py", "-3", "--version"],
    ["python", "--version"],
    ["python3", "--version"],
  ]

  const roots = [localAppData, programFiles].filter(Boolean) as string[]
  for (const root of roots) {
    for (const version of ["313", "312", "311", "310", "39", "38", "37", "36"]) {
      paths.push([join(root, "Python", `Python${version}`, "python.exe"), "--version"])
      paths.push([join(root, `Python${version}`, "python.exe"), "--version"])
    }
    paths.push([join(root, "Programs", "Python", "Python311", "python.exe"), "--version"])
    paths.push([join(root, "Programs", "Python", "Python312", "python.exe"), "--version"])
    paths.push([join(root, "Programs", "Python", "Python313", "python.exe"), "--version"])
  }

  for (const cmd of paths) {
    const found = await tryPython(deps, cmd)
    if (found) return found
  }
}

async function checkBun(deps: DoctorDeps): Promise<CheckResult> {
  const version = deps.bunVersion
  if (!version || !semver.valid(version)) {
    return {
      id: "bun",
      status: "fail",
      title: "Bun: versão não detectada",
      hint: "Instale Bun em https://bun.sh e reinicie o terminal.",
    }
  }

  if (!semver.gte(version, deps.requiredBunVersion)) {
    return {
      id: "bun",
      status: "fail",
      title: `Bun ${version} detectado`,
      detail: `Versão mínima exigida: ${deps.requiredBunVersion}`,
      hint: `Atualize o Bun para ${deps.requiredBunVersion}+ (veja packageManager em package.json).`,
    }
  }

  return {
    id: "bun",
    status: "pass",
    title: `Bun ${version} detectado`,
  }
}

async function checkNode(deps: DoctorDeps): Promise<CheckResult> {
  const version = deps.nodeVersion
  if (!version || !semver.valid(version)) {
    return {
      id: "node",
      status: "fail",
      title: "Node.js: não encontrado",
      hint: "Instale Node.js 22+ (https://nodejs.org). Necessário para npm/npx e builds nativos.",
    }
  }

  if (!semver.gte(version, deps.requiredNodeVersion)) {
    return {
      id: "node",
      status: "fail",
      title: `Node.js ${version} detectado`,
      detail: `Versão mínima exigida: ${deps.requiredNodeVersion}`,
      hint: "Atualize para Node.js 22+ (CI e pacotes do monorepo usam >=22).",
    }
  }

  return {
    id: "node",
    status: "pass",
    title: `Node.js ${version} detectado`,
  }
}

async function checkPython(deps: DoctorDeps): Promise<CheckResult> {
  const found =
    deps.platform === "win32"
      ? await windowsPythonCandidates(deps)
      : await tryPython(deps, ["python3", "--version"])

  if (!found) {
    const hint =
      deps.platform === "win32"
        ? "Instale Python 3.11+ de https://python.org (marque \"Add to PATH\") e reinicie o terminal."
        : "Instale Python 3.11+ (brew install python@3.12 ou https://python.org) e confirme que python3 está no PATH."
    return {
      id: "python",
      status: "fail",
      title: "Python: nenhuma instalação funcional encontrada",
      detail: `Necessário para node-gyp compilar dependências nativas (ex.: tree-sitter-powershell). Mínimo: ${MIN_PYTHON_VERSION}`,
      hint,
    }
  }

  const title = `Python ${found.version} detectado (${found.source})`
  if (!semver.gte(found.version, RECOMMENDED_PYTHON_VERSION)) {
    return {
      id: "python",
      status: "warn",
      title,
      detail: `Versão funcional, mas recomendamos ${RECOMMENDED_PYTHON_VERSION}+.`,
      hint: "Atualize o Python para evitar problemas com node-gyp em dependências nativas.",
    }
  }

  return {
    id: "python",
    status: "pass",
    title,
  }
}

async function commandVersion(deps: DoctorDeps, cmd: string[]) {
  const result = await deps.runCommand(cmd, { env: deps.env })
  const output = `${result.stdout}\n${result.stderr}`.trim()
  if (result.exitCode !== 0) return
  const match = output.match(/(\d+\.\d+(?:\.\d+)?(?:[a-z0-9.-]*)?)/)
  return match?.[1]
}

async function whichCommand(deps: DoctorDeps, name: string) {
  if (deps.platform === "win32") {
    const result = await deps.runCommand(["where", name], { env: deps.env })
    if (result.exitCode !== 0) return
    return result.stdout.split(/\r?\n/).find((line) => line.trim())?.trim()
  }

  const result = await deps.runCommand(["sh", "-lc", `command -v ${name}`], { env: deps.env })
  if (result.exitCode !== 0) return
  return result.stdout.trim()
}

async function findUvBinary(deps: DoctorDeps) {
  const located = await whichCommand(deps, "uv")
  if (located) return located

  const home = deps.env.HOME ?? deps.env.USERPROFILE
  const candidates = home
    ? [
        path.join(home, ".local", "bin", "uv"),
        path.join(home, ".cargo", "bin", "uv"),
      ]
    : []
  for (const candidate of candidates) {
    if (await Bun.file(candidate).exists()) return candidate
  }
}

async function checkUv(deps: DoctorDeps): Promise<CheckResult> {
  const location = await findUvBinary(deps)
  if (!location) {
    return {
      id: "uv",
      status: "fail",
      title: "uv: não encontrado",
      detail: "Necessário para Graphify e Headroom.",
      hint: `Instale com: ${uvInstallCommand(deps.platform)}`,
    }
  }

  const version = await commandVersion(deps, [location, "--version"])
  const inPath = location === await whichCommand(deps, "uv")
  const pathNote = inPath ? "" : " (fora do PATH desta sessão)"
  return {
    id: "uv",
    status: "pass",
    title: version
      ? `uv detectado (${version})${pathNote}`
      : `uv detectado (${location})${pathNote}`,
  }
}

async function checkNpm(deps: DoctorDeps): Promise<CheckResult> {
  const npmPath = await whichCommand(deps, "npm")
  const npxPath = await whichCommand(deps, "npx")
  if (!npmPath && !npxPath) {
    return {
      id: "npm",
      status: "fail",
      title: "npm/npx: não encontrado",
      detail: "Necessário para ativar o OmniRoute.",
      hint: "Instale Node.js (inclui npm) ou adicione npm/npx ao PATH.",
    }
  }

  const npmVersion = npmPath ? await commandVersion(deps, ["npm", "--version"]) : undefined
  const npxVersion = npxPath ? await commandVersion(deps, ["npx", "--version"]) : undefined
  const parts = [
    npmPath ? `npm ${npmVersion ?? "ok"}` : undefined,
    npxPath ? `npx ${npxVersion ?? "ok"}` : undefined,
  ].filter(Boolean)

  return {
    id: "npm",
    status: "pass",
    title: `${parts.join(", ")} detectado`,
  }
}

async function checkSsl(deps: DoctorDeps): Promise<CheckResult> {
  const extraCerts = deps.env.NODE_EXTRA_CA_CERTS
  const registry = await deps.fetchRegistry()

  if (registry.ok) {
    if (extraCerts) {
      return {
        id: "ssl",
        status: "pass",
        title: "Certificado SSL: registry.npmjs.org acessível",
        detail: `NODE_EXTRA_CA_CERTS=${extraCerts}`,
      }
    }
    return {
      id: "ssl",
      status: "pass",
      title: "Certificado SSL: registry.npmjs.org acessível",
    }
  }

  if (registry.certError) {
    if (extraCerts) {
      return {
        id: "ssl",
        status: "warn",
        title: "Certificado customizado detectado, mas não foi possível validar",
        detail: `NODE_EXTRA_CA_CERTS=${extraCerts}`,
        hint:
          "Se a instalação falhar com SELF_SIGNED_CERT_IN_CHAIN, confirme que NODE_EXTRA_CA_CERTS aponta para o certificado CA da sua empresa.",
      }
    }

    return {
      id: "ssl",
      status: "fail",
      title: "Certificado SSL: falha ao acessar registry.npmjs.org",
      detail: registry.message,
      hint:
        "Configure NODE_EXTRA_CA_CERTS apontando para o certificado CA corporativo (ex.: export NODE_EXTRA_CA_CERTS=/path/to/ca-cert.pem).",
    }
  }

  return {
    id: "ssl",
    status: "warn",
    title: "registry.npmjs.org não respondeu",
    detail: registry.message,
    hint: "Verifique proxy (HTTPS_PROXY) ou conectividade de rede antes de rodar bun install.",
  }
}

function checkFirewall(deps: DoctorDeps): CheckResult | undefined {
  if (deps.platform !== "win32") return
  return {
    id: "firewall",
    status: "info",
    title: "Firewall do Windows",
    detail:
      "Se a porta 4096 não responder depois de rodar o XOCP, verifique o Firewall do Windows Defender e permita o processo Bun/Node.",
  }
}

async function checkDisk(deps: DoctorDeps): Promise<CheckResult> {
  const freeBytes = await deps.freeDiskBytes()
  if (freeBytes === undefined) {
    return {
      id: "disk",
      status: "warn",
      title: "Espaço em disco: não foi possível verificar",
      hint: "Garanta pelo menos 5 GB livres — node_modules é grande.",
    }
  }

  const freeGb = freeBytes / (1024 ** 3)
  const freeLabel = formatBytes(freeBytes)
  if (freeGb < FAIL_FREE_DISK_GB) {
    return {
      id: "disk",
      status: "fail",
      title: `Espaço em disco: ${freeLabel} livres`,
      hint: "Libere espaço antes de rodar bun install (recomendado: 5 GB+).",
    }
  }

  if (freeGb < MIN_FREE_DISK_GB) {
    return {
      id: "disk",
      status: "warn",
      title: `Espaço em disco: ${freeLabel} livres`,
      hint: "Recomendamos 5 GB+ livres para instalar dependências com folga.",
    }
  }

  return {
    id: "disk",
    status: "pass",
    title: `Espaço em disco: ${freeLabel} livres`,
  }
}

export async function runDoctorChecks(deps: DoctorDeps) {
  const checks = await Promise.all([
    checkBun(deps),
    checkNode(deps),
    checkPython(deps),
    checkUv(deps),
    checkNpm(deps),
    checkSsl(deps),
    checkDisk(deps),
  ])

  const firewall = checkFirewall(deps)
  if (firewall) checks.push(firewall)

  return checks
}

export type FixWriter = (line: string) => void
export type FixConfirm = (prompt: string) => Promise<boolean>

export type ApplyDoctorFixesOptions = {
  confirm: FixConfirm
  write: FixWriter
  installUv?: (deps: DoctorDeps) => Promise<{ ok: boolean; message: string }>
}

function uvElevationNotice(platform: NodeJS.Platform) {
  if (platform === "win32") {
    return "O instalador oficial do uv normalmente não exige administrador; se o Windows pedir elevação, aceite manualmente — o doctor não tentará contornar."
  }
  return "O instalador oficial do uv normalmente não exige sudo; se o ambiente pedir elevação, confirme manualmente — o doctor não tentará contornar."
}

export async function installUv(deps: DoctorDeps) {
  const result =
    deps.platform === "win32"
      ? await deps.runCommand([
          "powershell",
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          "irm https://astral.sh/uv/install.ps1 | iex",
        ], { env: deps.env })
      : await deps.runCommand(["sh", "-lc", "curl -LsSf https://astral.sh/uv/install.sh | sh"], {
          env: deps.env,
        })

  const output = `${result.stdout}\n${result.stderr}`.trim()
  if (result.exitCode !== 0) {
    return {
      ok: false,
      message: output || `instalador saiu com código ${result.exitCode}`,
    }
  }

  const location = await findUvBinary(deps)
  if (!location) {
    return {
      ok: false,
      message: output
        ? `${output}\n\nuv não foi encontrado no PATH após a instalação.`
        : "uv não foi encontrado no PATH após a instalação.",
    }
  }

  const version = await commandVersion(deps, [location, "--version"])
  const inPath = location === await whichCommand(deps, "uv")
  if (inPath) {
    return {
      ok: true,
      message: version ? `${version} (${location})` : location,
    }
  }

  return {
    ok: true,
    message: version
      ? `${version} em ${location}, mas não está no PATH desta sessão — reinicie o terminal ou adicione o diretório ao PATH`
      : `instalado em ${location}, mas não está no PATH desta sessão — reinicie o terminal ou adicione o diretório ao PATH`,
  }
}

export async function applyDoctorFixes(
  checks: CheckResult[],
  deps: DoctorDeps,
  options: ApplyDoctorFixesOptions,
) {
  const failures = checks.filter((check) => check.status === "fail")
  const installUvFn = options.installUv ?? installUv
  const lines: string[] = []

  if (failures.length === 0) {
    options.write("")
    options.write("Nenhum item ❌ para corrigir.")
    return { lines, fixed: [] as string[] }
  }

  options.write("")
  options.write("XOCP Doctor — correções opcionais (--fix)")
  const fixed: string[] = []

  for (const check of failures) {
    if (check.id === "uv") {
      const command = uvInstallCommand(deps.platform)
      options.write("")
      options.write(`❌ ${check.title}`)
      options.write(`Comando que será executado:`)
      options.write(`  ${command}`)
      options.write(uvElevationNotice(deps.platform))
      const confirmed = await options.confirm("Instalar agora? (s/n)")
      if (!confirmed) {
        options.write("Instalação do uv cancelada.")
        lines.push("uv: cancelado pelo usuário")
        continue
      }

      options.write("Instalando uv...")
      const result = await installUvFn(deps)
      if (result.ok) {
        options.write(`✅ uv instalado com sucesso${result.message ? `: ${result.message}` : ""}`)
        fixed.push("uv")
        lines.push(`uv: sucesso (${result.message})`)
        continue
      }

      options.write(`❌ Falha ao instalar uv: ${result.message}`)
      lines.push(`uv: falha (${result.message})`)
      continue
    }

    if (!GUIDE_ONLY_FIX_IDS.has(check.id)) continue

    const url = officialDownloadUrl(check.id)
    options.write("")
    options.write(`❌ ${check.title}`)
    options.write("Instalação automática não disponível para este item.")
    if (url) options.write(`→ Baixe em: ${url}`)
    options.write("Reinstale manualmente e rode `bun run doctor` novamente.")
    lines.push(`${check.id}: orientação (${url ?? "sem URL"})`)
  }

  return { lines, fixed }
}

export function formatDoctorReport(checks: CheckResult[], platform = process.platform) {
  const icon = (status: CheckStatus) => {
    if (status === "pass") return "✅"
    if (status === "fail") return "❌"
    if (status === "warn") return "⚠️ "
    return "ℹ️ "
  }

  const lines = [`XOCP Doctor — verificando seu ambiente (${osLabel(platform)})`, ""]
  for (const check of checks) {
    lines.push(`${icon(check.status)} ${check.title}`)
    if (check.detail) lines.push(`   ${check.detail}`)
    if (check.hint) lines.push(`   → ${check.hint}`)
  }

  const problems = checks.filter((check) => check.status === "fail").length
  const warnings = checks.filter((check) => check.status === "warn").length
  lines.push("")
  if (problems === 0 && warnings === 0) {
    lines.push("Resumo: ambiente pronto. Você pode rodar `bun install`.")
  } else {
    const warningPart = warnings > 0 ? `, ${warnings} aviso${warnings === 1 ? "" : "s"}` : ""
    lines.push(
      `Resumo: ${problems} problema${problems === 1 ? "" : "s"} encontrado${problems === 1 ? "" : "s"}${warningPart}. Corrija os itens ❌ antes de rodar \`bun install\`.`,
    )
  }

  return { text: lines.join("\n"), problems, warnings }
}

export async function runDoctor(options?: { deps?: DoctorDeps; platform?: NodeJS.Platform }) {
  const deps = options?.deps ?? await loadDoctorDeps()
  const checks = await runDoctorChecks(deps)
  const report = formatDoctorReport(checks, options?.platform ?? deps.platform)
  return { checks, report, deps }
}

async function defaultConfirm(prompt: string) {
  const readline = await import("node:readline/promises")
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question(`${prompt} `)
  rl.close()
  return isAffirmative(answer)
}

if (import.meta.main) {
  const args = parseDoctorArgs()
  const { report, checks, deps } = await runDoctor()
  console.log(report.text)

  let finalChecks = checks
  if (args.fix) {
    await applyDoctorFixes(checks, deps, {
      confirm: defaultConfirm,
      write: (line) => console.log(line),
    })
    finalChecks = await runDoctorChecks(deps)
  }

  if (args.fix) {
    const problems = finalChecks.filter((check) => check.status === "fail").length
    const warnings = finalChecks.filter((check) => check.status === "warn").length
    if (problems > 0 || warnings > 0) {
      const warningPart = warnings > 0 ? `, ${warnings} aviso${warnings === 1 ? "" : "s"}` : ""
      console.log(
        `\nApós --fix: ${problems} problema${problems === 1 ? "" : "s"}${warningPart} restante${problems === 1 ? "" : "s"}.`,
      )
    } else {
      console.log("\nApós --fix: ambiente pronto.")
    }
  }

  const problems = finalChecks.filter((check) => check.status === "fail").length
  process.exit(problems > 0 ? 1 : 0)
}
