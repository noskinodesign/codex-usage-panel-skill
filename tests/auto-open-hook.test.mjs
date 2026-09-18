import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const installer = fileURLToPath(new URL("../scripts/install-auto-open-hook.mjs", import.meta.url));

function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), "codex-panel-hook-test-"));
  const codexHome = path.join(directory, "codex");
  const panelRoot = path.join(directory, "panel user's data");
  mkdirSync(codexHome);
  mkdirSync(panelRoot);
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return {
    codexHome,
    panelRoot,
    configPath: path.join(panelRoot, "config.json"),
    hooksPath: path.join(codexHome, "hooks.json"),
    scriptPath: path.join(codexHome, "hooks", "open-codex-usage-panel.sh")
  };
}

function install(context, extraArgs = [], customRoot = true) {
  const result = spawnSync(process.execPath, [
    installer,
    "--codex-home", context.codexHome,
    ...(customRoot ? ["--root", context.panelRoot] : []),
    ...extraArgs
  ], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return readFileSync(context.scriptPath, "utf8");
}

function resolveUrl(script, override) {
  // Execute the generated resolver itself, stopping before any stamp or browser action.
  const boundary = script.indexOf("\nstamp_dir=");
  assert.ok(boundary > 0, "generated hook must separate URL resolution from opening the browser");
  const env = { ...process.env };
  delete env.CODEX_USAGE_PANEL_URL;
  if (override !== undefined) env.CODEX_USAGE_PANEL_URL = override;
  const result = spawnSync("/bin/zsh", ["-c", `${script.slice(0, boundary)}\nprintf '%s' "$url"`], {
    encoding: "utf8",
    env
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test("default install targets the standard panel configuration and generates valid shell", (t) => {
  const context = fixture(t);
  const script = install(context, [], false);
  assert.ok(script.includes(path.join(homedir(), ".codex-usage-panel", "config.json")));
  const result = spawnSync("/bin/zsh", ["-n", context.scriptPath], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});

test("missing or invalid configuration falls back to port 8765", (t) => {
  const context = fixture(t);
  const script = install(context);
  const defaultUrl = "http://127.0.0.1:8765/index.html";
  assert.equal(resolveUrl(script), defaultUrl);
  for (const content of ["invalid JSON", "null", "{}", ...[0, -1, 65536, 8876.5, "8876", true].map((port) => JSON.stringify({ port }))]) {
    writeFileSync(context.configPath, content);
    assert.equal(resolveUrl(script), defaultUrl, `invalid configuration: ${content}`);
  }
});

test("custom root is quoted safely and its current port is read every time the hook runs", (t) => {
  const context = fixture(t);
  writeFileSync(context.configPath, JSON.stringify({ port: 8876 }));
  const script = install(context);
  assert.equal(resolveUrl(script), "http://127.0.0.1:8876/index.html");
  writeFileSync(context.configPath, JSON.stringify({ port: 8999 }));
  assert.equal(resolveUrl(script), "http://127.0.0.1:8999/index.html");
});

test("environment override wins over explicit URL, which wins over configured port", (t) => {
  const context = fixture(t);
  writeFileSync(context.configPath, JSON.stringify({ port: 8876 }));
  const explicitUrl = "http://127.0.0.1:9000/index.html?label='a'&literal=$(printf injected)";
  const script = install(context, ["--url", explicitUrl]);
  assert.equal(resolveUrl(script), explicitUrl);
  assert.equal(resolveUrl(script, ""), explicitUrl);
  assert.equal(resolveUrl(script, "http://127.0.0.1:9001/index.html"), "http://127.0.0.1:9001/index.html");
  const configuredScript = install(context);
  assert.equal(resolveUrl(configuredScript, "http://127.0.0.1:9002/index.html"), "http://127.0.0.1:9002/index.html");
});

test("reinstallation and removal preserve unrelated hooks without duplicate registration", (t) => {
  const context = fixture(t);
  const unrelatedSessionHook = { matcher: "startup", hooks: [{ type: "command", command: "/example/other-hook" }] };
  const unrelatedToolHook = [{ hooks: [{ type: "command", command: "/example/tool-hook" }] }];
  writeFileSync(context.hooksPath, JSON.stringify({
    customSetting: true,
    hooks: { SessionStart: [unrelatedSessionHook], PreToolUse: unrelatedToolHook }
  }));
  install(context);
  install(context);
  let config = JSON.parse(readFileSync(context.hooksPath, "utf8"));
  assert.equal(config.customSetting, true);
  assert.deepEqual(config.hooks.PreToolUse, unrelatedToolHook);
  assert.deepEqual(config.hooks.SessionStart[0], unrelatedSessionHook);
  assert.equal(config.hooks.SessionStart.flatMap((group) => group.hooks).filter((hook) => hook.command === context.scriptPath).length, 1);
  install(context, ["--remove"]);
  config = JSON.parse(readFileSync(context.hooksPath, "utf8"));
  assert.deepEqual(config.hooks.SessionStart, [unrelatedSessionHook]);
  assert.deepEqual(config.hooks.PreToolUse, unrelatedToolHook);
  assert.equal(config.customSetting, true);
});

test("removal makes cached hook invocations inert and remains idempotent", (t) => {
  const context = fixture(t);
  install(context);
  const cachedCommand = JSON.parse(readFileSync(context.hooksPath, "utf8"))
    .hooks.SessionStart[0].hooks[0].command;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const disabledScript = install(context, ["--remove"]);
    // Fail safely before executing if removal accidentally leaves a URL opener.
    assert.doesNotMatch(disabledScript, /\/usr\/bin\/open/);
    for (const source of ["startup", "resume", "clear"]) {
      const result = spawnSync(cachedCommand, [], {
        input: JSON.stringify({ hook_event_name: "SessionStart", source }),
        encoding: "utf8"
      });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, "");
      assert.equal(result.stderr, "");
    }
  }
  assert.equal(JSON.parse(readFileSync(context.hooksPath, "utf8")).hooks.SessionStart, undefined);
});
