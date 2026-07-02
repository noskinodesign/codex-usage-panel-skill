#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillName = "codex-usage-panel";
const distDir = path.join(repoRoot, "dist");
const zipPath = path.join(distDir, `${skillName}-skill.zip`);
const stagingRoot = path.join(tmpdir(), `${skillName}-package`);
const stagingSkill = path.join(stagingRoot, skillName);

const required = [
  "SKILL.md",
  "agents",
  "assets",
  "scripts/install-auto-open-hook.mjs",
  "scripts/install-panel.mjs",
  "scripts/sync-usage.mjs"
];

for (const entry of required) {
  const source = path.join(repoRoot, entry);
  if (!existsSync(source)) throw new Error(`Missing required release file: ${source}`);
}

mkdirSync(distDir, { recursive: true });
rmSync(zipPath, { force: true });
rmSync(stagingRoot, { recursive: true, force: true });
mkdirSync(path.join(stagingSkill, "scripts"), { recursive: true });

for (const entry of ["SKILL.md", "README.md", "README.zh-CN.md", "LICENSE", "agents", "assets", "examples"]) {
  const source = path.join(repoRoot, entry);
  if (existsSync(source)) {
    cpSync(source, path.join(stagingSkill, entry), { recursive: true });
  }
}

for (const script of ["install-panel.mjs", "install-auto-open-hook.mjs", "sync-usage.mjs"]) {
  cpSync(path.join(repoRoot, "scripts", script), path.join(stagingSkill, "scripts", script));
}

const result = spawnSync("/usr/bin/zip", ["-r", "-X", zipPath, skillName], {
  cwd: stagingRoot,
  stdio: "inherit"
});

rmSync(stagingRoot, { recursive: true, force: true });

if (result.status !== 0) {
  throw new Error("Failed to create release zip");
}

console.log(`Created ${zipPath}`);
