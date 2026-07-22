#!/usr/bin/env node
// Release currency check: assert the repo's config matches what it ships.
//
// Encodes the mechanically-verifiable parts of the "Currency check" pre-flight
// step in docs/RELEASING.md so drift is caught on every PR, not just at release
// time. Dependency-free (Node built-ins only) so CI can run it with no install.
//
// Checks:
//   1. Version strings agree across package.json and package-lock.json.
//   2. ESLint is actually in flat-config mode: a flat config exists and no
//      legacy .eslintrc* lingers (the invariant the copilot-instructions.md
//      "flat-config mode" claim depends on).
//   3. No stray generated/build artifacts are tracked by git.
//
// Exit code 0 = all checks pass, 1 = at least one failed.

import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const failures = [];
const passes = [];

function pass(msg) {
  passes.push(msg);
}
function fail(msg) {
  failures.push(msg);
}

function readJson(relPath) {
  return JSON.parse(readFileSync(join(repoRoot, relPath), "utf8"));
}

// --- Check 1: version-string agreement --------------------------------------
function checkVersions() {
  const pkg = readJson("package.json");
  const lock = readJson("package-lock.json");
  const expected = pkg.version;

  const embedded = [
    ["package-lock.json (root version)", lock.version],
    ["package-lock.json (packages[''].version)", lock.packages?.[""]?.version],
  ];

  let ok = true;
  for (const [where, value] of embedded) {
    if (value !== expected) {
      ok = false;
      fail(
        `Version mismatch: package.json is ${expected} but ${where} is ${value ?? "missing"}.`,
      );
    }
  }
  if (ok) {
    pass(`Version strings agree (${expected}).`);
  }
}

// --- Check 2: ESLint flat-config matches on-disk reality --------------------
function checkEslintFlatConfig() {
  const flatConfigs = [
    "eslint.config.js",
    "eslint.config.mjs",
    "eslint.config.cjs",
  ];
  const legacyConfigs = [
    ".eslintrc",
    ".eslintrc.js",
    ".eslintrc.cjs",
    ".eslintrc.json",
    ".eslintrc.yml",
    ".eslintrc.yaml",
  ];

  const foundFlat = flatConfigs.filter((f) => existsSync(join(repoRoot, f)));
  const foundLegacy = legacyConfigs.filter((f) => existsSync(join(repoRoot, f)));

  if (foundFlat.length === 0) {
    fail(
      "ESLint flat config not found. The repo asserts flat-config mode " +
        "(.github/copilot-instructions.md) but no eslint.config.{js,mjs,cjs} exists.",
    );
  }
  if (foundLegacy.length > 0) {
    fail(
      `Legacy ESLint config present alongside flat config: ${foundLegacy.join(", ")}. ` +
        "Flat-config mode is superseded by these; remove them.",
    );
  }
  if (foundFlat.length > 0 && foundLegacy.length === 0) {
    pass(`ESLint is in flat-config mode (${foundFlat.join(", ")}, no legacy eslintrc).`);
  }
}

// --- Check 3: no stray generated artifacts tracked --------------------------
function checkNoTrackedArtifacts() {
  let tracked;
  try {
    tracked = execFileSync("git", ["ls-files"], {
      cwd: repoRoot,
      encoding: "utf8",
    })
      .split("\n")
      .filter(Boolean);
  } catch (err) {
    fail(`Could not list tracked files via git: ${err.message}`);
    return;
  }

  // Generated/build output that .gitignore covers; none should be tracked.
  const artifactPatterns = [
    /^dist\//,
    /^out\//,
    /^\.vscode-test\//,
    /\.vsix$/,
    /^docs\/demo\.mov$/,
    /^test-fixtures\/rootA\/perf-1000\//,
  ];

  const strays = tracked.filter((f) =>
    artifactPatterns.some((re) => re.test(f)),
  );

  if (strays.length > 0) {
    fail(
      `Generated artifacts are tracked by git (should be ignored): ${strays.join(", ")}.`,
    );
  } else {
    pass("No stray generated artifacts tracked by git.");
  }
}

checkVersions();
checkEslintFlatConfig();
checkNoTrackedArtifacts();

for (const msg of passes) {
  console.log(`  ok    ${msg}`);
}
for (const msg of failures) {
  console.error(`  FAIL  ${msg}`);
}

if (failures.length > 0) {
  console.error(
    `\ncurrency-check: ${failures.length} problem(s) found. See docs/RELEASING.md.`,
  );
  process.exit(1);
}

console.log("\ncurrency-check: all checks passed.");
