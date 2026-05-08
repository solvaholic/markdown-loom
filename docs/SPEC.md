# VS Code Markdown Notes Extension Specification

## Project Overview
Build a VS Code extension that brings essential note-taking features to markdown files, supporting both wiki-style linking and Obsidian Tasks format. The extension must work with plain markdown files in any folder you can read - typically a single local directory, optionally synced or backed up by tools of your choice.

## Core Principles
- **Plain text first** — No proprietary formats, no databases, just `.md` files
- **Minimal dependencies** — Lightweight and fast
- **Unix philosophy** — Do a few things well, let other tools handle the rest

## User Stories

### As a knowledge worker who takes notes across work and personal contexts:
1. **I want to link between notes** using `[[wikilinks]]` so I can build a connected knowledge graph
2. **I want to see backlinks** to the current note so I can understand how ideas connect
3. **I want to manage tasks** in Obsidian format so my mobile and desktop workflows are compatible
4. **I want to query tasks** across all my notes so I can see what needs attention

### Example Workflows

**Morning Planning:**
```markdown
## Daily Note 2026-01-31

### Tasks for Today
- [ ] Review [[API Design Doc]] ⏳ 2026-01-31
- [ ] Send feedback on [[Q1 Planning]] ⏫ 
- [ ] Water plants 🔁 every week on Monday ⏳ 2026-02-03
- [x] Update [[Personal/Reading List]] ✅ 2026-01-31

### Query: What's scheduled soon?
<!-- The extension would render matching tasks here -->
```

**Fast cross-note navigation:**
- Open VS Code on a local notes folder, e.g. `~/notes/` with PARA-style
  subfolders (`projects/`, `areas/`, `resources/`, `archive/`).
- Type `[[API` and see suggestions from anywhere in the folder.
- Click any link to jump straight to the target note.
- Multi-root workspaces are also supported when you want to keep, say,
  personal and work notes in separate roots - the same completion and
  navigation work across roots.

## MVP Features (Phase 1)

### 1. Wiki-Style Linking
- **Pattern**: `[[Note Name]]` or `[[Note Name|Alias]]` (see "Wikilink target syntax" below)
- **Autocomplete**: When user types `[[`, show all `.md` files across workspace by basename
- **Navigation**: Ctrl/Cmd+Click opens the linked file in source mode
- **Preview Rendering**: In markdown preview, `[[links]]` render as clickable links
- **File Creation**: Clicking a link to non-existent file prompts to create it
- **Acceptance**: Case-insensitive basename lookup; works across multi-root workspaces; ignores wikilink patterns inside fenced code blocks; aliases render as the display text without affecting resolution

#### Wikilink target syntax

A wikilink target is **only** a note name (matched against `.md` basenames),
optionally with an alias for display.

Legal forms:

- `[[Note Name]]` — link to `Note Name.md` (display text: `Note Name`).
- `[[Note Name|Stacey]]` — link to `Note Name.md`, rendered as `Stacey`.

Not legal (treated as plain text, not as wikilinks):

- Path-prefixed: `[[folder/Note]]`, `[[rootB/Foo]]`.
- Relative paths: `[[./Note]]`, `[[../Note]]`. Use plain markdown links
  (`[label](./path/to/Note.md)`) when you need to point at a specific path.

Resolution rules:

- A target resolves by case-insensitive basename match against indexed notes.
- If multiple notes share a basename, the resolver prefers the candidate in
  the source file's workspace folder (same-root tiebreaker), then falls back
  to the first match.
- Backlinks surface filename collisions: a bare `[[Foo]]` registers as a
  backlink on every `Foo.md` candidate, with non-winners flagged ambiguous.
- Users handle name collisions however they prefer (rename, move, or live
  with the ambiguity warning); the spec does not dictate a scheme.

Future namespacing or path-qualified targets may be revisited as a separate
proposal.

**Implementation Reference**: Study `kortina/vscode-markdown-notes` (GPL-3.0)
- Don't copy code directly unless you want GPL license
- Key APIs: `vscode.languages.registerCompletionItemProvider`

### 2. Backlinks Panel
- Show all files that link TO the current file
- Update dynamically when switching files
- Display as tree view in sidebar
- **Acceptance**: Refreshes within 300ms after file save or switch; displays count label ("Referenced in N notes"); ignores matches inside fenced code blocks

**Implementation**: 
- Use `vscode.window.createTreeView`
- Search workspace for `[[current-filename]]` patterns

### 3. Basic Task Support
- **Pattern**: `- [ ] Task text ⏳ 2026-02-15 🔁 every week #tag`
- **Common emoji**: 
  - ⏳ scheduled date (when you plan to work on it)
  - 📅 due date (when it must be done)
  - 🔁 recurrence rule
  - ⏫ high priority, 🔼 medium, 🔽 low
  - ✅ done date (added automatically on completion)
- **Toggle**: Hotkey to mark done/undone (changes `[ ]` to `[x]`)
- **Done Date**: When marking task done, automatically append `✅ YYYY-MM-DD` with current date if not already present
- **Preserve Metadata**: Keep all existing emoji and tags when toggling
- **Parsing rules**: Treat trailing text (emoji, tags) as part of the line; date format must be ISO 8601 (`YYYY-MM-DD`); skip tasks inside fenced code blocks
- **Acceptance**: Toggle changes checkbox and adds done date; preserves all other trailing text exactly; works in multi-root workspaces

**Implementation Reference**: Study `obsidian-tasks-group/obsidian-tasks` (MIT)
- You CAN copy their task parsing regex
- Include their MIT license notice

## Phase 2 Features (Nice to Have)

