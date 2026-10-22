import { execFileSync } from "node:child_process"
import { appendFileSync, readFileSync } from "node:fs"

interface ChangeEvent {
  before?: string
  after?: string
  pull_request?: { base?: { sha?: string }; head?: { sha?: string } }
}

function commit(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{40}$/u.test(value) && /[1-9a-f]/u.test(value)
}

function documentation(path: string): boolean {
  return ["README.md", "AGENTS.md", "CONTRIBUTING.md"].includes(path) ||
    /^(?:agents\/docs|docs)\/.+\.md$/u.test(path)
}

export function isDocumentationDiff(raw: string): boolean {
  // Raw, NUL-delimited records retain both file modes and unusual filenames.
  const records = raw.split("\0")
  if (records.pop() !== "" || records.length === 0 || records.length % 2 !== 0) return false
  for (let i = 0; i < records.length; i += 2) {
    const metadata = records[i] ?? ""
    const file = records[i + 1] ?? ""
    if (!/^:(100644|000000) (100644|000000) [0-9a-f]{40} [0-9a-f]{40} [AMD]$/u.test(metadata) ||
        !documentation(file)) return false
  }
  return true
}

export function classifyDocumentation(
  eventName: string,
  ref: string,
  event: ChangeEvent,
  cwd = process.cwd()
): boolean {
  const git = (...args: string[]) => execFileSync("git", args, {
    cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]
  })
  try {
    let base: string
    let head: string
    if (eventName === "pull_request") {
      const source = event.pull_request?.head?.sha
      const target = event.pull_request?.base?.sha
      if (!commit(source) || !commit(target)) return false
      head = source
      base = git("merge-base", target, source).trim()
      if (!commit(base)) return false
    } else if (eventName === "push" && ref === "refs/heads/main") {
      if (!commit(event.before) || !commit(event.after)) return false
      base = event.before
      head = event.after
    } else {
      return false
    }
    // Disabling rename detection ensures moving code into docs still checks its deletion.
    return isDocumentationDiff(git("diff", "--raw", "--no-abbrev", "--no-renames", "-z", base, head, "--"))
  } catch {
    return false
  }
}

if (import.meta.main) {
  let docsOnly = false
  try {
    const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH ?? "", "utf8")) as ChangeEvent
    docsOnly = classifyDocumentation(process.env.GITHUB_EVENT_NAME ?? "", process.env.GITHUB_REF ?? "", event)
  } catch {
    // Missing events and unavailable history never justify skipping validation.
  }
  console.log(docsOnly ? "Documentation change: static checks remain required." : "Running full CI.")
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `docs_only=${docsOnly}\n`)
}
