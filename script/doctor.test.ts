import { describe, expect, test } from "bun:test"
import {
  applyDoctorFixes,
  formatDoctorReport,
  isAffirmative,
  officialDownloadUrl,
  osLabel,
  parseDoctorArgs,
  parsePythonVersion,
  readRequiredBunVersion,
  runDoctorChecks,
  uvInstallCommand,
  type DoctorDeps,
} from "./doctor"

function makeDeps(overrides: Partial<DoctorDeps> = {}): DoctorDeps {
  return {
    platform: "linux",
    bunVersion: "1.3.14",
    nodeVersion: "22.14.0",
    requiredBunVersion: "1.3.14",
    requiredNodeVersion: "22.0.0",
    env: {},
    cwd: "/workspace",
    runCommand: async () => ({ exitCode: 1, stdout: "", stderr: "" }),
    fetchRegistry: async () => ({ ok: true, certError: false }),
    freeDiskBytes: async () => 10 * 1024 ** 3,
    ...overrides,
  }
}

describe("doctor helpers", () => {
  test("maps platform labels", () => {
    expect(osLabel("win32")).toBe("Windows")
    expect(osLabel("darwin")).toBe("macOS")
    expect(osLabel("linux")).toBe("Linux")
  })

  test("reads required bun version from packageManager", () => {
    expect(readRequiredBunVersion("bun@1.3.14")).toBe("1.3.14")
    expect(readRequiredBunVersion("invalid")).toBe("1.3.14")
  })

  test("parses python versions from command output", () => {
    expect(parsePythonVersion("Python 3.12.3")).toBe("3.12.3")
    expect(parsePythonVersion("Python 3.6.8")).toBe("3.6.8")
  })

  test("returns OS-specific uv install commands", () => {
    expect(uvInstallCommand("win32")).toContain("install.ps1")
    expect(uvInstallCommand("darwin")).toContain("install.sh")
  })

  test("parses --fix from argv", () => {
    expect(parseDoctorArgs(["--fix"])).toEqual({ fix: true })
    expect(parseDoctorArgs([])).toEqual({ fix: false })
    expect(parseDoctorArgs(["doctor", "--fix"])).toEqual({ fix: true })
  })

  test("recognizes affirmative answers", () => {
    expect(isAffirmative("s")).toBe(true)
    expect(isAffirmative("sim")).toBe(true)
    expect(isAffirmative("n")).toBe(false)
    expect(isAffirmative("não")).toBe(false)
  })

  test("maps official download urls", () => {
    expect(officialDownloadUrl("python")).toBe("https://python.org")
    expect(officialDownloadUrl("bun")).toBe("https://bun.sh")
  })
})

describe("doctor report formatting", () => {
  test("formats Windows-style output with summary counts", () => {
    const report = formatDoctorReport(
      [
        { id: "bun", status: "pass", title: "Bun 1.4.0 detectado" },
        { id: "node", status: "pass", title: "Node.js 20.x detectado" },
        {
          id: "python",
          status: "fail",
          title: "Python: nenhuma instalação funcional encontrada",
          hint: "Instale Python 3.11+ de https://python.org e reinicie o terminal",
        },
        { id: "uv", status: "pass", title: "uv detectado (0.4.x)" },
        {
          id: "npm",
          status: "fail",
          title: "npm/npx: não encontrado",
          hint: "Necessário pra ativar o OmniRoute. Instale Node.js (inclui npm).",
        },
        {
          id: "ssl",
          status: "warn",
          title: "Certificado customizado detectado, mas não foi possível validar",
          hint: "Se a instalação falhar com SELF_SIGNED_CERT_IN_CHAIN, configure NODE_EXTRA_CA_CERTS",
        },
      ],
      "win32",
    )

    expect(report.text).toContain("XOCP Doctor — verificando seu ambiente (Windows)")
    expect(report.text).toContain("✅ Bun 1.4.0 detectado")
    expect(report.text).toContain("❌ Python: nenhuma instalação funcional encontrada")
    expect(report.text).toContain("⚠️  Certificado customizado detectado")
    expect(report.problems).toBe(2)
    expect(report.warnings).toBe(1)
    expect(report.text).toContain("Resumo: 2 problemas encontrados, 1 aviso")
  })

  test("formats macOS success summary", () => {
    const report = formatDoctorReport(
      [{ id: "bun", status: "pass", title: "Bun 1.3.14 detectado" }],
      "darwin",
    )

    expect(report.text).toContain("macOS")
    expect(report.text).toContain("ambiente pronto")
    expect(report.problems).toBe(0)
  })
})

