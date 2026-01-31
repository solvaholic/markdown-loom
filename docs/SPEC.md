# VS Code Markdown Notes Extension Specification

## Project Overview
Build a VS Code extension that brings essential note-taking features to markdown files, supporting both wiki-style linking and Obsidian Tasks format. The extension must work with plain markdown files stored in any location (iCloud, OneDrive, local).

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
- [ ] Review [[API Design Doc]] 📅 2026-01-31
- [ ] Send feedback on [[Q1 Planning]] ⏫ 
- [x] Update [[Personal/Reading List]] ✅ 2026-01-31

### Query: What's due soon?
<!-- The extension would render matching tasks here -->
```

**Context Switching:**
- Open VS Code with two workspace folders: `~/iCloud/Notes` and `~/OneDrive/WorkNotes`
- Type `[[API` and see suggestions from BOTH folders
- Click any link to jump between personal and work notes seamlessly

## MVP Features (Phase 1)

### 1. Wiki-Style Linking
- **Pattern**: `[[Note Name]]` or `[[folder/Note Name]]`
- **Autocomplete**: When user types `[[`, show all `.md` files across workspace
- **Navigation**: Ctrl/Cmd+Click opens the linked file
- **File Creation**: Clicking a link to non-existent file prompts to create it
- **Acceptance**: Case-insensitive lookup; if duplicate filenames exist, completion shows `folder/filename`; works across multi-root workspaces; ignores wikilink patterns inside fenced code blocks

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
- **Pattern**: `- [ ] Task text 📅 2026-02-15 ⏫ #tag`
- **Toggle**: Hotkey to mark done/undone (changes `[ ]` to `[x]`)
- **Preserve Metadata**: Keep all emoji and tags when toggling
- **Parsing rules**: Treat trailing text (emoji, tags) as part of the line; date format must be ISO 8601 (`YYYY-MM-DD`); skip tasks inside fenced code blocks
- **Acceptance**: Toggle changes only the checkbox; preserves trailing text exactly; works in multi-root workspaces

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
path includes "work"
```​
```

Start with simple filters:
- `not done` — Show unchecked tasks
- `due before/after/on [date]` — ISO date comparison
- `path includes [text]` — Filename filtering
- `tag includes [tag]` — Tag filtering
- `sort by due asc|desc` — Optional ordering
- `limit [number]` — Default 50

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
vscode-markdown-notes-tasks/
├── src/
│   ├── extension.ts           // Main entry point
│   ├── providers/
│   │   ├── linkProvider.ts    // Wikilink completion & navigation
│   │   └── backlinksProvider.ts
│   ├── tasks/
│   │   ├── parser.ts         // Task parsing (can adapt from Obsidian)
│   │   ├── toggler.ts        // Toggle task state
│   │   └── query.ts          // Task query engine
│   └── test/
├── LICENSE
├── LICENSES/              
│   └── obsidian-tasks.MIT.txt  // If you copy their code
└── package.json
```

### Key VS Code APIs to Use
- `vscode.languages.registerCompletionItemProvider` — Autocomplete
- `vscode.languages.registerDefinitionProvider` — Go to definition
- `vscode.window.createTreeView` — Backlinks panel
- `vscode.workspace.findFiles` — Search for notes
- `vscode.workspace.onDidChangeTextDocument` — Update backlinks

### Configuration Schema
```json
{
  "markdownNotesTasks.wikiLinkStyle": {
    "type": "string",
    "enum": ["name", "relative", "absolute"],
    "default": "name",
    "description": "How to complete [[wikilinks]]"
  },
  "markdownNotesTasks.taskDateFormat": {
    "type": "string", 
    "default": "YYYY-MM-DD",
    "description": "Date format for task dates"
  },
  "markdownNotesTasks.queryLimitDefault": {
    "type": "number",
    "default": 50,
    "description": "Default max tasks returned by a query"
  }
}
```

## Development Approach

### Week 1-2: Wikilinks MVP
1. Set up extension boilerplate
2. Implement basic `[[link]]` completion
3. Add click-to-navigate
4. Test with multiple workspace folders

### Week 3: Backlinks
1. Create sidebar tree view
2. Implement file watcher for updates
3. Add "Referenced in X notes" count

### Week 4: Tasks Basics
1. Port task regex from Obsidian (with attribution)
2. Implement toggle command
3. Add keyboard shortcut

### Week 5: Polish & Testing
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
- [Obsidian Tasks Parser](https://github.com/obsidian-tasks-group/obsidian-tasks/tree/main/src) (MIT - can copy)
- [vscode-markdown-notes Architecture](https://github.com/kortina/vscode-markdown-notes) (GPL - reference only)
- [VS Code Extension Samples](https://github.com/microsoft/vscode-extension-samples)
- [VS Code API Docs](https://code.visualstudio.com/api)

## Questions to Consider
1. Should wikilinks be case-sensitive? (Recommend: no)
2. How to handle files with same name in different folders? (Recommend: show path in completion)
3. Should extension work in untitled files? (Recommend: no, needs file context)

## Delivery
- GitHub repo with README covering setup, settings, shortcuts, and limitations
- LICENSE plus LICENSES/obsidian-tasks.MIT.txt if regex reused
- VSIX artifact attached to release
- GIF/video demo showing linking, backlinks refresh, task toggle, and a query
- Publish to VS Code Marketplace (optional for MVP)

---

**Note to Junior Dev**: Start with just wikilink completion. Get that working end-to-end before moving to backlinks or tasks. Ask questions early if VS Code's API feels confusing—it has quirks. The Obsidian Tasks codebase is exceptionally well-organized, so spend time studying their patterns.
