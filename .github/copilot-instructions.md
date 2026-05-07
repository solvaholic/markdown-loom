# Copilot instructions for markdown-loom

## Source of truth

- Treat `docs/SPEC.md` as the source of truth for product requirements, acceptance criteria, parsing rules, and the intended folder layout.
- Before implementing or changing behavior, re-read the relevant parts of `docs/SPEC.md` and mirror its wording for edge cases (especially: fenced code blocks, multi-root workspaces, and task metadata preservation).

## Repo layout

- `src/` - extension source (TypeScript). Compiled output goes to `dist/` (git-ignored).
- `src/test/suite/` - integration tests run by `@vscode/test-electron` via `.vscode-test.mjs`.
- `test-fixtures/` - committed multi-root fixture workspace (`rootA/`, `rootB/`, `markdown-loom.code-workspace`). `test-fixtures/rootA/perf-1000/` is generated and git-ignored.
- `docs/SPEC.md` - product spec; see "Source of truth" above.
- `LICENSES/` - third-party attributions (Obsidian Tasks MIT).

## Build, test, and lint

These scripts exist in `package.json`. Use them; don't invent new ones without discussion.

- `npm run compile` - tsc once.
- `npm run watch` - tsc watch mode.
- `npm run lint` - ESLint over `src/**/*.ts`.
- `npm test` - runs `pretest` (compile + lint) then VS Code integration tests.
- `npm run package` - builds the VSIX via `vsce`.

Dev env is VS Code + Dev Containers (`mcr.microsoft.com/devcontainers/typescript-node:1-22-bookworm`). Format-on-save uses Prettier (`.vscode/settings.json`); ESLint is in flat-config mode.

After non-trivial changes, run `npm test` and report the result. Don't claim "tests pass" without running them.

## Commit hygiene

These rules exist because fixture and workspace edits have silently ridden along with code commits in the past. Make changes legible.

- **No blanket staging.** Don't use `git add -A` or `git add .` when the working tree contains changes outside the scope you're working on. Stage explicit paths.
- **Inspect what's staged before committing.** Run `git status` and `git diff --stat --cached`. If anything unexpected appears (fixtures, `.vscode/`, generated files, package-lock churn unrelated to the task), surface it to the user before committing.
- **Treat `test-fixtures/**` as a reviewable surface.**
  - If a code change happens to touch fixtures, call it out in the plan and prefer a separate commit (e.g. `test(fixtures): ...`) unless the fixture change is the direct cause of the code/test change.
  - Never modify fixtures just to make a failing test pass. Fix the code or fix the test intent first.
- **One logical change per commit.** Test-infra commits (fixtures + test files + test config) can travel together; behavior changes should not silently include fixture edits.
- **Keep `.gitignore` and `.vscodeignore` honest.** If you generate new artifacts (perf data, snapshots, caches), ignore them in the same change that generates them.

## Licensing constraints

- `kortina/vscode-markdown-notes` (GPL-3.0) is reference-only - do not copy code.
- `obsidian-tasks-group/obsidian-tasks` (MIT) may be reused; preserve the MIT attribution in `LICENSES/` alongside any copied code.

## Releases

- See `docs/RELEASING.md` for the full checklist. Don't improvise the release
  flow from memory; follow the doc.
- Use `npm version <patch|minor|major>` to bump and tag in one step. Don't
  hand-edit `package.json` for version changes.
- `scripts/make-demo-gif.sh` is the canonical way to regenerate
  `docs/demo.gif` from `docs/demo.mov`. The MOV source is git-ignored.
- Before tagging a release, confirm repo visibility. If the repo is private,
  `raw.githubusercontent.com` URLs in README.md will 404 in the Marketplace
  listing and in unauthenticated release-notes views. v0.1.0 shipped with
  this exact bug.

## Lessons learned

- **Stale agent docs are a trap.** When repo scaffolding changes meaningfully (e.g., `package.json` lands, build commands are added), update this file in the same change. An out-of-date instructions file is worse than none.
- **Multi-root is the default test environment.** Tests open `test-fixtures/markdown-loom.code-workspace`, not a single folder. Resolution and backlink logic must handle multi-root tie-breaking; single-root assumptions will pass locally and fail under test.
