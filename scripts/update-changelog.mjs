#!/usr/bin/env node
// Prepend a release section to CHANGELOG.md using GitHub's generated release
// notes, so the changelog and the GitHub Release share one source
// (.github/release.yml categories).
//
// Usage:
//   node scripts/update-changelog.mjs [--force] [--dry-run] [--version X.Y.Z]
//                                     [--changelog <path>]
//
// Reads the new version from package.json (override with --version, e.g. to
// preview the next release), so run it after `npm version` has bumped it. When
// run by `npm version` itself (see package.json) it also stages CHANGELOG.md,
// and only that file, so the notes land in the version commit that npm creates
// and tags. --dry-run prints the section and changes nothing.
//
// Idempotent: if CHANGELOG.md already has a section for the version it is left
// unchanged; pass --force to regenerate it. Fails loudly (non-zero exit, no
// file written) when `gh` is missing or unauthenticated or the API response is
// unusable. Dependency-free (Node built-ins plus the `gh` CLI).

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const INTRO = `# Changelog

Release notes for Markdown Loom, newest first. Sections are generated from GitHub's release notes by \`scripts/update-changelog.mjs\` (categories are defined in \`.github/release.yml\`); see \`docs/RELEASING.md\`.
`;

export class ChangelogError extends Error {}

export function parseSemver(text) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(text);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function compareSemver(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) {
      return a[i] - b[i];
    }
  }
  return 0;
}

// Highest release tag strictly below `version`, so reruns after the new tag
// exists still diff against the true predecessor.
export function findPreviousTag(tags, version) {
  const target = parseSemver(version);
  if (!target) {
    throw new ChangelogError(
      `Version "${version}" is not a plain MAJOR.MINOR.PATCH version.`,
    );
  }
  let best = null;
  for (const tag of tags) {
    const parsed = parseSemver(tag);
    if (!parsed || !tag.startsWith("v") || compareSemver(parsed, target) >= 0) {
      continue;
    }
    if (!best || compareSemver(parsed, best.parsed) > 0) {
      best = { tag, parsed };
    }
  }
  return best ? best.tag : null;
}

export function parseRepoSlug(url) {
  const m = /github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?\/?$/.exec(url ?? "");
  if (!m) {
    throw new ChangelogError(
      `Cannot derive OWNER/REPO from package.json repository.url (${url}).`,
    );
  }
  return m[1];
}

function run(file, args, { cwd } = {}) {
  try {
    return execFileSync(file, args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new ChangelogError(
        `\`${file}\` was not found on PATH.` +
          (file === "gh" ? " Install it from https://cli.github.com." : ""),
      );
    }
    const detail = (err.stderr || err.stdout || err.message || "").trim();
    throw new ChangelogError(
      `\`${file} ${args.join(" ")}\` failed: ${detail}` +
        (file === "gh"
          ? "\nCheck `gh auth status`, and that HEAD is pushed to GitHub " +
            "(the notes API needs a target commit it can see)."
          : ""),
    );
  }
}

// Calls GitHub's generate-notes API. This only drafts text; it creates no
// release or tag.
export function fetchNotes({ repo, version, target, previousTag }, exec = run) {
  const args = [
    "api",
    `repos/${repo}/releases/generate-notes`,
    "-f",
    `tag_name=v${version}`,
    "-f",
    `target_commitish=${target}`,
  ];
  if (previousTag) {
    args.push("-f", `previous_tag_name=${previousTag}`);
  }
  const raw = exec("gh", args);

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ChangelogError("GitHub returned a non-JSON response for release notes.");
  }
  if (typeof parsed?.body !== "string" || parsed.body.trim() === "") {
    throw new ChangelogError(
      "GitHub's release-notes response has no usable `body`; refusing to write an empty section.",
    );
  }
  return parsed.body.trim();
}

