# Markdown Loom in the landscape

This is a landscape review, written before investing more effort in
Markdown Loom. The goal is honest comparison, not marketing - if a
project does something better, say so; if Markdown Loom's niche turns
out to be a sliver, name that too.

> **Status:** Snapshot from research conducted 2026-05-09. All install
> counts, release dates, and signals will drift; treat the qualitative
> conclusions as more durable than the numbers.

## What Markdown Loom is trying to be

From `docs/SPEC.md` (post-2026-05-09 direction reset):

> Markdown Loom is a VS Code extension for plain-markdown note taking.
> It focuses on **wiki-style linking and backlinks** across a folder
> of `.md` files. ... The intended user keeps notes in plain markdown
> (often Obsidian compatible), syncs them however they prefer, and
> wants `[[wikilink]]` ergonomics in VS Code without adopting a new
> schema, hierarchy convention, or sidecar database.

Four principles drive the spec:

1. **Plain text first** - the `.md` files are the only source of
   truth.
2. **No proprietary persistent sidecar** - no `.markdownloom/`
   directory, no SQLite, no schema to migrate. The in-memory note
   index is rebuilt from the files.
3. **Minimal dependencies** - lightweight and fast.
4. **Unix philosophy** - do a few things well; recommend Markdown All
   in One for editing ergonomics rather than reimplementing them.

The intended user keeps notes in plain `.md` files (often Obsidian
compatible, often synced via iCloud/Syncthing/git), wants
`[[wikilink]]` ergonomics inside VS Code, and does **not** want to
adopt a new schema, hierarchy convention, or graph database to do
so.

