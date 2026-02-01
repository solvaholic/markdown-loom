# Copilot instructions for markdown-loom

## Source of truth

- Treat `docs/SPEC.md` as the source of truth for product requirements, acceptance criteria, parsing rules, and the intended folder layout.
- Before implementing or changing behavior, re-read the relevant parts of `docs/SPEC.md` and mirror its wording for edge cases (especially: fenced code blocks, multi-root workspaces, and task metadata preservation).

## Repo status

- This repo currently contains specification + dev environment scaffolding only; extension source code will be added later.

## Build, test, and lint

- There are no build/test/lint commands yet (no `package.json`). Do not invent scripts.
- Dev environment is expected to be VS Code + Dev Containers:
  - Open in VS Code, then run "Dev Containers: Reopen in Container".
  - Devcontainer image: `mcr.microsoft.com/devcontainers/typescript-node:1-22-bookworm`.

When build tooling is added, prefer standard VS Code extension tooling (npm scripts for lint/test/package) and keep commands documented in README.

## Existing tooling expectations (from scaffolding)

- Formatting: Prettier is configured as the default formatter and format-on-save is enabled in `.vscode/settings.json`.
- Linting: ESLint is expected (devcontainer sets `eslint.useFlatConfig: true`).
- Testing: VS Code Extension Test Runner is recommended (see `.vscode/extensions.json`).

## Licensing constraints

- `kortina/vscode-markdown-notes` (GPL-3.0) should be treated as reference-only: do not copy code.
- `obsidian-tasks-group/obsidian-tasks` (MIT) may be reused, but ensure the required MIT attribution is included alongside any copied code.
