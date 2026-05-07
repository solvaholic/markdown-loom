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
