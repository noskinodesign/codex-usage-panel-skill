#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createServer } from "node:net";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(scriptDir, "..");
const defaultRoot = path.join(homedir(), ".codex-usage-panel");
const defaultPort = 8765;
const defaultIntervalMs = 10_000;
const serverLabel = "com.codex.usage-panel.server";
const syncLabel = "com.codex.usage-panel.sync";

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

function expandHome(value) {
  return String(value).replace(/^~(?=$|\/)/, homedir());
}

function xml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    encoding: "utf8",
    stdio: options.quiet ? "pipe" : "inherit"
  });
  if (options.allowFailure) return result;
  if (result.status !== 0) {
    throw new Error(`${command} ${commandArgs.join(" ")} failed`);
  }
  return result;
}

function currentUid() {
  return String(process.getuid?.() || run("/usr/bin/id", ["-u"], { quiet: true }).stdout.trim());
}

function readJsonFile(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (_) {
    return null;
  }
}

function copyDirectory(source, target) {
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source)) {
    const from = path.join(source, entry);
    const to = path.join(target, entry);
    if (statSync(from).isDirectory()) {
      copyDirectory(from, to);
    } else {
      copyFileSync(from, to);
    }
  }
}

function writePlist(filePath, payload) {
  writeFileSync(filePath, payload);
  run("/usr/bin/plutil", ["-lint", filePath]);
}

function bootoutPlist(plistPath) {
  run("/bin/launchctl", ["bootout", `gui/${currentUid()}`, plistPath], { allowFailure: true, quiet: true });
}

function launchAgent(label, plistPath) {
  const uid = currentUid();
  run("/bin/launchctl", ["bootout", `gui/${uid}`, plistPath], { allowFailure: true, quiet: true });
  run("/bin/launchctl", ["bootstrap", `gui/${uid}`, plistPath]);
  run("/bin/launchctl", ["kickstart", "-k", `gui/${uid}/${label}`], { allowFailure: true, quiet: true });
}

function parsePort(value, label) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${label} must be a TCP port between 1 and 65535.`);
  }
  return port;
}

function parsePortList(value, label) {
  if (value == null || value === true) return [];
  return String(value)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => parsePort(part, label));
}

function legacyLaunchAgentLabels() {
  return ["com.lukeji.codex-usage-panel-server", "com.lukeji.codex-usage-panel-sync"];
}

function disableLegacyLaunchAgents(launchAgentsDir) {
  const disabledDir = path.join(homedir(), "Library", "LaunchAgents.disabled");
  for (const label of legacyLaunchAgentLabels()) {
    const plistPath = path.join(launchAgentsDir, `${label}.plist`);
    bootoutPlist(plistPath);
    if (!existsSync(plistPath)) continue;
    mkdirSync(disabledDir, { recursive: true });
    const disabledPath = path.join(disabledDir, `${label}.plist.disabled-${Date.now()}`);
    renameSync(plistPath, disabledPath);
    console.log(`Disabled legacy LaunchAgent: ${disabledPath}`);
  }
}

function canBindPort(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function resolvePort(requestedPort, mayFallback) {
  if (await canBindPort(requestedPort)) return requestedPort;
  if (!mayFallback) {
    throw new Error(`Port ${requestedPort} is already in use. Choose another port with --port.`);
  }

  for (let candidate = requestedPort + 1; candidate <= requestedPort + 34; candidate += 1) {
    if (await canBindPort(candidate)) {
      console.warn(`Port ${requestedPort} is already in use. Using ${candidate} instead.`);
      return candidate;
    }
  }

  throw new Error(`No available local port found near ${requestedPort}. Choose one with --port.`);
}

const installRoot = path.resolve(expandHome(args.get("--root") || defaultRoot));
const intervalMs = Number(args.get("--interval") || defaultIntervalMs);
const openAfterInstall = args.has("--open");
const noLaunchAgent = args.has("--no-launch-agent");
const assetsSource = path.join(skillRoot, "assets", "panel");
const assetsTarget = path.join(installRoot, "assets");
const scriptsTarget = path.join(installRoot, "scripts");
const configPath = path.join(installRoot, "config.json");
const profileOverridePath = path.join(installRoot, "profile.json");
const syncSource = path.join(skillRoot, "scripts", "sync-usage.mjs");
const syncTarget = path.join(scriptsTarget, "sync-usage.mjs");
const codexBinary = process.env.CODEX_APP_BINARY || "/Applications/Codex.app/Contents/Resources/codex";
const nodeBinary = process.execPath;
const pythonBinary = "/usr/bin/python3";
const launchAgentsDir = path.join(homedir(), "Library", "LaunchAgents");
const serverPlist = path.join(launchAgentsDir, `${serverLabel}.plist`);
const syncPlist = path.join(launchAgentsDir, `${syncLabel}.plist`);
const previousConfig = readJsonFile(configPath) || {};

if (process.platform === "darwin" && !noLaunchAgent) {
  mkdirSync(launchAgentsDir, { recursive: true });
  bootoutPlist(serverPlist);
  bootoutPlist(syncPlist);
  if (!args.has("--keep-legacy-launch-agents")) disableLegacyLaunchAgents(launchAgentsDir);
}

const requestedPortArg = args.get("--port");
const port = await resolvePort(parsePort(requestedPortArg || defaultPort, "--port"), !requestedPortArg);
const aliasPorts = new Set([
  ...parsePortList(args.get("--alias-port"), "--alias-port"),
  ...parsePortList(args.get("--alias-ports"), "--alias-ports")
]);
if (previousConfig.port && Number(previousConfig.port) !== port) {
  aliasPorts.add(parsePort(previousConfig.port, "previous config port"));
}
aliasPorts.delete(port);

if (!existsSync(assetsSource)) {
  throw new Error(`Missing dashboard assets: ${assetsSource}`);
}

mkdirSync(installRoot, { recursive: true });
mkdirSync(scriptsTarget, { recursive: true });
rmSync(assetsTarget, { recursive: true, force: true });
copyDirectory(assetsSource, assetsTarget);
copyFileSync(syncSource, syncTarget);
chmodSync(syncTarget, 0o755);

writeFileSync(
  configPath,
  `${JSON.stringify({ port, intervalMs, codexBinary }, null, 2)}\n`
);

const profileOverride = {};
if (args.has("--profile-name")) profileOverride.name = args.get("--profile-name");
if (args.has("--profile-handle")) profileOverride.handle = args.get("--profile-handle");
if (args.has("--profile-avatar")) {
  const avatarInput = String(args.get("--profile-avatar"));
  const avatarFile = path.resolve(expandHome(avatarInput));
  if (existsSync(avatarFile) && statSync(avatarFile).isFile()) {
    const extension = path.extname(avatarFile).toLowerCase() || ".png";
    const avatarTargetName = `profile-avatar${extension}`;
    copyFileSync(avatarFile, path.join(assetsTarget, avatarTargetName));
    profileOverride.avatarUrl = `./${avatarTargetName}`;
  } else {
    profileOverride.avatarUrl = avatarInput;
  }
}
if (Object.keys(profileOverride).length > 0) {
  writeFileSync(profileOverridePath, `${JSON.stringify(profileOverride, null, 2)}\n`);
}

function serverLaunchAgentPayload(label, servePort, stdoutPath, stderrPath) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xml(label)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(pythonBinary)}</string>
    <string>-m</string>
    <string>http.server</string>
    <string>${xml(servePort)}</string>
    <string>--bind</string>
    <string>127.0.0.1</string>
    <string>--directory</string>
    <string>${xml(assetsTarget)}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${xml(assetsTarget)}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${xml(stdoutPath)}</string>
  <key>StandardErrorPath</key>
  <string>${xml(stderrPath)}</string>
  <key>ProcessType</key>
  <string>Background</string>
</dict>
</plist>
`;
}

