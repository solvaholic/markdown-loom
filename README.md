# markdown-loom

A VS Code extension (in progress) for plain-markdown note taking:

- Wiki-style links: `[[Note Name]]`
- Backlinks panel
- Obsidian Tasks compatible checkboxes, plus basic task querying

See [docs/SPEC.md](./docs/SPEC.md) for the full specification.

## MVP Feature 1: Wiki-Style Linking

- Autocomplete `[[` to list notes across all workspace folders.
- Ctrl/Cmd+Click to navigate to the target file (case-insensitive).
- Markdown preview renders `[[links]]` as clickable links.
- Clicking a link to a missing file prompts creation.
- Wiki links inside fenced code blocks are ignored.

## Devcontainer

This repo includes a VS Code devcontainer configuration so you can get a consistent Node.js environment quickly.

1. Install Docker + VS Code Dev Containers
2. Open this folder in VS Code
3. Run "Dev Containers: Reopen in Container"

## Status

MVP wiki-style linking is implemented; backlinks and tasks are next.
