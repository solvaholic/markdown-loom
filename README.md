# markdown-loom

A VS Code extension for plain-markdown note taking. Wiki-style linking
and backlinks across a folder of `.md` files - no proprietary formats,
no sidecar databases, just markdown.

See [docs/SPEC.md](./docs/SPEC.md) for the full specification and
[docs/comparisons.md](./docs/comparisons.md) for how it relates to
other VS Code note-taking extensions.

![demo](docs/demo.gif)

## Status

Shipped:

- [x] Wiki-style linking (`[[Note]]`, `[[Note|Alias]]`)
- [x] Backlinks panel
- [x] Task toggle with auto-stamped done date (frozen, see below)
- [x] Section references (`[[Note#Heading]]`) in editor and preview
- [x] Block references (`[[Note#^blockid]]`) in editor and preview
- [x] Link rewrite on file rename (via VS Code's rename hook)
- [x] Wikilinks to non-markdown files (`[[Some File.pdf]]`)
- [x] Configurable click-to-create behavior (prompt / auto / never)
- [x] Configurable new-note location
- [x] Paste a file to copy it in and insert a wikilink

Planned (in priority order):

- [ ] Drag-and-drop file insertion (deferred; see issue #23 Phase 2)

The Phase 2 task query DSL and "Create task" command previously listed
here are **out of scope**. See [Tasks (frozen)](#tasks-frozen) below.

## Features

### Wiki-style linking

- Type `[[` to autocomplete from all `.md` files in your workspace
  (every folder, if you use a multi-root workspace).
- Ctrl/Cmd+Click a `[[link]]` to jump to the target file (case-insensitive
  basename match).
- Use `[[Note|Alias]]` to render `Alias` as the link text while still
  resolving to `Note.md`.
- The Markdown preview pane renders `[[links]]` as clickable links.
- Clicking a link to a file that doesn't exist offers to create it.
- Wikilink patterns inside fenced code blocks are ignored.
- Path-style targets like `[[folder/Note]]` or `[[./Note]]` are not
  wikilinks; use a plain markdown link `[label](./folder/Note.md)` when
  you need to point at a specific path. See `docs/SPEC.md` 'Wikilink
  target syntax' for the full rules.

### Paste a file as an attachment

- Copy a file in Finder (or the VS Code Explorer), then paste (`Cmd/Ctrl+V`)
  into a markdown editor. The file is copied into your workspace and a
  `[[basename.ext]]` wikilink is inserted at the cursor.
- The copy destination is the same one click-to-create uses -
  `markdownLoom.newFileLocation` (and `markdownLoom.newFileCustomPath`).
  There's no separate attachments-folder setting.
- Collisions are never overwritten: `report.pdf` becomes `report-1.pdf`,
  `report-2.pdf`, and so on, and the wikilink points at the suffixed name.
  Pasting a file that already lives at the destination links to it without
  making a duplicate.
- Paste several files at once and you get one wikilink per line.
- VS Code shows a small paste chooser when more than one paste action
  applies (for example, its built-in "Insert Image" for an image). Pick
  **Insert wikilink (Markdown Loom)** once via *Configure preferred paste
  action...* to make it the default.
- Turn the whole behavior off with `markdownLoom.attachments.paste.enabled`.

### Backlinks panel

- Open the **Backlinks** view in the Explorer to see notes that link to
  the active markdown file, grouped by source file with line previews.
- The panel refreshes when you switch files or save changes.
- **Filename collisions surface here.** When a bare `[[Foo]]` matches
  multiple notes (e.g., two `Foo.md` files in different folders or
  workspace roots), navigation picks one winner via the same-folder
  tiebreaker, but the link registers as a backlink on *every*
  candidate. Non-winner entries are flagged "ambiguous" with a ⚠ icon
  so you can spot and resolve the collision (rename, move, or live
  with the warning - see `docs/SPEC.md` 'Wikilink target syntax').

### Find unresolved wikilinks

- Run **Markdown Loom: Show Unresolved Wikilinks** from the Command
  Palette to list every `[[link]]` whose target no longer exists.
- Handy after renaming or moving notes, when once-valid links quietly
  rot.
- Pick an entry to jump straight to the link in its source file. When
  everything resolves, you get a friendly "All wikilinks resolve."
  message. It's a one-shot snapshot - run it again after edits to
  refresh.

### Inspect the index

- Run **Markdown Loom: Show Index Status** from the Command Palette to
  check how many notes are indexed, along with a small sample of indexed
  paths - a quick sanity check when completion or backlinks look stale.
- The sample size is configurable via
  `markdownLoom.indexStatusSampleSize`.

### Tasks (frozen)

Markdown Loom ships a small Obsidian-Tasks-compatible toggle command
that predates the current direction. **This area is frozen**: the
existing behavior keeps working, but no new task features are planned.
For richer task workflows, use [Obsidian](https://obsidian.md) on the
same `.md` files, or watch
[`sugitlab/vstasks`](https://github.com/sugitlab/vstasks) once it
matures.

What still works:

- Place the cursor on a list item and press `Ctrl`+`Alt`+`T`
  (`Cmd`+`Alt`+`T` on macOS) to toggle the checkbox between `[ ]` and
  `[x]`.
- Completing a task auto-appends `✅ YYYY-MM-DD` (configurable via
  `markdownLoom.autoAddDoneDate`).
- All other emoji metadata (⏳, 📅, 🔁, ⏫, 🔼, 🔽) and `#tags` are
  preserved exactly when toggling.

## Recommended companions

Markdown Loom focuses narrowly on wikilinks and backlinks. For
general markdown editing ergonomics, install **Markdown All in One**
([`yzhang.markdown-all-in-one`](https://marketplace.visualstudio.com/items?itemName=yzhang.markdown-all-in-one),
MIT) alongside it. It provides:

- List continuation on Enter
- Tab indent / Shift+Tab outdent inside lists
- Toggle bold / italic / strikethrough
- Table of contents generation
- GFM checkbox toggle (`Alt`+`C`)

The two extensions coexist cleanly. Markdown Loom does not bundle or
require Markdown All in One - it's a recommendation, not a
dependency.

### Task toggle: pick one

Both extensions can toggle GFM checkboxes, and they behave differently:

- **Markdown Loom** (`Ctrl`/`Cmd`+`Alt`+`T`) flips `[ ]`/`[x]` and
  also stamps/strips `✅ YYYY-MM-DD` (when `autoAddDoneDate` is on),
  preserving other Obsidian-Tasks emoji and `#tags`.
- **Markdown All in One** (`Alt`+`C`, Windows/Linux only) does a plain
  flip with no done-date awareness.

So checking with `Alt`+`C` won't add the `✅` date, and unchecking a
Loom-completed task with `Alt`+`C` leaves the `✅` date behind. If you
want one consistent behavior, use Markdown Loom's toggle for tasks (or
remap `Alt`+`C` to `markdownLoom.toggleTask` in your keybindings).

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `markdownLoom.wikiLinkStyle` | `name` | Reserved for future use. `[[` completion always inserts the note basename. |
| `markdownLoom.taskDateFormat` | `YYYY-MM-DD` | Date format for the auto-stamped done date on the (frozen) task toggle. |
| `markdownLoom.autoAddDoneDate` | `true` | Automatically append `✅ YYYY-MM-DD` when toggling a task done. |
| `markdownLoom.attachmentExtensions` | `["pdf","png","jpg","jpeg","gif","svg","webp","mp4","mov","webm","mp3","m4a","wav"]` | File extensions (without leading dot) indexed for non-`.md` wikilink resolution. `[[diagram.png]]` resolves to any workspace file named `diagram.png`. Changing this setting triggers an index rebuild. |
| `markdownLoom.createMissingNoteOnClick` | `prompt` | Behavior when clicking a `[[wikilink]]` to a missing note: `prompt` (ask before creating), `auto` (create silently and open), or `never` (do nothing). Non-`.md` wikilinks are never auto-created. |
| `markdownLoom.newFileLocation` | `workspaceRoot` | Where click-to-create writes a new file: `workspaceRoot` (workspace folder root of the source note, default), `sameFolderAsActive` (next to the file containing the clicked link; falls back to the workspace root for untitled buffers), or `customPath` (use `markdownLoom.newFileCustomPath`). In a multi-root workspace the destination is resolved against the source note's workspace folder. |
| `markdownLoom.newFileCustomPath` | `""` | Workspace-relative directory used when `markdownLoom.newFileLocation` is `customPath`. Intermediate folders are created as needed. Absolute paths or paths that escape the workspace folder fall back to the workspace folder root. |
| `markdownLoom.attachments.paste.enabled` | `true` | Insert a `[[wikilink]]` when pasting files into a markdown editor. Each pasted file is copied into the folder resolved from `markdownLoom.newFileLocation` and a `[[basename.ext]]` wikilink is inserted at the cursor. Set to `false` to use VS Code's default paste behavior for files. |
| `markdownLoom.indexStatusSampleSize` | `10` | Number of indexed note paths shown as a sample in the **Show Index Status** command output. |

## Keyboard shortcuts

Defaults; override via `Preferences: Open Keyboard Shortcuts`.

| Command | Default | When |
| --- | --- | --- |
| `Markdown Loom: Open Wiki Link` | `Ctrl`/`Cmd`+Click | On a `[[link]]` in a markdown file |
| `Markdown Loom: Toggle Task` | `Ctrl`+`Alt`+`T` / `Cmd`+`Alt`+`T` | In a markdown file |

Toggling a task to done appends `✅ YYYY-MM-DD` (today) to the line if
`markdownLoom.autoAddDoneDate` is true. Toggling back to open removes
that auto-stamped done date and leaves any other emoji or tags alone.

## Limitations

- Untitled (unsaved) buffers are not indexed for completion or backlinks.
- `[[link]]` resolution and backlink search use case-insensitive basename
  matching only; if multiple notes share a basename, navigation picks one
  via the same-folder tiebreaker and the others surface as ambiguous
  backlinks.
- The extension activates only for the `markdown` language.
- **Click-to-create works in the editor only.** Ctrl/Cmd+clicking a
  `[[wikilink]]` to a missing note in the markdown source honors
  `markdownLoom.createMissingNoteOnClick` and
  `markdownLoom.newFileLocation`. In the markdown **preview**, clicks on
  unresolved wikilinks are inert (no-op): VS Code's preview routes link
  clicks through its own built-in handler, which has no extension hook
  for missing-file behavior, so we render the anchor without a navigable
  href instead of letting VS Code show its "File doesn't exist. Create?"
  dialog (which would ignore both settings). Click the wikilink in the
  editor pane to create the note.

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
