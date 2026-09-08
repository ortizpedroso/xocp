import path from "path"
import { which } from "../src/util/which"

process.env.OPENCODE_DB = ":memory:"
process.env.OPENCODE_MODELS_PATH = path.join(import.meta.dir, "plugin", "fixtures", "models-dev.json")
process.env.OPENCODE_DISABLE_MODELS_FETCH = "true"

// Captured before any test file gets a chance to mock.module("../../src/util/which", ...) —
// preload always runs first. Several test files (omniroute/headroom/graphify service
// tests) replace this module for the rest of the bun test process via mock.module,
// which Bun doesn't reliably undo (mock.restore() only covers mock()/spyOn(), not
// mock.module()). Tests that need the real implementation (util/which.test.ts) read
// this instead of importing the module directly, which could already be mocked by
// the time they run, depending on file load order.
;(globalThis as Record<string, unknown>).__opencodeRealWhich = which