function aliasLabel(aliasPort) {
  return `${serverLabel}.alias-${aliasPort}`;
}

if (process.platform === "darwin" && !noLaunchAgent) {
  mkdirSync(launchAgentsDir, { recursive: true });
  const serverPayload = serverLaunchAgentPayload(
    serverLabel,
    port,
    "/tmp/codex-usage-panel-server.log",
    "/tmp/codex-usage-panel-server.err.log"
  );

  const syncPayload = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xml(syncLabel)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(nodeBinary)}</string>
    <string>${xml(syncTarget)}</string>
    <string>--watch</string>
    <string>--interval</string>
    <string>${xml(intervalMs)}</string>
    <string>--root</string>
    <string>${xml(installRoot)}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${xml(installRoot)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>${xml(homedir())}</string>
    <key>CODEX_APP_BINARY</key>
    <string>${xml(codexBinary)}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/codex-usage-panel-sync.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/codex-usage-panel-sync.err.log</string>
  <key>ProcessType</key>
  <string>Background</string>
</dict>
</plist>
`;

  writePlist(serverPlist, serverPayload);
  writePlist(syncPlist, syncPayload);
  launchAgent(serverLabel, serverPlist);
  launchAgent(syncLabel, syncPlist);

  for (const aliasPort of aliasPorts) {
    const label = aliasLabel(aliasPort);
    const aliasPlist = path.join(launchAgentsDir, `${label}.plist`);
    const aliasPayload = serverLaunchAgentPayload(
      label,
      aliasPort,
      `/tmp/codex-usage-panel-alias-${aliasPort}.log`,
      `/tmp/codex-usage-panel-alias-${aliasPort}.err.log`
    );
    writePlist(aliasPlist, aliasPayload);
    try {
      launchAgent(label, aliasPlist);
      console.log(`Dashboard alias: http://127.0.0.1:${aliasPort}/index.html`);
    } catch (error) {
      console.warn(`Could not start alias port ${aliasPort}: ${error.message}`);
    }
  }
} else if (!noLaunchAgent) {
  console.log("LaunchAgents are only configured automatically on macOS.");
}

if (!existsSync(codexBinary)) {
  console.warn(`Codex app binary was not found at ${codexBinary}. Sync will work after Codex desktop is installed or CODEX_APP_BINARY is set.`);
}

const url = `http://127.0.0.1:${port}/index.html`;
if (openAfterInstall && process.platform === "darwin") {
  run("/usr/bin/open", [url], { allowFailure: true });
}

console.log(`Codex usage panel installed at ${installRoot}`);
console.log(`Dashboard: ${url}`);
console.log(`Server label: ${serverLabel}`);
console.log(`Sync label: ${syncLabel}`);
if (noLaunchAgent) {
  console.log(`Manual server: cd "${assetsTarget}" && /usr/bin/python3 -m http.server ${port} --bind 127.0.0.1`);
  console.log(`Manual sync: "${nodeBinary}" "${syncTarget}" --watch --interval ${intervalMs} --root "${installRoot}"`);
}
