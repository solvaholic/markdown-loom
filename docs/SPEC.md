# Markdown Loom Specification

## Project Overview

Markdown Loom is a VS Code extension for plain-markdown note taking. It
focuses on **wiki-style linking and backlinks** across a folder of `.md`
files. The intended user keeps notes in plain markdown (often Obsidian
compatible), syncs them however they prefer (iCloud, Syncthing, git),
and wants `[[wikilink]]` ergonomics in VS Code without adopting a new
schema, hierarchy convention, or sidecar database.

The extension also ships a small Obsidian-Tasks-compatible toggle
command (`- [ ]` / `- [x]` with optional auto-stamped done date) that
predates the current direction. That code is **frozen**: it keeps
working, but new task features are out of scope here. See
[Tasks (frozen)](#tasks-frozen) for the rationale and pointers.

## Core Principles

- **Plain text first** - The `.md` files are the only source of truth.
  Delete the extension and your notes are intact, unmangled, and
  readable in any editor.
- **No proprietary persistent sidecar** - Markdown Loom does not write
  a `.markdownloom/` cache, a SQLite database, or any other persistent
  store you have to migrate or back up separately. The in-memory note
  index is rebuilt from the `.md` files at startup and on change. (See
  ["No databases"](#no-databases).)
- **Minimal dependencies** - Lightweight and fast.
- **Unix philosophy** - Do a few things well; let other tools handle
  the rest. For markdown editing ergonomics (list continuation, tab
  indent/outdent, format toggles), recommend Markdown All in One
  rather than reimplementing them.

### "No databases"

The project's "no databases" principle means **no proprietary
persistent sidecar store**. It does **not** mean "no in-memory index" -
that would make completion and backlinks unworkable at any reasonable
scale. Specifically:

- The `.md` files on disk are the only durable state. Removing the
  extension leaves a folder of plain markdown.
- The in-memory `NoteIndex` (basename map, source-link map, backlink
  map) is rebuilt from the files; it is ephemeral.
- A persistent on-disk cache may be revisited only if performance
  forces it. The current rebuild for 1000+ notes stays well inside the
  perf budget below; cache invalidation bugs are a worse failure mode
  than a fast cold start.

## User Stories

### As someone keeping notes in a folder of `.md` files:

1. **I want to link between notes** using `[[wikilinks]]` so I can
   build a connected knowledge graph without a separate tool.
2. **I want to see backlinks** to the current note so I can understand
   how ideas connect.
3. **I want to link to a section of a note** with `[[Note#Heading]]`
   and have the link scroll there in editor and preview.
4. **I want renaming a note to update inbound links** so my graph
   doesn't rot when I rename files in the VS Code Explorer.

### Example workflow

Open VS Code on a local notes folder, e.g. `~/notes/` with PARA-style
subfolders (`projects/`, `areas/`, `resources/`, `archive/`).

- Type `[[API` and see suggestions from anywhere in the folder.
- Click any link to jump straight to the target note.
- Rename `API Design Doc.md` to `API Plan.md` from the Explorer; every
  `[[API Design Doc]]` becomes `[[API Plan]]` in one undoable step.
- Open a `[[Project Notes#Decisions]]` link and land on that heading
  in either source or preview.

Multi-root workspaces also work, treated as additional top-level
folders. Single-folder is the design center; multi-root is a
side-effect of indexing the whole workspace.

## Features

### 1. Wiki-style linking (shipped)

- **Pattern**: `[[Note Name]]` or `[[Note Name|Alias]]` (see
  ["Wikilink target syntax"](#wikilink-target-syntax)).
- **Autocomplete**: When the user types `[[`, suggest all `.md` files
  in the workspace by basename.
- **Navigation**: Ctrl/Cmd+Click opens the linked file in source mode.
- **Preview rendering**: In markdown preview, `[[links]]` render as
  clickable links.
- **File creation**: Clicking a link to a non-existent file prompts to
  create it.
- **Acceptance**: Case-insensitive basename lookup; works across
  multi-root workspaces; ignores wikilink patterns inside fenced code
  blocks; aliases render as the display text without affecting
  resolution.

#### Wikilink target syntax

A wikilink target is a note name (matched against `.md` basenames),
optionally followed by a section reference and/or an alias for
display.

Legal forms (current):

- `[[Note Name]]` - link to `Note Name.md`.
- `[[Note Name|Stacey]]` - link to `Note Name.md`, rendered as
  `Stacey`.

Legal forms (planned, see [Roadmap](#roadmap)):

- `[[Note Name#Heading]]` - link to a heading inside `Note Name.md`.
- `[[Note Name#Heading|Stacey]]` - same, with display alias.
- `[[Note Name#^blockid]]` - link to an Obsidian-style block
  reference. Phase B.

Not legal (treated as plain text, not as wikilinks):

- Path-prefixed: `[[folder/Note]]`, `[[rootB/Foo]]`.
- Relative paths: `[[./Note]]`, `[[../Note]]`. Use plain markdown
  links (`[label](./path/to/Note.md)`) when you need to point at a
  specific path.

Resolution rules:

- A target resolves by case-insensitive basename match against indexed
  notes.
- If multiple notes share a basename, the resolver prefers the
  candidate in the source file's workspace folder (same-folder
  tiebreaker), then falls back to the first match.
- Backlinks surface filename collisions: a bare `[[Foo]]` registers as
  a backlink on every `Foo.md` candidate, with non-winners flagged
  ambiguous.
- Users handle name collisions however they prefer (rename, move, or
  live with the ambiguity warning); the spec does not dictate a
  scheme.

### 2. Backlinks panel (shipped)

- Show all files that link **to** the current file.
- Update dynamically when switching files.
- Display as a tree view in the Explorer sidebar.
- **Acceptance**: Refreshes within 300 ms after file save or switch;
  displays count label ("Referenced in N notes"); ignores matches
  inside fenced code blocks; shows ambiguous (non-winner) backlinks
  with a warning marker.

### 3. Tasks (frozen)

The current build ships an Obsidian-Tasks-compatible toggle command:

- **Pattern**: `- [ ] Task text ⏳ 2026-02-15 🔁 every week #tag`
- **Recognized emoji** (parsing only): ⏳ scheduled, 📅 due, 🔁
  recurrence, ⏫🔼🔽 priority, ✅ done date.
- **Toggle**: hotkey changes `[ ]` to `[x]` and back.
- **Done date**: when toggling done, append `✅ YYYY-MM-DD` (today)
  unless one is already present; toggling back removes the
  auto-stamped date and leaves all other emoji and tags alone.
- **Parsing rules**: trailing text (emoji, tags) is preserved exactly;
  date format is ISO 8601 (`YYYY-MM-DD`); tasks inside fenced code
  blocks are ignored.

This area is **frozen**. No new task features are planned in Markdown
Loom. The previously-planned Phase 2 work (a `tasks` query DSL with
filters like `due before tomorrow`, and a "Create task" command) is
out of scope here. For richer task workflows:

- Use **Obsidian** on the same `.md` files (the toggle output
  round-trips).
- Watch **`sugitlab/vstasks`**: it covers the task half (parser,
  query language, preview rendering). Once it matures (working
  source link, English docs, more than one contributor), it is the
  recommended pairing.

The existing settings (`markdownLoom.taskDateFormat`,
`markdownLoom.autoAddDoneDate`) remain so 0.2.0 users are not broken.

## Roadmap

In priority order:

### Section references (Phase A: headings)

Support `[[Note Name#Heading]]` and `[[Note Name#Heading|Alias]]`.

- **Editor**: `DefinitionProvider` resolves to a `Location` whose
  range starts at the matched heading line in the target file.
- **Preview**: the existing markdown-it `link_open` rule that rewrites
  `[[Foo]]` extends to emit `href="<resolved>.md#<slug>"` (with
  matching `data-href` so VS Code's preview navigation works). VS
  Code's preview natively scrolls to fragment IDs.
- **Heading slug**: choose between GitHub's slugger and VS Code
  preview's at implementation time; document the decision.
- **Acceptance**: clicking a section link in the editor opens the
  target file with the cursor on the heading; clicking in the preview
  scrolls to the heading; missing headings still navigate to the file
  (no hard error); section refs inside fenced code blocks are
  ignored.

### Link rewrite on file rename

Use `vscode.workspace.onWillRenameFiles` to return a `WorkspaceEdit`
that updates inbound `[[OldName]]` references to `[[NewName]]`
atomically with the rename. Single undo step undoes both.

- **Scope**: renames VS Code knows about - Explorer drag, F2 rename,
  refactor commands. Terminal `mv`, Finder rename, and out-of-editor
  git operations fall through to the file watcher's delete + create
  path and surface as broken backlinks. No "guess the rename"
  heuristic - that path is a footgun.
- **Acceptance**: renaming `Foo.md` to `Bar.md` from VS Code rewrites
  every `[[Foo]]` (case-insensitive match) to `[[Bar]]` across the
  workspace in a single undoable step; renames of non-markdown files
  are ignored; aliases (`[[Foo|Stacey]]`) are preserved as
  `[[Bar|Stacey]]`.

### Section references (Phase B: block IDs)

Support `[[Note Name#^blockid]]`. Requires injecting anchor markup at
the referenced block in preview, and indexing block IDs alongside the
note text. Lower priority than Phase A and rename.

### Recommended companion extensions

Markdown Loom should not reimplement markdown editing ergonomics that
**Markdown All in One** (`yzhang.markdown-all-in-one`, MIT) already
covers well: list continuation, tab indent/outdent in lists, toggle
bold/italic, table of contents, GFM checkbox toggle.

- **Recommendation mechanism**: declare an `extensionPack` or
  `extensionRecommendations` contribution; document the pairing in
  the README.
- **Do not** declare `extensionDependencies` (would force install).
- May ship `configurationDefaults` for sensible markdown defaults
  if doing so doesn't override user choices.

## Technical Architecture

### File structure

```
markdown-loom/
├── src/
│   ├── extension.ts           // Main entry point
│   ├── index/
│   │   └── noteIndex.ts       // In-memory note + backlink index
│   ├── providers/
│   │   ├── linkProvider.ts    // Wikilink completion & navigation
│   │   ├── linkParsing.ts     // Wikilink target parsing
│   │   └── backlinksProvider.ts
│   ├── tasks/                 // Frozen; toggle + parser
│   ├── commands/
│   ├── status/
│   └── test/
├── LICENSE                    // MIT
├── LICENSES/
│   └── obsidian-tasks.MIT.txt // Attribution for adapted task code
└── package.json
```

### Key VS Code APIs

- `vscode.languages.registerCompletionItemProvider` - autocomplete
- `vscode.languages.registerDefinitionProvider` - go to definition
  (file and, for Phase A, heading line)
- `vscode.window.createTreeView` - backlinks panel
- `vscode.workspace.findFiles` - initial index build
- `vscode.workspace.createFileSystemWatcher` - incremental index updates
- `vscode.workspace.onWillRenameFiles` - return a `WorkspaceEdit` to
  rewrite inbound links atomically with the rename (planned)
- `markdown.markdownItPlugins` extension point - render `[[links]]`
  (and section refs) in preview

### Configuration schema

```json
{
  "markdownLoom.wikiLinkStyle": {
    "type": "string",
    "enum": ["name"],
    "default": "name",
    "description": "Reserved for future use. Currently `[[` completion always inserts the note basename."
  },
  "markdownLoom.taskDateFormat": {
    "type": "string",
    "default": "YYYY-MM-DD",
    "description": "Date format for the auto-stamped done date on the (frozen) task toggle."
  },
  "markdownLoom.autoAddDoneDate": {
    "type": "boolean",
    "default": true,
    "description": "Automatically add a done date when toggling a task to done."
  }
}
```

`markdownLoom.queryLimitDefault` is **deprecated** and will be removed
in a future release: the Phase 2 task query work that motivated it is
no longer planned.

## Success criteria

- User can navigate between notes using `[[links]]` with zero config.
- Section references (`[[Note#Heading]]`) scroll to the heading in
  both editor and preview (Phase A).
- Renaming a note in the VS Code Explorer updates inbound `[[links]]`
  in a single undoable step.
- Extension activates only for markdown files.
- Performance: autocomplete responds in &lt;100 ms for vaults with 1000+
  notes.
- Backlinks refresh within 300 ms of save or file switch.
- Removing the extension leaves the folder of `.md` files unchanged.

## Testing & tooling expectations

- Unit tests: link resolution (case-insensitive, duplicate handling,
  section refs once landed), backlinks refresh, rename-rewrite,
  task parser/toggler (regression only - the area is frozen).
- Fixtures: a workspace fixture with two roots and >1000 fake notes
  for perf smoke. Multi-root stays in tests as a regression guard,
  not as a marketing point.
- Tooling: ESLint + Prettier configs; npm scripts `lint`, `test`,
  `package`; VS Code launch config for Extension Host.

## Resources

- [vscode-markdown-notes](https://github.com/kortina/vscode-markdown-notes)
  (GPL-3.0, reference only - do not copy code)
- [obsidian-tasks](https://github.com/obsidian-tasks-group/obsidian-tasks)
  (MIT, used for adapted task parsing; see `LICENSES/`)
- [VS Code Extension Samples](https://github.com/microsoft/vscode-extension-samples)
- [VS Code API Docs](https://code.visualstudio.com/api)
- [Markdown Extension Guide](https://code.visualstudio.com/api/extension-guides/markdown-extension)
- [Markdown All in One](https://marketplace.visualstudio.com/items?itemName=yzhang.markdown-all-in-one)
  (recommended companion)

## Delivery

- GitHub repo with README covering setup, settings, shortcuts, and
  limitations.
- MIT LICENSE plus `LICENSES/obsidian-tasks.MIT.txt` for attribution.
- VSIX artifact attached to release.
- GIF/video demo showing linking and backlinks refresh. (Tasks demo
  no longer required given the frozen status.)
- Publish to VS Code Marketplace.
