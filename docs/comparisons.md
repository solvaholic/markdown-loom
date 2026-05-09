# Markdown Loom in the landscape

This is a landscape review, written before investing more effort in
Markdown Loom. The goal is honest comparison, not marketing - if a
project does something better, say so; if Markdown Loom's niche turns
out to be a sliver, name that too.

> **Status:** Snapshot from research conducted 2026-05-09. All install
> counts, release dates, and signals will drift; treat the qualitative
> conclusions as more durable than the numbers.

## What Markdown Loom is trying to be

From `docs/SPEC.md`:

> Build a VS Code extension that brings essential note-taking features
> to markdown files, supporting both wiki-style linking and Obsidian
> Tasks format. The extension must work with plain markdown files in
> any folder you can read - typically a single local directory,
> optionally synced or backed up by tools of your choice.

Three principles drive the spec:

1. **Plain text first** - no proprietary formats, no databases.
2. **Minimal dependencies** - lightweight and fast.
3. **Unix philosophy** - do a few things well, let other tools handle
   the rest.

The intended user keeps notes in plain `.md` files (often Obsidian
compatible, often synced via iCloud/Syncthing/git), wants `[[wikilink]]`
ergonomics inside VS Code, wants to round-trip Obsidian Tasks emoji
without losing metadata, and does **not** want to adopt a new schema,
hierarchy convention, or graph database to do so.

That niche matters because every adjacent project either asks for more
buy-in (Foam, Dendron) or covers only half the problem (kortina and
Memo do wikilinks but not Obsidian Tasks; vstasks does tasks but not
wikilinks).

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
| Section/block refs | ❌ | ❌ | sections | ✅ sections + blocks | ✅ |
| Multi-root tiebreaker | ✅ same-root preferred | configurable | clash detection | unique-id resolver | vault model |
| Backlinks panel | ✅ | ✅ | ✅ | ✅ | ✅ |
| Ignore inside fenced code | ✅ (explicit acceptance criterion in SPEC.md) | partial | partial | ✅ | ✅ |
| Link rename on file rename | ❌ | ❌ | ✅ | ✅ | ✅ |
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
| Query blocks in markdown preview | Phase 2 | ✅ (WebView) | ❌ | ❌ (statistics, not query) |
| Date filters (`due before X`) | Phase 2 | ✅ | ❌ | ❌ |
| Skip tasks inside fenced code | ✅ explicit acceptance criterion in SPEC.md | unverified | n/a | n/a |
| Round-trips with Obsidian on mobile | ✅ | ✅ | n/a | ❌ |

## Where Markdown Loom lands

### Wins

- **Smaller surface area than Foam or Dendron, by design.** No graph
  view, no templates, no schemas, no daily-note conventions. Easier to
  adopt, easier to remove, easier to reason about.
- **Obsidian-compatible task semantics in VS Code, with a maintained
  publisher.** That's a real gap today: kortina has no tasks, Memo has
  no tasks, vstasks is unproven, Todo+ uses a non-markdown format.
- **MIT-licensed and acceptance-criteria-driven.** SPEC.md spells out
  edge cases (fenced code, multi-root tiebreaker, metadata
  preservation) that older extensions fudge.
- **Multi-root behavior is a first-class acceptance criterion**, not
  an afterthought. Same-root tiebreaker matches how people actually
  separate work/personal vaults.

### Losses / honest gaps

- **Foam and Dendron do far more.** If you want graphs, block refs,
  templates, hierarchical refactor, or daily-note infrastructure,
  Markdown Loom is not for you and isn't trying to be.
- **No link-sync on rename (must-add).** Memo, Foam, and Dendron all
  update inbound `[[links]]` when you rename a target file. Markdown
  Loom's spec doesn't include this today; the maintainer has flagged
  it as in-scope going forward. It's the single most-requested feature
  in note tools of this kind, and skipping it long-term would be a
  credibility problem.
- **No section/block refs (must-add).** `[[note#heading]]` and
  `[[note#^blockid]]` are table stakes in Foam and Obsidian. Markdown
  Loom's spec explicitly limits targets to bare basenames; the
  maintainer has flagged this as in-scope going forward. Implies a
  spec amendment, not just an implementation task.
- **Phase 2 query renderer is Markdown Loom's biggest technical risk.**
  VS Code's preview pipeline has known sharp edges (per existing repo
  memories about render-phase URI access and `extendMarkdownIt` return
  values). Foam shipped this; vstasks ships it via WebView, not the
  built-in preview. Worth scoping carefully.
- **Phase 2 task queries duplicate Obsidian's own DSL, partially.**
  Risk: users expect full Obsidian Tasks query syntax, get a subset,
  feel cheated. Either lean into "subset, by design" in docs or commit
  to a fuller implementation.

### Overlap to watch

- **vstasks** is the closest direct competitor on the task half. If it
  matures (real README, working source link, English docs, more than
  one contributor), Markdown Loom needs a clearer differentiation
  story than "more polished" - probably "wikilinks + tasks in one
  extension with Obsidian round-trip guarantees".
- **kortina** still owns the "minimal wikilinks" niche by name
  recognition despite being slow. Markdown Loom needs to clearly
  out-execute on the bits kortina doesn't (tasks, fenced-code
  correctness, multi-root tiebreaker) rather than re-litigating
  wikilinks alone.

## Direction-setting decisions (2026-05-09)

Captured during review of this comparison:

1. **Wikilinks + tasks bundling is probably a coupling, not a feature.**
   A user who wants only wikilinks could install kortina; a user who
   wants only tasks could (eventually) install vstasks. The bundle is
   convenient but doesn't justify itself unless the integration adds
   something specific (e.g., task queries that follow `[[wikilinks]]`
   to resolve `path includes` filters across linked notes). Worth
   keeping under review - bundling may not survive a Phase 3 rethink.

2. **Link-sync on rename is in scope** going forward. Spec doesn't
   describe it yet; needs a proposal.

3. **Section and block references (`[[note#heading]]`,
   `[[note#^blockid]]`) are in scope** going forward. The current
   "bare basename only" rule in `docs/SPEC.md` will need an amendment.

4. **"Why not Foam?" is unanswered.** The maintainer hasn't tried Foam
   recently enough to compare honestly. README should not assert "Foam
   is too much" without evidence; revisit after a hands-on pass.

## Still-open questions

1. **If wikilinks + tasks decouple, what's the path?** Two extensions
   under the same publisher? Optional task feature toggled in
   settings? A clean Phase 3 split with shared indexing? Worth
   sketching before locking in more Phase 2 task work.

2. **Is single-root the design center, or multi-root?** Tests open the
   multi-root fixture (per repo memory: "Multi-root is the default
   *test* environment, not the default *user* environment"). Make sure
   docs and demo match the user's reality (single folder), even though
   tests must keep multi-root green.

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
