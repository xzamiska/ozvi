#!/usr/bin/env node
// A deterministic OpenAI-compatible model for the browser tests (scripts/e2e-server.sh sets OZVI_AI_PROVIDER=openai
// and OZVI_AI_BASE_URL to it). It "translates" by prefixing [<locale>] and answers other tasks with a fixed line, so
// specs can assert exact text without a real model, a key or any cost. GET /log lists every text it was sent (the
// specs check that a private report never reached it); DELETE /log clears it.
//   node scripts/e2e-ai-mock.mjs [--port 3419] [--parent <pid>]   (exits with the parent process)
import { createServer } from "node:http";

const arg = (name, def) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : def; };
const port = Number(arg("--port", "3419"));
const parent = Number(arg("--parent", "0"));
const CODES = { Slovak: "sk", Czech: "cs", English: "en", Polish: "pl", Hungarian: "hu", German: "de" };
const log = [];

/** The <feedback> JSON of a request (user text, "<" escaped by the app). */
function feedback(content) {
  const m = content.match(/<feedback>\n([\s\S]*)\n<\/feedback>/);
  try { return m ? JSON.parse(m[1]) : null; } catch { return null; }
}

function answer(content) {
  const data = feedback(content) ?? {};
  const lang = content.match(/into (Slovak|Czech|English|Polish|Hungarian|German)\b/)?.[1];
  const tag = `[${CODES[lang] ?? "en"}]`;
  if (Array.isArray(data.titles)) {
    log.push(...data.titles);
    return JSON.stringify({ titles: data.titles.map((t) => `${tag} ${t}`) });
  }
  if ("body" in data) {
    log.push(...[data.title, data.body].filter(Boolean));
    return JSON.stringify({ title: data.title == null ? null : `${tag} ${data.title}`, body: data.body ? `${tag} ${data.body}` : "" });
  }
  log.push(JSON.stringify(data).slice(0, 2000));
  return "E2E mock summary.";
}

const server = createServer((req, res) => {
  if (req.url === "/log") {
    if (req.method === "DELETE") log.length = 0;
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify(log));
  }
  if (req.method !== "POST" || !req.url?.endsWith("/chat/completions")) { res.writeHead(404); return res.end(); }
  let body = "";
  req.on("data", (c) => { body += c; });
  req.on("end", () => {
    let content = "";
    try { content = JSON.parse(body).messages?.find((m) => m.role === "user")?.content ?? ""; } catch { /* empty */ }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: answer(content) }, finish_reason: "stop" }] }));
  });
});
server.on("error", (e) => {
  // Already running (a reused e2e server from an earlier run): that one answers.
  if (e.code === "EADDRINUSE") process.exit(0);
  throw e;
});
server.listen(port, "127.0.0.1");
if (parent) setInterval(() => { try { process.kill(parent, 0); } catch { process.exit(0); } }, 2000).unref?.();