### 4. Task Queries (Simplified)
Support basic query blocks:
```markdown
```tasks
not done
due before tomorrow
path includes work
```​
```

**Rendering**: 
- Queries render in VS Code's **Markdown Preview pane** (Cmd/Ctrl+Shift+V)
- Register a custom markdown-it plugin via `markdown.markdownItPlugins` contribution point
- User can toggle between source and preview, or view side-by-side
- Similar to how Mermaid diagrams work in VS Code markdown preview

Start with simple filters:
- `not done` — Show unchecked tasks
- `due before/after/on <date>` — ISO date comparison, e.g., `due before 2026-03-01`
- `path includes <text>` — Filename filtering, e.g., `path includes work`
- `tag includes <tag>` — Tag filtering, e.g., `tag includes #project`
- `sort by due asc|desc` — Optional ordering
- `limit <number>` — Default 50

**Behavior**:
- Unknown filters are ignored with a warning in output
- Empty result shows "No tasks found" message
- Query ignores tasks inside fenced code blocks

### 5. Quick Task Entry
- Command palette: "Create task"
- Opens modal with fields: description, due date, tags
- Inserts properly formatted task at cursor

## Technical Architecture

### File Structure
```
markdown-loom/
├── src/
│   ├── extension.ts           // Main entry point
│   ├── providers/
│   │   ├── linkProvider.ts    // Wikilink completion & navigation
│   │   └── backlinksProvider.ts
│   ├── tasks/
│   │   ├── parser.ts         // Task parsing (can adapt from Obsidian)
│   │   ├── toggler.ts        // Toggle task state
│   │   ├── query.ts          // Task query engine
│   │   └── previewRenderer.ts // Markdown preview extension
│   └── test/
├── LICENSE                    // MIT
├── LICENSES/              
│   └── obsidian-tasks.MIT.txt  // Attribution for copied code
└── package.json
```

### Key VS Code APIs to Use
- `vscode.languages.registerCompletionItemProvider` — Autocomplete
- `vscode.languages.registerDefinitionProvider` — Go to definition
- `vscode.window.createTreeView` — Backlinks panel
- `vscode.workspace.findFiles` — Search for notes
- `vscode.workspace.onDidChangeTextDocument` — Update backlinks
- `markdown.markdownItPlugins` extension point — Render task queries in preview

### Configuration Schema
```json
{
  "markdownLoom.wikiLinkStyle": {
    "type": "string",
    "enum": ["name"],
    "default": "name",
    "description": "Reserved for future use. Currently `[[` completion always inserts the note basename; alternative styles were removed when the spec restricted targets to bare names."
  },
  "markdownLoom.taskDateFormat": {
    "type": "string", 
    "default": "YYYY-MM-DD",
    "description": "Date format for task dates"
  },
  "markdownLoom.queryLimitDefault": {
    "type": "number",
    "default": 50,
    "description": "Default max tasks returned by a query"
  },
  "markdownLoom.autoAddDoneDate": {
    "type": "boolean",
    "default": true,
    "description": "Automatically add done date when completing tasks"
  }
}
```

## Development Approach

### 1. Wikilinks MVP
1. Set up extension boilerplate
2. Implement basic `[[link]]` completion
3. Add click-to-navigate
4. Test with multiple workspace folders

### 2. Backlinks
1. Create sidebar tree view
2. Implement file watcher for updates
3. Add "Referenced in X notes" count

### 3. Tasks Basics
1. Port task regex from Obsidian (with attribution)
2. Implement toggle command
3. Add keyboard shortcut

### 4. Polish & Testing
1. Add settings/configuration
2. Write tests for parser
3. Create demo video/README

## Success Criteria
- User can navigate between notes using `[[links]]` with zero config
- Tasks maintain Obsidian compatibility (can edit same files on mobile)
- Extension activates only for markdown files
- Performance: Autocomplete responds in <100ms for vaults with 1000+ notes
- Backlinks refresh within 300ms of save or file switch
- Task toggle preserves trailing metadata exactly

## Testing & Tooling Expectations
- Unit tests: link resolution (case-insensitive, duplicate handling), backlinks refresh logic, task parser/toggler, query filters
- Fixtures: workspace with two roots and >1000 fake notes for perf smoke
- Tooling: ESLint + Prettier configs; npm scripts `lint`, `test`, `package`; VS Code launch config for Extension Host

## Resources
- [Obsidian Tasks Docs](https://publish.obsidian.md/tasks/) - Query syntax reference
- [Obsidian Tasks Parser](https://github.com/obsidian-tasks-group/obsidian-tasks/tree/main/src) (MIT - can copy)
- [vscode-markdown-notes Architecture](https://github.com/kortina/vscode-markdown-notes) (GPL - reference only)
- [VS Code Extension Samples](https://github.com/microsoft/vscode-extension-samples)
- [VS Code API Docs](https://code.visualstudio.com/api)
- [Markdown Extension Guide](https://code.visualstudio.com/api/extension-guides/markdown-extension) - Preview rendering

## Delivery
- GitHub repo with README covering setup, settings, shortcuts, and limitations
- MIT LICENSE plus LICENSES/obsidian-tasks.MIT.txt for attribution
- VSIX artifact attached to release
- GIF/video demo showing linking, backlinks refresh, task toggle with done date, and a query
- Publish to VS Code Marketplace (optional for MVP)

---

**Note to Junior Dev**: Start with just wikilink completion. Get that working end-to-end before moving to backlinks or tasks. Ask questions early if VS Code's API feels confusing—it has quirks. The Obsidian Tasks codebase is exceptionally well-organized, so spend time studying their patterns.
