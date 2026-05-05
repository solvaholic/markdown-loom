# markdown-loom

A VS Code extension for plain-markdown note taking. Wikilinks, backlinks, and
Obsidian-Tasks-compatible checkboxes - no proprietary formats, no databases,
just `.md` files.

See [docs/SPEC.md](./docs/SPEC.md) for the full specification.

## Status

Phase 1 (MVP):

- [x] Wiki-style linking (`[[Note]]`, `[[folder/Note]]`)
- [ ] Backlinks panel
- [ ] Basic task support (toggle + done date)

Phase 2 features (task queries, quick task entry) are planned after MVP.

## Features

### Wiki-style linking

- Type `[[` to autocomplete from all `.md` files across every workspace folder.
- Ctrl/Cmd+Click a `[[link]]` to jump to the target file (case-insensitive).
- The Markdown preview pane renders `[[links]]` as clickable links.
- Clicking a link to a file that doesn't exist offers to create it.
- Wikilink patterns inside fenced code blocks are ignored.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `markdownLoom.wikiLinkStyle` | `name` | How `[[` completion inserts links: `name`, `relative`, or `absolute`. |
| `markdownLoom.taskDateFormat` | `YYYY-MM-DD` | Date format used when stamping task dates. |
| `markdownLoom.queryLimitDefault` | `50` | Default maximum results for a `tasks` query block (Phase 2). |
| `markdownLoom.autoAddDoneDate` | `true` | Automatically append `✅ YYYY-MM-DD` when toggling a task done. |

## Keyboard shortcuts

Defaults; override via `Preferences: Open Keyboard Shortcuts`.

| Command | Default | When |
| --- | --- | --- |
| `Markdown Loom: Open Wiki Link` | `Ctrl`/`Cmd`+Click | On a `[[link]]` in a markdown file |

Task toggle keybinding lands with the task feature.

## Limitations

- Untitled (unsaved) buffers are not indexed for completion or backlinks.
- `[[link]]` resolution and backlink search use case-insensitive basename
  matching; if multiple notes share a basename, completion qualifies them
  with a `folder/` prefix.
- The extension activates only for the `markdown` language.

## Devcontainer

This repo includes a VS Code devcontainer for a consistent Node.js
environment.

1. Install Docker + the VS Code Dev Containers extension.
2. Open this folder in VS Code.
3. Run `Dev Containers: Reopen in Container`.

## Development

```sh
npm install
npm run lint
npm run compile
npm test
npm run package   # produces a .vsix
```

## License and attribution

Markdown Loom is released under the [MIT License](./LICENSE).

Task-line parsing logic is adapted from
[obsidian-tasks-group/obsidian-tasks](https://github.com/obsidian-tasks-group/obsidian-tasks)
(MIT). The required attribution is included in
[`LICENSES/obsidian-tasks.MIT.txt`](./LICENSES/obsidian-tasks.MIT.txt).
