#!/usr/bin/env node
/**
 * Regression rule (QA audit 17 Nov 2026): a commit whose subject is a `fix` and that changes product code must
 * add or change a test in the same commit, or say why not with a `No-Test: <reason>` trailer.
 *
 *   node scripts/check-fix-tests.mjs <base>..<head>     (CI: the pushed range or the PR range)
 *   node scripts/check-fix-tests.mjs                    (local: the commits not yet on origin/main)
 *
 * Product code: apps/web/src, packages/<name>/src (not tests). Tests: *.test.ts(x), apps/e2e/tests, apps/e2e/lib.
 */
import { execFileSync } from "node:child_process";

const git = (...a) => execFileSync("git", a, { encoding: "utf8" }).trim();
const range = process.argv[2] || "origin/main..HEAD";
const shas = git("rev-list", "--no-merges", range).split("\n").filter(Boolean);

const isTest = (f) => /\.test\.tsx?$/.test(f) || f.startsWith("apps/e2e/tests/") || f.startsWith("apps/e2e/lib/");
const isCode = (f) => !isTest(f) && /^(apps\/web\/src|packages\/[^/]+\/src)\/.+\.(ts|tsx|mjs|js)$/.test(f);

const bad = [];
for (const sha of shas) {
  const subject = git("log", "-1", "--format=%s", sha);
  if (!/^fix(\(.+\))?!?:/.test(subject)) continue;
  const body = git("log", "-1", "--format=%B", sha);
  if (/^No-Test:\s*\S/m.test(body)) continue;
  const files = git("diff-tree", "--no-commit-id", "--name-only", "-r", sha).split("\n").filter(Boolean);
  if (!files.some(isCode)) continue;
  if (files.some(isTest)) continue;
  bad.push(`${sha.slice(0, 7)} ${subject}`);
}

if (bad.length) {
  console.error(`These fixes change product code without a test:\n${bad.map((b) => `  ${b}`).join("\n")}\n
Add a test that fails without the fix, or explain in the commit message with a trailer, e.g.
  No-Test: copy change only / covered by <test name> / cannot be reproduced outside production because …`);
  process.exit(1);
}
console.log(`check-fix-tests: ${shas.length} commit(s) in ${range}, every fix has a test or a No-Test reason.`);
