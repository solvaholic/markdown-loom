# Releasing markdown-loom

This is the checklist for cutting a release. Follow it top to bottom; skipping
steps is how we end up with a release whose demo GIF doesn't render (see
"Lessons learned" at the bottom).

## Pre-flight

- [ ] Working tree is clean on `main`, all PRs for this release merged.
- [ ] `npm test` passes (`pretest` runs compile + lint first).
- [ ] `docs/SPEC.md`, `README.md`, and any feature docs reflect what's actually
      shipping. If the README embeds assets (GIFs, screenshots), confirm the
      asset files are committed *and* the URLs you'll use will resolve for
      anonymous viewers.
- [ ] **Repo visibility.** If the repo is private, `raw.githubusercontent.com`
      URLs return 404 for the Marketplace listing and for unauthenticated
      release-notes viewers. Either make the repo public before tagging, or
      host demo assets somewhere that doesn't require auth.
- [ ] `package.json` metadata is current: `displayName`, `description`,
      `publisher`, `repository.url`, `homepage`, `bugs.url`, `categories`,
      `engines.vscode`.

## Smoke test the dev build

Unit tests cover the renderer in isolation but cannot catch contract bugs
between the extension and VS Code itself (see "Lessons learned" - v0.1.0
shipped a renderer that the preview never invoked because of how it was
exported). Always run this checklist in an Extension Development Host
before bumping the version.

1. Press `F5` to launch the Extension Development Host with
   `test-fixtures/markdown-loom.code-workspace`.
2. Open `rootA/Index.md`.
3. **Editor side:**
   - [ ] Cmd+Hover over `[[Notes]]` shows `Open note: Notes` (not
         `Execute command`).
   - [ ] Cmd+Click on `[[Notes]]` opens `rootA/Notes.md`.
   - [ ] Cmd+Click on `[[Sibling]]` opens `rootB/Sibling.md` (cross-root via
         a basename that is unique to rootB).
   - [ ] Cmd+Click on `[[does-not-exist]]` prompts to create the note.
   - [ ] Backlinks panel updates when switching files.
4. **Preview side** (`Cmd+Shift+V`):
   - [ ] `[[Notes]]` renders as a clickable anchor, not literal `[[Notes]]`
         text.
   - [ ] Multiple wikilinks on one line all render as anchors (regression
         guard against the stale-`lastIndex` bug).
   - [ ] Clicking `[[Notes]]` in the preview opens `rootA/Notes.md`.
   - [ ] Clicking `[[Sibling]]` in the preview opens `rootB/Sibling.md`,
         not a "create note" prompt for `rootA/Sibling.md`. (Path-prefixed
         targets like `[[rootB/Foo]]` are illegal per `docs/SPEC.md` and
         render as literal text - don't smoke-test with those.)
   - [ ] Wikilinks inside fenced code blocks render as literal text.
5. **Tasks:** open a file with `- [ ] task`, hit `Cmd+Alt+T`, confirm the
   line gets `✅ <today>` appended.

If any of these fail, fix and re-run the checklist before continuing. A
unit test that locks in the failure mode is a good idea before the fix.

## Cut the release

Pick the right SemVer bump. Phase 1 milestones are minor bumps; bug-fix-only
releases are patches.

```sh
# 1. Bump version, commit, and tag in one step.
#    Replace `minor` with `patch` or `major` as appropriate.
npm version minor -m "chore(release): v%s"

# 2. Build the VSIX from the bumped tree.
npm run package
# Produces markdown-loom-<version>.vsix in the repo root.

# 3. Push the commit and the tag.
git push origin main --follow-tags

# 4. Publish a GitHub Release with the VSIX attached.
#    --generate-notes drafts release notes from merged PRs since the last tag;
#    edit them afterward to call out user-facing changes.
gh release create "v$(node -p "require('./package.json').version")" \
  "markdown-loom-$(node -p "require('./package.json').version").vsix" \
  --generate-notes
```

After `gh release create`, open the release in the browser and:

- [ ] Confirm the VSIX asset downloads.
- [ ] Confirm any embedded images/GIFs render (open in an incognito tab if the
      repo just went public; cached 404s are a thing).
- [ ] Edit the auto-generated notes to lead with user-facing highlights.

## Marketplace publish (when ready)

We don't auto-publish to the VS Code Marketplace yet. When we do:

```sh
# Requires a Personal Access Token with Marketplace publish scope.
npx vsce publish --packagePath markdown-loom-<version>.vsix
```

The Marketplace listing pulls README.md from the tagged commit on the default
branch. Asset URLs in the README must be absolute and publicly resolvable.

## Demo assets

The demo GIF lives at `docs/demo.gif` and is embedded in README.md. The source
recording (`docs/demo.mov`) is git-ignored - we ship the rendered GIF, not the
MOV.

To re-record:

1. Open `test-fixtures/markdown-loom.code-workspace` in an Extension
   Development Host.
2. Show, in order: wikilink completion (type `[[Foo`), follow link
   (Cmd+Click or F12), Backlinks panel populating, task toggle with
   Cmd+Alt+T appending a `✅ <date>`.
3. Save the recording to `docs/demo.mov`.
4. Convert with `scripts/make-demo-gif.sh` (see that script for tunable
   width/fps/quality).

Keep demos under ~30 seconds and the rendered GIF under ~1 MB - GitHub clamps
inline animated images and the Marketplace is even pickier.

## Lessons learned

- **v0.1.0**: shipped with a private repo, so `raw.githubusercontent.com`
  links to `docs/demo.gif` 404'd everywhere the demo was meant to render
  (Marketplace, release notes). Fix was to flip the repo public after tagging.
  The pre-flight "Repo visibility" checkbox above exists to prevent a repeat.
- **v0.1.0**: first attempt at converting `demo.mov` to GIF with ad-hoc
  `ffmpeg | gifski` flags failed. The working pipeline now lives in
  `scripts/make-demo-gif.sh` so the next demo rev is one command.
- **v0.1.0**: shipped with `extendMarkdownIt` exported as a top-level
  function from `src/extension.ts`. VS Code's `markdown.markdownItPlugins`
  contribution point requires it to be **returned from `activate()`**;
  the top-level export is silently ignored, so wikilinks rendered as
  literal `[[text]]` in the preview the entire v0.1.0 lifetime. Unit
  tests passed because they constructed `WikiLinkRenderer` directly. The
  "Smoke test the dev build" preview checks above exist to catch any
  recurrence of contract bugs that live between the extension and the
  VS Code host.