// Generated notes use `##` for their own headings; nest them under the
// version heading, and keep `##` free as the section boundary.
function demoteHeadings(body) {
  return body.replace(/^(#{1,5}) /gm, "$1# ");
}

export function renderSection(version, date, body) {
  const tidy = demoteHeadings(body).replace(/\n{3,}/g, "\n\n");
  return `## v${version} - ${date}\n\n${tidy}\n`;
}

function sectionBounds(lines, version) {
  const heading = new RegExp(`^## v?${version.replace(/\./g, "\\.")}( |$)`);
  const start = lines.findIndex((l) => heading.test(l));
  if (start === -1) {
    return null;
  }
  let end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  if (end === -1) {
    end = lines.length;
  }
  return { start, end };
}

export function hasSection(changelog, version) {
  return sectionBounds(changelog.split("\n"), version) !== null;
}

// Returns the new changelog text. Replaces the version's section in place when
// it exists, otherwise inserts above the newest existing `## ` section.
export function applySection(changelog, version, section) {
  const lines = changelog.split("\n");
  const existing = sectionBounds(lines, version);
  const sectionLines = `${section.trimEnd()}\n`.split("\n");

  if (existing) {
    lines.splice(existing.start, existing.end - existing.start, ...sectionLines);
    return lines.join("\n");
  }
  const first = lines.findIndex((l) => /^## /.test(l));
  if (first === -1) {
    return `${changelog.trimEnd()}\n\n${sectionLines.join("\n")}`;
  }
  lines.splice(first, 0, ...sectionLines);
  return lines.join("\n");
}

function readChangelog(changelogPath) {
  return existsSync(changelogPath) ? readFileSync(changelogPath, "utf8") : INTRO;
}

function parseArgs(argv) {
  const opts = {
    force: false,
    dryRun: false,
    version: null,
    changelog: join(repoRoot, "CHANGELOG.md"),
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--force") {
      opts.force = true;
    } else if (argv[i] === "--dry-run") {
      opts.dryRun = true;
    } else if (argv[i] === "--version" && argv[i + 1]) {
      opts.version = argv[++i];
    } else if (argv[i] === "--changelog" && argv[i + 1]) {
      opts.changelog = resolve(argv[++i]);
    } else {
      throw new ChangelogError(`Unknown argument: ${argv[i]}`);
    }
  }
  return opts;
}

function localDate() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  const version = opts.version ?? pkg.version;
  const repo = parseRepoSlug(pkg.repository?.url);

  const current = readChangelog(opts.changelog);
  if (hasSection(current, version) && !opts.force) {
    console.log(`CHANGELOG.md already has a v${version} section; leaving it unchanged (use --force to regenerate).`);
  } else {
    const tags = run("git", ["tag", "--list", "v*"], { cwd: repoRoot })
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean);
    const previousTag = findPreviousTag(tags, version);
    const target = run("git", ["rev-parse", "HEAD"], { cwd: repoRoot }).trim();
    const body = fetchNotes({ repo, version, target, previousTag });
    const section = renderSection(version, localDate(), body);
    if (opts.dryRun) {
      console.log(section);
      return;
    }
    writeFileSync(opts.changelog, applySection(current, version, section));
    console.log(`CHANGELOG.md: wrote v${version} section (previous tag: ${previousTag ?? "none"}).`);
  }

  // Stage only the changelog, and only inside a real `npm version` that will
  // commit. `npm run version` and `--no-git-tag-version` must not touch the index.
  // npm exports an empty string for --no-git-tag-version and nothing by default.
  const gitTag = process.env.npm_config_git_tag_version;
  const inNpmVersion =
    process.env.npm_command === "version" && gitTag !== "" && gitTag !== "false";
  if (inNpmVersion && !opts.dryRun) {
    run("git", ["add", "--", opts.changelog], { cwd: repoRoot });
    console.log("CHANGELOG.md: staged for the version commit.");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (err) {
    if (err instanceof ChangelogError) {
      console.error(`update-changelog: ${err.message}`);
      process.exit(1);
    }
    throw err;
  }
}
