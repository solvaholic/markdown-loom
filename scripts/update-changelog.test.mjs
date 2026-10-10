import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, symlinkSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ChangelogError,
  applySection,
  fetchNotes,
  findPreviousTag,
  hasSection,
  parseRepoSlug,
  renderSection,
} from "./update-changelog.mjs";

const script = join(dirname(fileURLToPath(import.meta.url)), "update-changelog.mjs");

const BASE = `# Changelog

Intro text.

## Earlier releases

Older stuff.
`;

const notes = (body) => () => JSON.stringify({ name: "v1.2.3", body });
const args = { repo: "o/r", version: "1.2.3", target: "abc", previousTag: "v1.2.2" };

test("findPreviousTag picks the highest tag below the version", () => {
  const tags = ["v0.9.0", "v0.10.0", "v0.4.2", "v0.11.0", "junk", "0.3.0", "v0.10.1-rc.1"];
  assert.equal(findPreviousTag(tags, "0.11.0"), "v0.10.0");
  assert.equal(findPreviousTag(tags, "0.4.3"), "v0.4.2");
  assert.equal(findPreviousTag(tags, "0.1.0"), null);
});

test("findPreviousTag rejects non-plain versions", () => {
  assert.throws(() => findPreviousTag([], "1.0.0-beta.1"), ChangelogError);
});

test("parseRepoSlug handles https, ssh, and .git suffixes", () => {
  assert.equal(parseRepoSlug("https://github.com/solvaholic/markdown-loom.git"), "solvaholic/markdown-loom");
  assert.equal(parseRepoSlug("git@github.com:a/b"), "a/b");
  assert.throws(() => parseRepoSlug("https://example.com/x"), ChangelogError);
});

test("fetchNotes sends the tag, target, and previous tag", () => {
  let seen;
  const body = fetchNotes(args, (file, a) => {
    seen = [file, a];
    return JSON.stringify({ body: "  ## Fixes\n* x\n" });
  });
  assert.equal(body, "## Fixes\n* x");
  assert.equal(seen[0], "gh");
  assert.ok(seen[1].includes("repos/o/r/releases/generate-notes"));
  assert.ok(seen[1].includes("tag_name=v1.2.3"));
  assert.ok(seen[1].includes("target_commitish=abc"));
  assert.ok(seen[1].includes("previous_tag_name=v1.2.2"));
});

test("fetchNotes omits previous_tag_name when there is none", () => {
  let seen;
  fetchNotes({ ...args, previousTag: null }, (_f, a) => {
    seen = a;
    return JSON.stringify({ body: "x" });
  });
  assert.ok(!seen.some((a) => a.startsWith("previous_tag_name")));
});

test("fetchNotes rejects malformed, empty, and non-JSON responses", () => {
  assert.throws(() => fetchNotes(args, () => "not json"), /non-JSON/);
  assert.throws(() => fetchNotes(args, () => "{}"), /no usable `body`/);
  assert.throws(() => fetchNotes(args, notes("   \n")), /no usable `body`/);
});

test("fetchNotes surfaces exec failures", () => {
  assert.throws(
    () => fetchNotes(args, () => { throw new ChangelogError("boom"); }),
    /boom/,
  );
});

test("renderSection demotes generated headings", () => {
  const out = renderSection("1.2.3", "2026-01-02", "## Fixes\n* a #1 fix\n\n**Full Changelog**: u");
  assert.equal(out, "## v1.2.3 - 2026-01-02\n\n### Fixes\n* a #1 fix\n\n**Full Changelog**: u\n");
});

test("applySection inserts above the newest section", () => {
  const out = applySection(BASE, "1.2.3", renderSection("1.2.3", "2026-01-02", "* a"));
  assert.ok(out.indexOf("## v1.2.3") < out.indexOf("## Earlier releases"));
  assert.ok(out.includes("Intro text."));
  assert.match(out, /\* a\n\n## Earlier releases/);
});

test("applySection is idempotent per version and keeps order", () => {
  const first = applySection(BASE, "1.2.3", renderSection("1.2.3", "d", "* a"));
  const older = applySection(first, "1.2.4", renderSection("1.2.4", "d", "* b"));
  assert.ok(older.indexOf("## v1.2.4") < older.indexOf("## v1.2.3"));
  assert.ok(hasSection(older, "1.2.3"));
  assert.ok(!hasSection(older, "1.2.2"));

  const replaced = applySection(older, "1.2.3", renderSection("1.2.3", "d", "* A2"));
  assert.equal(replaced.match(/## v1\.2\.3/g).length, 1);
  assert.ok(replaced.includes("* A2") && !replaced.includes("* a\n"));
  assert.ok(replaced.includes("## v1.2.4") && replaced.includes("## Earlier releases"));
});

test("hasSection does not confuse 1.2.3 with 1.2.30", () => {
  const text = "# C\n\n## v1.2.30 - d\n\n* x\n";
  assert.ok(!hasSection(text, "1.2.3"));
});

// End-to-end: run the real script with a PATH that has git but no `gh`.
test("CLI fails with an actionable error and writes nothing when gh is missing", () => {
  const dir = mkdtempSync(join(tmpdir(), "changelog-"));
  const file = join(dir, "CHANGELOG.md");
  writeFileSync(file, BASE);
  const bin = join(dir, "bin");
  mkdirSync(bin);
  symlinkSync(execFileSync("which", ["git"], { encoding: "utf8" }).trim(), join(bin, "git"));
  try {
    assert.throws(
      () =>
        execFileSync(process.execPath, [script, "--changelog", file], {
          env: { PATH: bin },
          stdio: "pipe",
        }),
      (err) => {
        assert.equal(err.status, 1);
        assert.match(String(err.stderr), /`gh` was not found/);
        return true;
      },
    );
    assert.equal(readFileSync(file, "utf8"), BASE);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