The original spec also bundled an Obsidian-Tasks toggle and a
planned task query DSL. As of 2026-05-09 the **task half is frozen**
(toggle keeps working; no new task work) and the wikilink half is
the focus. See [Direction-setting decisions](#direction-setting-decisions-2026-05-09-ratified)
below for the full reasoning.

That niche still matters because every adjacent project either asks
for more buy-in (Foam, Dendron) or has stalled (kortina, Memo).

## Evaluation dimensions

| Dimension | What it means here |
|---|---|
| **Functionality** | Wikilink resolution rules, multi-root behavior, task syntax coverage, query support, preview integration. |
| **Usability** | Setup cost, config burden, conceptual overhead, "works on a folder of `.md` files with zero ceremony". |
| **Performance** | Indexing model and observed scale claims (`<100ms` autocomplete on 1000+ notes is Markdown Loom's bar). |
| **Supportability** | Last release, recent commit activity, open-issue load, license clarity, archived/sunset status. |
| **Trust** | Publisher identity, source link sanity from Marketplace, install count vs. age, transparency. |
| **Interop** | Does it own your files? Does the same vault work in Obsidian/mobile/plain editors? Does removing the extension leave plain `.md` behind? |

I weight **interop** and **supportability** heavily for a notes tool.
Notes outlive editor extensions, and a tool that mangles your files or
disappears in two years is a liability.

## Wikilink extensions

| Extension | Repo | Stars | Last release | Last push | License | Status note |
|---|---|---|---|---|---|---|
| **Markdown Notes** (`kortina.vscode-markdown-notes`) | kortina/vscode-markdown-notes | 448 | v0.0.27 (Apr 2023) | Jan 2026 | GPL-3.0 | Slow but alive; copy-restricted by GPL. |
| **Memo** (`svsool.markdown-memo`) | svsool/memo | 875 | v0.3.19 (Jul 2022) | Jul 2024 | MIT | Effectively unmaintained for ~2 years. |
| **Foam** (`foam.foam-vscode`) | foambubble/foam | 17.1k | v0.38.0 (Apr 2026) | May 2026 | (no SPDX, MIT-style in repo) | Active, large scope. |
| **Dendron** (`dendron.dendron`) | dendronhq/dendron | 7.4k | (no GitHub releases tracked) | Nov 2025 | Apache-2.0 | Active development **stopped Feb 2023**; community maintenance only. |
| **Markdown All in One** (`yzhang.markdown-all-in-one`) | yzhang-gh/vscode-markdown | 3.2k | tracked in changelog | Apr 2026 | MIT | General-purpose; no real wikilink support, listed for context. |

### Per-tool: wikilinks

**kortina/vscode-markdown-notes** - The closest historical reference and
the one Markdown Loom cribs from architecturally (without copying GPL
code). Provides `[[wiki-link]]` completion, go-to-definition, peek
references, backlinks, `#tags`, `@bibtex` citations, and a "create on
missing" flow. Also adds syntax highlighting and a "new note"
command. Two resolution modes: `uniqueFilenames` (basename across
workspace) or `relativePaths` (path-prefixed). The user's lived
experience - "added a layer or two of complexity" - tracks: BibTeX,
relative-path mode, and citation handling are real but extra surface
area for a plain-notes user. License is GPL, which is why the spec
says reference-only.

**svsool/memo** - Stars and feature breadth (link rename on file move,
hover preview, "open random note", paste HTML as Markdown, daily
notes, embedded images) suggest a strong product, but the last release
was July 2022 and the repo last saw a push in mid-2024. For a tool
that needs to keep up with VS Code API changes, that's a yellow flag
trending red. Worth studying for UX patterns; risky to depend on.

**Foam** - The active heavyweight. Wikilinks with section/block
references (`[[note#heading]]`, `[[note#^blockid]]`), unique-identifier
disambiguation across folders, link sync on rename, graph view,
templates, daily notes, orphans/placeholders panel, and its own
`foam-query` blocks rendered in preview. This is the tool that does
the most. The common critique is that it's a "system" - templates,
panels, conventions - rather than a thin layer over plain markdown,
but the maintainer of this doc hasn't given Foam a fair hands-on trial
recently, so treat that as folklore until verified. A side-by-side
trial is on the to-do list.

**Dendron** - Hierarchical notes (`projects.work.acme.kickoff.md`),
schema-driven autocomplete, lookup-as-creation, vaults, refactor
across the hierarchy. Very powerful at scale. The user's reaction
("wanted me to bolt on so much infrastructure") is the consensus
critique even from fans. **Crucially: development is on indefinite
pause since Feb 2023.** Repo activity continues from contributors but
no roadmap. Not a safe bet for new adopters in 2026.

**Markdown All in One** - Listed only because new users sometimes
expect wikilinks here. It doesn't really do them. Includes general
markdown ergonomics (TOC, list editing, math, GFM task list toggle).
Compatible alongside any of the above.

### Wikilink feature matrix

| Feature | Markdown Loom (spec) | kortina | Memo | Foam | Dendron |
|---|---|---|---|---|---|
| `[[Basename]]` completion | ✅ | ✅ | ✅ | ✅ | ✅ (hierarchical) |
| `[[Note\|Alias]]` | ✅ | ✅ | ✅ | ✅ | ✅ |
| Path-qualified targets | ❌ (out of scope) | optional mode | ✅ | ✅ | hierarchy is the path |
| Section/block refs | 🔜 planned (headings then blocks) | ❌ | sections | ✅ sections + blocks | ✅ |
| Multi-root tiebreaker | ✅ same-folder preferred | configurable | clash detection | unique-id resolver | vault model |
| Backlinks panel | ✅ | ✅ | ✅ | ✅ | ✅ |
| Ignore inside fenced code | ✅ (explicit acceptance criterion in SPEC.md) | partial | partial | ✅ | ✅ |
| Link rename on file rename | 🔜 planned (via `onWillRenameFiles`) | ❌ | ✅ | ✅ | ✅ |
| Graph view | ❌ | ❌ | ❌ | ✅ | ✅ |
| Create-on-click | ✅ | ✅ | ✅ | ✅ | ✅ (via lookup) |

## Task extensions

| Extension | Repo | Stars | Last push | License | Status note |
|---|---|---|---|---|---|
| **VsTasks** (`sugitlab.vstasks`) | sugitlab/vstasks | 0 | May 2025 | MIT | New, single contributor, almost no signal. Marketplace source link is broken (404). |
| **Todo Tree** (`Gruntfuggly.todo-tree`) | Gruntfuggly/todo-tree | 1.8k | Apr 2024 | (custom) | Stable but quiet. Comment-tag focus, not Obsidian Tasks. |
| **Todo+** (`fabiospampinato.vscode-todo-plus`) | fabiospampinato/vscode-todo-plus | 990 | Feb 2026 | MIT | Active. Custom `.todo` file format, not markdown checkboxes. |

### Per-tool: tasks

**VsTasks** - The user's instinct ("don't trust it") is well-founded.
README is in Japanese and very brief. The `CONTRIBUTING.md` link in
the README still points at `github.com/yourname/vstasks` (placeholder
text). Marketplace source link is broken; the actual repo is
`sugitlab/vstasks`. Zero stars, zero issues, single push burst in May
2025. The functional pitch is exactly Markdown Loom's task half
(Obsidian Tasks compatible parsing, tree view, query language with
`due before tomorrow` style filters, WebView rendering). If it
matures, it overlaps Markdown Loom's task feature set substantially -
but trust signals make it hard to recommend today.

**Todo Tree** - Different category. It scans for `TODO` / `FIXME`
**comment** tags across **code** files using ripgrep, surfaces them in
a tree view, and highlights them in the editor. Does not parse
Obsidian Tasks emoji, does not do dates, does not do queries. Not a
direct competitor; complementary if you also want code TODOs surfaced.

**Todo+** - Powerful and actively maintained, but it asks you to keep
todos in `*.todo` / `*.taskpaper` files using a custom syntax (custom
box/done/cancelled symbols, `@est(2h30m)` time tags, project sections,
archive command). Not Markdown, not Obsidian-compatible. If you don't
mind the format lock, it's the most polished task experience in this
list. If your goal is "edit the same files on mobile in Obsidian", it
disqualifies itself.

### Tasks feature matrix

| Feature | Markdown Loom (spec) | VsTasks | Todo Tree | Todo+ |
|---|---|---|---|---|
| Plain `- [ ]` markdown checkboxes | ✅ | ✅ | ❌ (comment tags) | ❌ (custom symbols) |
| Obsidian Tasks emoji (⏳📅🔁⏫✅) | ✅ | ✅ | ❌ | ❌ |
| Toggle adds done date automatically | ✅ | partial | ❌ | tracks completion separately |
| Preserve trailing metadata on toggle | ✅ explicit acceptance criterion in SPEC.md | unverified | n/a | n/a |
| Query blocks in markdown preview | ❌ (out of scope) | ✅ (WebView) | ❌ | ❌ (statistics, not query) |
| Date filters (`due before X`) | ❌ (out of scope) | ✅ | ❌ | ❌ |
| Skip tasks inside fenced code | ✅ explicit acceptance criterion in SPEC.md | unverified | n/a | n/a |
| Round-trips with Obsidian on mobile | ✅ | ✅ | n/a | ❌ |

## Where Markdown Loom lands

### Wins

- **Smaller surface area than Foam or Dendron, by design.** No graph
  view, no templates, no schemas, no daily-note conventions. Easier to
  adopt, easier to remove, easier to reason about.
- **MIT-licensed and acceptance-criteria-driven.** SPEC.md spells out
  edge cases (fenced code, same-folder tiebreaker, metadata
  preservation) that older extensions fudge.
- **Multi-root behavior is a tested regression guard.** The
  same-folder tiebreaker degrades naturally to "same root" without
  dedicated multi-root code paths; users on a single notes folder
  get the design center, users on multi-root get a working
  side-effect.
- **Honest about what's in and out.** Tasks are explicitly frozen
  rather than perpetually "Phase 2". Users aren't waiting for a query
  DSL that isn't coming.

### Losses / honest gaps

- **Foam and Dendron do far more.** If you want graphs, templates,
  hierarchical refactor, or daily-note infrastructure, Markdown Loom
  is not for you and isn't trying to be.
- **No link-sync on rename yet.** Memo, Foam, and Dendron all update
  inbound `[[links]]` when you rename a target file. Markdown Loom
  has this in the roadmap (`onWillRenameFiles` + `WorkspaceEdit`)
  but hasn't shipped it. It's the single most-requested feature in
  note tools of this kind, and shipping it is a credibility item.
- **No section/block refs yet.** `[[note#heading]]` and
  `[[note#^blockid]]` are table stakes in Foam and Obsidian.
  Markdown Loom has these in the roadmap (Phase A: headings; Phase
  B: blocks). The current implementation only resolves bare
  basenames.
- **Tasks are frozen, not removed.** Users who installed 0.2.0 for
  the task toggle still have it; users who want a richer task
  workflow have to leave (Obsidian, vstasks). That's the right
  tradeoff but worth being upfront about.

### Overlap to watch

- **vstasks** is the closest project on the task half. Markdown Loom
  is no longer competing there; if vstasks matures (real README,
  working source link, English docs, more than one contributor),
  it's the recommended pairing rather than a competitor.
- **kortina** still owns the "minimal wikilinks" niche by name
  recognition despite being slow. Markdown Loom needs to clearly
  out-execute on the bits kortina doesn't (fenced-code correctness,
  same-folder tiebreaker, section refs, rename) rather than
  re-litigating completion alone.

## Direction-setting decisions (2026-05-09, ratified)

These were captured during the original review. All four are now
**decisions**, reflected in `docs/SPEC.md` and `README.md`:

1. **Tasks are frozen, not bundled as a feature.** The current toggle
   + auto-done-date keeps working; no new task code is planned. A
   user who wants only wikilinks shouldn't have to reason about the
   task half. A user who wants tasks should use Obsidian on the same
   files, or watch `sugitlab/vstasks` once it matures. The
   hypothetical "queries that follow `[[wikilinks]]` to resolve
   `path includes` filters" integration is not enough to justify
   carrying the task surface area indefinitely.

2. **Link rewrite on rename is in scope.** Implementation will use
   `vscode.workspace.onWillRenameFiles` to return a `WorkspaceEdit`
   so the rename and the link rewrites land as one undoable step.
   Limitation: only catches renames VS Code knows about (Explorer,
   F2, refactor); terminal `mv` / Finder / out-of-editor `git mv`
   surface as broken backlinks instead. No "guess the rename"
   heuristic.

3. **Section and block references are in scope.** Phase A: heading
   refs (`[[Note#Heading]]`) in editor and preview. Phase B: block
   refs (`[[Note#^blockid]]`). The "bare basename only" rule in
   `docs/SPEC.md` has been amended.

4. **Single-folder is the design center.** Multi-root workspaces
   keep working as a side-effect of indexing the entire workspace
   (and stay in tests as a regression guard), but docs no longer
   foreground them. The same-folder tiebreaker degrades naturally to
   "same root" in multi-root setups.

Still open: **a hands-on Foam comparison.** The maintainer hasn't
trialed Foam recently enough to compare honestly. README and this
doc avoid asserting "Foam is too much" without evidence; revisit
after a hands-on pass.

## Methodology and limitations

- Doc-based research only: Marketplace listings, GitHub repo metadata,
  READMEs. No hands-on installation or feature verification of
  competitors in this pass. "unverified" entries in tables reflect
  this.
- Install counts are not included because Marketplace API access was
  not used in this pass; star count is a rough proxy.
- Obsidian itself is not compared feature-by-feature. It's the
  baseline most readers already know and can use alongside any of
  these extensions on the same `.md` files.
- A future pass should install kortina, vstasks, and Foam side by
  side in a scratch workspace and re-test the matrix entries marked
  "partial" or "unverified".
