# Continuous integration

deskfleet follows [Heron's CI structure](https://github.com/minori-live/heron/blob/main/agents/docs/ci.md):
one orchestrator, reusable Test and Build workflows, a shared setup action, and
a stable `Gate` result for branch protection.

## Workflow ownership

- `.github/workflows/ci.yml` handles pull requests, pushes to `main`, and manual
  runs. It classifies the changed files, calls Test and Build, and combines their
  results in `Gate`. Configure `Gate` under the `CI` workflow as the required
  status check in repository branch protection.
- `.github/workflows/test.yml` runs static checks once on Linux with
  `mise run ci:check:static`, plus Rust tests on Linux, macOS, and Windows with
  `mise run check:rust-tests`. It supports reusable calls and manual runs.
- `.github/workflows/build.yml` builds release artifacts using `mise run build`.
  Pull requests use a Linux x64 smoke build; main and manual runs use the full
  native platform matrix. Artifacts contain the server and native library. This
  workflow also supports reusable calls and manual runs.
- `.github/actions/setup-build/action.yml` provides locked mise installation and
  shared Rust compiler/dependency cache setup for both reusable workflows.

## Documentation-only changes

Static validation still runs for documentation changes. The independent native
test and build jobs can be skipped only when the complete change is ordinary
documentation under the classifier's explicit allowlist.

The classifier checks the PR merge-base-to-head diff or the entire main push's
before-to-after diff. Executable files, symlinks, skills, manifests, lockfiles,
tool configuration, and workflow changes require full validation. Empty or
unavailable diffs, malformed events, and classification errors also select the
full tier. Manual runs use full validation.

`Gate` requires successful classification and Test. A skipped Build is accepted
only for a positively classified documentation-only change. Failed, cancelled,
or unexpectedly skipped required work fails the gate.

## Toolchains and caches

CI installs tools with `mise install --locked` and uses locked Cargo dependencies.
Task definitions live in `mise.toml`; the workflows select tasks and execution
platforms instead of maintaining another set of validation commands.

Static and test jobs may restore the Cargo target cache. Build jobs use Cargo
download caches without restoring compiled targets. The setup action populates
download caches before saving them.

All jobs use a pinned sccache release and share its GitHub Actions cache namespace.
Main and tag runs can write that cache; pull requests and other branches read it.
A miss compiles normally. Dependency and tool caches follow the same producer
policy, with Cargo target caches saved from main only.

`mise run ci:report:sccache` reports cache hit, miss, write, and error counters.

## Local validation

```sh
mise install --locked
mise run check
mise run build
```

These commands validate the current host. Hosted runners provide the other
operating systems and native architectures in the build matrix.