describe("doctor checks", () => {
  test("fails when bun is below the required version", async () => {
    const checks = await runDoctorChecks(makeDeps({ bunVersion: "1.2.0" }))
    expect(checks.find((check) => check.id === "bun")?.status).toBe("fail")
  })

  test("detects functional python3 on macOS", async () => {
    const checks = await runDoctorChecks(
      makeDeps({
        platform: "darwin",
        runCommand: async (cmd) => {
          if (cmd.join(" ") === "python3 --version") {
            return { exitCode: 0, stdout: "Python 3.12.1\n", stderr: "" }
          }
          return { exitCode: 1, stdout: "", stderr: "" }
        },
      }),
    )
    expect(checks.find((check) => check.id === "python")?.status).toBe("pass")
  })

  test("tries common Windows python executables", async () => {
    const seen: string[] = []
    const checks = await runDoctorChecks(
      makeDeps({
        platform: "win32",
        env: {
          LOCALAPPDATA: "C:\\Users\\dev\\AppData\\Local",
          ProgramFiles: "C:\\Program Files",
        },
        runCommand: async (cmd) => {
          seen.push(cmd.join(" "))
          if (cmd.at(-1) === "--version" && cmd[0]?.endsWith("Python312\\python.exe")) {
            return { exitCode: 0, stdout: "Python 3.12.0\n", stderr: "" }
          }
          return { exitCode: 1, stdout: "", stderr: "" }
        },
      }),
    )

    expect(seen.some((cmd) => /Python312[\\/]python\.exe/.test(cmd))).toBe(true)
    expect(checks.find((check) => check.id === "python")?.status).toBe("pass")
  })

  test("reports missing uv with install hint", async () => {
    const checks = await runDoctorChecks(
      makeDeps({
        platform: "win32",
        runCommand: async (cmd) => {
          if (cmd[0] === "where") return { exitCode: 1, stdout: "", stderr: "" }
          return { exitCode: 1, stdout: "", stderr: "" }
        },
      }),
    )
    const uv = checks.find((check) => check.id === "uv")
    expect(uv?.status).toBe("fail")
    expect(uv?.hint).toContain("install.ps1")
  })

  test("warns on ssl when custom cert is configured but registry fails", async () => {
    const checks = await runDoctorChecks(
      makeDeps({
        env: { NODE_EXTRA_CA_CERTS: "/etc/ssl/corp.pem" },
        fetchRegistry: async () => ({
          ok: false,
          certError: true,
          message: "SELF_SIGNED_CERT_IN_CHAIN",
        }),
      }),
    )
    expect(checks.find((check) => check.id === "ssl")?.status).toBe("warn")
  })

  test("adds Windows firewall guidance", async () => {
    const checks = await runDoctorChecks(makeDeps({ platform: "win32" }))
    expect(checks.find((check) => check.id === "firewall")?.status).toBe("info")
  })

  test("skips firewall guidance on macOS", async () => {
    const checks = await runDoctorChecks(makeDeps({ platform: "darwin" }))
    expect(checks.find((check) => check.id === "firewall")).toBeUndefined()
  })
})

describe("doctor --fix", () => {
  test("installs uv when user confirms", async () => {
    const writes: string[] = []
    let installCalled = false
    const checks = [
      {
        id: "uv",
        status: "fail" as const,
        title: "uv: não encontrado",
      },
    ]

    const result = await applyDoctorFixes(checks, makeDeps(), {
      confirm: async () => true,
      write: (line) => writes.push(line),
      installUv: async () => {
        installCalled = true
        return { ok: true, message: "uv 0.9.5" }
      },
    })

    expect(installCalled).toBe(true)
    expect(writes.some((line) => line.includes("Comando que será executado"))).toBe(true)
    expect(writes.some((line) => line.includes("Instalando uv..."))).toBe(true)
    expect(writes.some((line) => line.includes("✅ uv instalado com sucesso"))).toBe(true)
    expect(result.fixed).toEqual(["uv"])
  })

  test("skips uv install when user declines", async () => {
    const writes: string[] = []
    let installCalled = false
    const checks = [
      {
        id: "uv",
        status: "fail" as const,
        title: "uv: não encontrado",
      },
    ]

    await applyDoctorFixes(checks, makeDeps(), {
      confirm: async () => false,
      write: (line) => writes.push(line),
      installUv: async () => {
        installCalled = true
        return { ok: true, message: "uv 0.9.5" }
      },
    })

    expect(installCalled).toBe(false)
    expect(writes.some((line) => line.includes("cancelada"))).toBe(true)
  })

  test("shows python download url without installing", async () => {
    const writes: string[] = []
    let installCalled = false
    const checks = [
      {
        id: "python",
        status: "fail" as const,
        title: "Python: nenhuma instalação funcional encontrada",
      },
    ]

    await applyDoctorFixes(checks, makeDeps(), {
      confirm: async () => true,
      write: (line) => writes.push(line),
      installUv: async () => {
        installCalled = true
        return { ok: true, message: "should not run" }
      },
    })

    expect(installCalled).toBe(false)
    expect(writes.some((line) => line.includes("https://python.org"))).toBe(true)
    expect(writes.some((line) => line.includes("Instalação automática não disponível"))).toBe(true)
  })

  test("never auto-installs bun, node, or npm even with confirmation", async () => {
    const writes: string[] = []
    let installCalled = false
    const checks = [
      { id: "bun", status: "fail" as const, title: "Bun: versão não detectada" },
      { id: "node", status: "fail" as const, title: "Node.js: não encontrado" },
      { id: "npm", status: "fail" as const, title: "npm/npx: não encontrado" },
    ]

    await applyDoctorFixes(checks, makeDeps(), {
      confirm: async () => true,
      write: (line) => writes.push(line),
      installUv: async () => {
        installCalled = true
        return { ok: true, message: "should not run" }
      },
    })

    expect(installCalled).toBe(false)
    expect(writes.some((line) => line.includes("https://bun.sh"))).toBe(true)
    expect(writes.some((line) => line.includes("https://nodejs.org"))).toBe(true)
    expect(writes.filter((line) => line.includes("Instalação automática não disponível")).length).toBe(3)
  })
})
