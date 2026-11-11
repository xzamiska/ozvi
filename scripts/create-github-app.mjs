#!/usr/bin/env node
// Creates the GitHub App an Ozvi instance connects GitHub through (ADR-0011), using GitHub's
// app manifest flow: you confirm one page on GitHub, the script gets the app's keys back.
//
//   node scripts/create-github-app.mjs --url https://feedback.example.com [--name "Example Ozvi"] [--org my-org] [--out github-app.env]
//
// --url  the instance's public address (OZVI_PUBLIC_URL); GitHub sends webhooks and installers there
// --name the app's name on GitHub (must be unique on GitHub)
// --org  create it under an organisation instead of your personal account
// --out  where to write the OZVI_GITHUB_APP_* lines (default github-app.env, readable only by you)
//
// Then add the lines to the instance's environment and restart it. Uses only Node's standard library.
import { execFile } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const base = (arg("url") ?? "").replace(/\/+$/, "");
if (!/^https:\/\//.test(base)) { console.error("Pass the instance's public https address: --url https://…"); process.exit(1); }
const name = arg("name", `Ozvi (${new URL(base).host})`);
const org = arg("org");
const out = arg("out", "github-app.env");
const port = 3999;
const state = randomBytes(16).toString("hex");

const manifest = {
  name,
  url: base,
  description: "Links bug reports and ideas in Ozvi to issues, pull requests and releases.",
  hook_attributes: { url: `${base}/api/github/app`, active: true },
  redirect_url: `http://127.0.0.1:${port}/done`,
  callback_urls: [`${base}/api/github/callback`],
  // The callback proves the installer can see the installation (lib/github-app.ts).
  request_oauth_on_install: true,
  setup_on_update: true,
  public: true,
  default_permissions: { issues: "write", pull_requests: "read", contents: "read", metadata: "read" },
  default_events: ["issues", "pull_request", "release"],
};
const target = org ? `https://github.com/organizations/${encodeURIComponent(org)}/settings/apps/new` : "https://github.com/settings/apps/new";
const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
  if (url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><meta charset="utf-8"><title>Create the GitHub App</title>
<form method="post" action="${target}?state=${state}"><input type="hidden" name="manifest" value="${esc(JSON.stringify(manifest))}">
<p>Sending you to GitHub to create “${esc(name)}”…</p><button>Continue</button></form><script>document.forms[0].submit()</script>`);
    return;
  }
  if (url.pathname !== "/done") { res.writeHead(404).end(); return; }
  const code = url.searchParams.get("code");
  if (url.searchParams.get("state") !== state || !code) { res.writeHead(400).end("Unexpected answer from GitHub. Run the script again."); return; }
  const r = await fetch(`https://api.github.com/app-manifests/${encodeURIComponent(code)}/conversions`, {
    method: "POST", headers: { accept: "application/vnd.github+json", "user-agent": "ozvi" },
  });
  const app = await r.json().catch(() => ({}));
  if (!r.ok || !app.id) {
    res.writeHead(502).end(`GitHub did not return the app (${r.status}). Run the script again.`);
    console.error("GitHub did not return the app:", r.status, app.message ?? "");
    process.exit(1);
  }
  const lines = {
    OZVI_GITHUB_APP_ID: String(app.id),
    OZVI_GITHUB_APP_SLUG: app.slug,
    OZVI_GITHUB_APP_CLIENT_ID: app.client_id,
    OZVI_GITHUB_APP_CLIENT_SECRET: app.client_secret,
    OZVI_GITHUB_APP_WEBHOOK_SECRET: app.webhook_secret,
    OZVI_GITHUB_APP_PRIVATE_KEY: Buffer.from(app.pem).toString("base64"),
  };
  writeFileSync(out, Object.entries(lines).map(([k, v]) => `${k}=${v}`).join("\n") + "\n", { mode: 0o600 });
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><meta charset="utf-8"><title>Done</title><p>“${esc(app.name)}” is created. You can close this tab.</p>`);
  console.log(`Created ${app.html_url}`);
  console.log(`Wrote ${Object.keys(lines).join(", ")} to ${out}. Add them to the instance's environment and restart it.`);
  server.close();
});

server.listen(port, "127.0.0.1", () => {
  const start = `http://127.0.0.1:${port}/`;
  console.log(`Opening ${start} (if no browser opens, open it yourself).`);
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
  execFile(cmd, [start], () => {});
});
