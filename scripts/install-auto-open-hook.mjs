#!/usr/bin/env node
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (!arg.startsWith("--")) continue;
  const next = process.argv[index + 1];
  if (next && !next.startsWith("--")) {
    args.set(arg, next);
    index += 1;
  } else {
    args.set(arg, true);
  }
}

const codexHome = path.resolve(String(args.get("--codex-home") || process.env.CODEX_HOME || path.join(homedir(), ".codex")).replace(/^~(?=$|\/)/, homedir()));
const panelUrl = String(args.get("--url") || "http://127.0.0.1:8765/index.html");
const removeHook = args.has("--remove");
const hooksDir = path.join(codexHome, "hooks");
const hooksJsonPath = path.join(codexHome, "hooks.json");
const hookScriptPath = path.join(hooksDir, "open-codex-usage-panel.sh");
const statusMessage = "Opening Codex usage panel";

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function readHooksJson() {
  if (!existsSync(hooksJsonPath)) return { hooks: {} };
  try {
    return JSON.parse(readFileSync(hooksJsonPath, "utf8"));
  } catch (error) {
    const backup = `${hooksJsonPath}.bak-${Date.now()}`;
    renameSync(hooksJsonPath, backup);
    console.warn(`Existing hooks.json was invalid and was moved to ${backup}`);
    return { hooks: {} };
  }
}

function writeHooksJson(config) {
  mkdirSync(codexHome, { recursive: true });
  writeFileSync(hooksJsonPath, `${JSON.stringify(config, null, 2)}\n`);
}

function stripAutoOpenHook(config) {
  const groups = config.hooks?.SessionStart || [];
  config.hooks = config.hooks || {};
  config.hooks.SessionStart = groups
    .map((group) => ({
      ...group,
      hooks: (group.hooks || []).filter((hook) => hook.command !== hookScriptPath)
    }))
    .filter((group) => (group.hooks || []).length > 0);
  if (config.hooks.SessionStart.length === 0) delete config.hooks.SessionStart;
  return config;
}

function writeHookScript() {
  mkdirSync(hooksDir, { recursive: true });
  const payload = `#!/bin/zsh
set -u

url="\${CODEX_USAGE_PANEL_URL:-${panelUrl}}"
stamp_dir="\${HOME}/.codex/tmp"
stamp_file="\${stamp_dir}/usage-panel-last-opened"
now="$(/bin/date +%s)"
last="0"

/bin/mkdir -p "$stamp_dir"
if [[ -f "$stamp_file" ]]; then
  last="$(/bin/cat "$stamp_file" 2>/dev/null || echo 0)"
fi

# SessionStart can fire close together when a thread is created or restored.
# Keep the panel open, but avoid repeatedly stealing focus.
if (( now - last < 8 )); then
  exit 0
fi

/usr/bin/printf "%s" "$now" > "$stamp_file"
(
  /usr/bin/open -a Codex "$url" >/dev/null 2>&1 || /usr/bin/open "$url" >/dev/null 2>&1
) &

exit 0
`;
  writeFileSync(hookScriptPath, payload);
  chmodSync(hookScriptPath, 0o755);
}

const config = stripAutoOpenHook(readHooksJson());

if (removeHook) {
  writeHooksJson(config);
  console.log(`Removed Codex usage panel auto-open hook from ${hooksJsonPath}`);
  process.exit(0);
}

writeHookScript();
config.hooks = config.hooks || {};
config.hooks.SessionStart = config.hooks.SessionStart || [];
config.hooks.SessionStart.push({
  matcher: "startup|resume|clear",
  hooks: [
    {
      type: "command",
      command: hookScriptPath,
      timeout: 5,
      statusMessage
    }
  ]
});

writeHooksJson(config);

console.log(`Installed Codex usage panel auto-open hook.`);
console.log(`Hook script: ${hookScriptPath}`);
console.log(`Hooks config: ${hooksJsonPath}`);
console.log(`Panel URL: ${panelUrl}`);
console.log(`To remove it later: node ${shellQuote(process.argv[1])} --remove`);
