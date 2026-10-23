import { builtinModules } from "node:module"

// The main and preload bundles externalize the same Node built-ins.
export const nodeBuiltins = [...builtinModules, ...builtinModules.map((name) => `node:${name}`)]
