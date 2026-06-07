import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import esbuild from "esbuild";

async function loadApiModule() {
  const dir = await mkdtemp(path.join(tmpdir(), "embed-api-test-"));
  const outfile = path.join(dir, "embed-api.mjs");
  await esbuild.build({
    entryPoints: [path.resolve("src/web/embed/src/embed-api.ts")],
    outfile,
    bundle: true,
    format: "esm",
    platform: "browser",
  });
  const mod = await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);
  await rm(dir, { recursive: true, force: true });
  return mod;
}

function installLocalStorage() {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test("clearEmbedSessionId removes the saved embed session", async () => {
  installLocalStorage();
  const api = await loadApiModule();

  api.saveEmbedSessionId("alice", "secret", "session-1");
  assert.equal(api.loadEmbedSessionId("alice", "secret"), "session-1");

  api.clearEmbedSessionId("alice", "secret");

  assert.equal(api.loadEmbedSessionId("alice", "secret"), null);
});

test("abortEmbedChat posts the selected agent to the abort endpoint", async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    await writeFile(path.join(tmpdir(), "embed-api-abort-called"), "1");
    return { ok: true, json: async () => ({ success: true }) };
  };
  const api = await loadApiModule();

  const result = await api.abortEmbedChat("alice", "secret");

  assert.deepEqual(result, { success: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/chat/abort");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.credentials, "include");
  assert.equal(calls[0].init.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(calls[0].init.body), { agent: "alice", token: "secret" });
});

test("stageEmbedAttachment posts file bytes to the embed attachment endpoint", async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, json: async () => ({ path: "/tmp/report.docx" }) };
  };
  const api = await loadApiModule();

  const result = await api.stageEmbedAttachment("alice", "secret", "session-1", "report.docx", "YWJj");

  assert.deepEqual(result, { path: "/tmp/report.docx" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/embed/attachments");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.credentials, "include");
  assert.equal(calls[0].init.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    agent: "alice",
    token: "secret",
    sessionId: "session-1",
    filename: "report.docx",
    base64: "YWJj",
  });
});
