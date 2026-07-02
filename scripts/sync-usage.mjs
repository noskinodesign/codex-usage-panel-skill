#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import path from "node:path";
import vm from "node:vm";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(scriptDir, "..");
const codexBinary = process.env.CODEX_APP_BINARY || "/Applications/Codex.app/Contents/Resources/codex";
const defaultIntervalMs = 10_000;

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (arg.startsWith("--")) {
    const next = process.argv[index + 1];
    if (next && !next.startsWith("--")) {
      args.set(arg, next);
      index += 1;
    } else {
      args.set(arg, true);
    }
  }
}

const watch = args.has("--watch");
const intervalMs = Number(args.get("--interval") || defaultIntervalMs);
const installRoot = path.resolve(String(args.get("--root") || process.env.CODEX_USAGE_PANEL_ROOT || defaultRoot).replace(/^~(?=$|\/)/, homedir()));
const sourceDataPath = path.join(installRoot, "assets", "usage-data.js");
const profileOverridePath = path.join(installRoot, "profile.json");

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function readPreviousData() {
  if (!existsSync(sourceDataPath)) return {};
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(readFileSync(sourceDataPath, "utf8"), context, { timeout: 1000 });
  return context.window.CodexUsageData || {};
}

function readJsonFile(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    console.error(`Could not read ${filePath}: ${error.message}`);
    return null;
  }
}

function cleanString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function formatPlan(value) {
  const plan = cleanString(value);
  if (!plan) return null;
  return plan[0].toUpperCase() + plan.slice(1);
}

function emailLocalPart(email) {
  const cleanEmail = cleanString(email);
  if (!cleanEmail || !cleanEmail.includes("@")) return null;
  return cleanEmail.split("@")[0].split("+")[0];
}

function displayNameFromEmail(email) {
  const localPart = emailLocalPart(email);
  if (!localPart) return null;
  if (!/[._-]/.test(localPart)) return localPart;
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function handleFromEmail(email) {
  const localPart = emailLocalPart(email);
  return localPart ? `@${localPart}` : null;
}

function profileOverride() {
  const raw = readJsonFile(profileOverridePath);
  if (!raw || typeof raw !== "object") return {};
  return {
    name: cleanString(raw.name),
    handle: cleanString(raw.handle),
    plan: formatPlan(raw.plan),
    avatarUrl: cleanString(raw.avatarUrl || raw.avatar_url || raw.avatar || raw.imageUrl || raw.picture)
  };
}

function isDefaultProfileValue(value, defaults) {
  const cleanValue = cleanString(value);
  return !cleanValue || defaults.includes(cleanValue);
}

function firstUsablePrevious(previous, key, defaults) {
  const value = previous.profile?.[key];
  return isDefaultProfileValue(value, defaults) ? null : cleanString(value);
}

function initialsFromProfile(profile) {
  const base = cleanString(profile.name) || cleanString(profile.handle)?.replace(/^@/, "") || "CU";
  const parts = base
    .replace(/[^\p{L}\p{N}\s._-]/gu, " ")
    .split(/[\s._-]+/)
    .filter(Boolean);
  const initials = parts.length >= 2 ? `${parts[0][0]}${parts[1][0]}` : base.slice(0, 2);
  return initials.toUpperCase();
}

function colorFromSeed(seed) {
  const palette = [
    ["#2f80ed", "#d7ebff"],
    ["#1d8a70", "#daf3ea"],
    ["#a56510", "#f7e2c1"],
    ["#6b5dd3", "#e6e1ff"],
    ["#c2415d", "#f8dbe3"]
  ];
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
}

function generatedAvatarUrl(profile) {
  const initials = initialsFromProfile(profile);
  const [ink, background] = colorFromSeed(`${profile.name || ""}${profile.handle || ""}`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="48" fill="${background}"/><text x="48" y="56" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="34" font-weight="700" fill="${ink}">${initials}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function buildProfile(previous, codexLimit, accountResponse) {
  const override = profileOverride();
  const account = accountResponse?.account || {};
  const previousAvatar = firstUsablePrevious(previous, "avatarUrl", ["", "./avatar.svg"]) || firstUsablePrevious(previous, "avatar", ["", "./avatar.svg"]);

  const profile = {
    name:
      override.name ||
      firstUsablePrevious(previous, "name", ["Codex User"]) ||
      displayNameFromEmail(account.email) ||
      "Codex User",
    handle:
      override.handle ||
      firstUsablePrevious(previous, "handle", ["Local account"]) ||
      handleFromEmail(account.email) ||
      "Local account",
    plan:
      override.plan ||
      formatPlan(codexLimit.planType) ||
      formatPlan(account.planType) ||
      firstUsablePrevious(previous, "plan", []) ||
      "Pro",
    avatarUrl: override.avatarUrl || previousAvatar || ""
  };

  if (!profile.avatarUrl) profile.avatarUrl = generatedAvatarUrl(profile);
  profile.source = override.name || override.handle || override.avatarUrl ? "profile-json" : account.email ? "codex-account" : "fallback";
  return profile;
}

function formatCompactNumber(value) {
  if (value == null) return "--";
  if (value >= 100_000_000) return `${Math.round((value / 100_000_000) * 10) / 10}亿`;
  if (value >= 10_000) return `${Math.round((value / 10_000) * 10) / 10}万`;
  return String(value);
}

function formatDuration(seconds) {
  if (seconds == null) return "--";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins <= 0) return `${secs}秒`;
  return `${mins}分${secs}秒`;
}

function formatResetTime(epochSeconds, windowDurationMins) {
  if (!epochSeconds) return "";
  const date = new Date(epochSeconds * 1000);
  if ((windowDurationMins || 0) <= 24 * 60) {
    const hour = String(date.getHours()).padStart(2, "0");
    const minute = String(date.getMinutes()).padStart(2, "0");
    return `${hour}:${minute}`;
  }
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatWindowLabel(windowDurationMins) {
  if (windowDurationMins === 300) return "5 小时";
  if (windowDurationMins === 10080) return "1 周";
  if (windowDurationMins && windowDurationMins % 60 === 0) return `${windowDurationMins / 60} 小时`;
  return "当前窗口";
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeek(date) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = (next.getDay() + 6) % 7;
  next.setDate(next.getDate() - day);
  return next;
}

function tokenLevel(tokens) {
  if (!tokens) return 0;
  if (tokens >= 30_000_000) return 4;
  if (tokens >= 10_000_000) return 3;
  if (tokens >= 1_000_000) return 2;
  return 1;
}

function buildActivity(dailyUsageBuckets) {
  const visibleWeeks = 26;
  const today = new Date();
  const firstWeek = addDays(startOfWeek(today), -(visibleWeeks - 1) * 7);
  const buckets = new Map((dailyUsageBuckets || []).map((bucket) => [bucket.startDate, bucket.tokens]));
  const activitySeed = [];
  const activityMonths = [];
  let lastMonth = null;

  for (let column = 0; column < visibleWeeks; column += 1) {
    const week = [];
    const columnStart = addDays(firstWeek, column * 7);
    const month = columnStart.getMonth();
    if (month !== lastMonth) {
      activityMonths.push({ label: `${month + 1}月`, at: column });
      lastMonth = month;
    }

    for (let day = 0; day < 7; day += 1) {
      const current = addDays(columnStart, day);
      week.push(tokenLevel(buckets.get(formatDateKey(current)) || 0));
    }
    activitySeed.push(week);
  }

  return { activityVisibleWeeks: visibleWeeks, activityMonths, activitySeed };
}

function quotaFromWindow(window, tone) {
  if (!window) return null;
  const remainingPercent = clamp(100 - Number(window.usedPercent || 0), 0, 100);
  return {
    label: formatWindowLabel(window.windowDurationMins),
    percent: remainingPercent,
    reset: formatResetTime(window.resetsAt, window.windowDurationMins),
    tone
  };
}

function buildUsageData(rateLimitResponse, usageResponse, accountResponse) {
  const previous = readPreviousData();
  const codexLimit =
    rateLimitResponse?.rateLimitsByLimitId?.codex ||
    rateLimitResponse?.rateLimits ||
    {};
  const resetCredits = rateLimitResponse?.rateLimitResetCredits?.availableCount ?? 0;
  const quota = [
    quotaFromWindow(codexLimit.primary, "blue"),
    quotaFromWindow(codexLimit.secondary, "green"),
    {
      label: `${resetCredits} 次可用重置`,
      percent: null,
      reset: "",
      tone: "line",
      count: resetCredits
    }
  ].filter(Boolean);

  const summary = usageResponse?.summary || {};
  const activity = buildActivity(usageResponse?.dailyUsageBuckets || []);

  return {
    ...previous,
    generatedAt: new Date().toISOString(),
    source: {
      type: "codex-app-server",
      syncMode: watch ? "watch" : "once",
      pollIntervalMs: watch ? intervalMs : null
    },
    profile: buildProfile(previous, codexLimit, accountResponse),
    summary: [
      { value: formatCompactNumber(summary.lifetimeTokens), label: "累计 Token" },
      { value: formatCompactNumber(summary.peakDailyTokens), label: "峰值 Token" },
      { value: formatDuration(summary.longestRunningTurnSec), label: "最长任务" },
      { value: summary.currentStreakDays == null ? "--" : `${summary.currentStreakDays}天`, label: "当前连续" },
      { value: summary.longestStreakDays == null ? "--" : `${summary.longestStreakDays}天`, label: "最长连续" }
    ],
    quota,
    ...activity
  };
}

function writeUsageData(data) {
  const serialized = `window.CodexUsageData = ${JSON.stringify(data, null, 2)};\n`;
  mkdirSync(path.dirname(sourceDataPath), { recursive: true });
  const tmp = `${sourceDataPath}.tmp-${process.pid}`;
  writeFileSync(tmp, serialized);
  renameSync(tmp, sourceDataPath);
}

class CodexAppServerClient {
  constructor() {
    this.nextId = 1;
    this.pending = new Map();
    this.ready = false;
    this.child = null;
    this.readline = null;
    this.notificationHandler = null;
  }

  start() {
    this.child = spawn(codexBinary, ["app-server", "--stdio"], {
      stdio: ["pipe", "pipe", "pipe"]
    });

    this.readline = createInterface({ input: this.child.stdout });
    this.readline.on("line", (line) => this.handleLine(line));
    this.child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      if (!text.includes("level\":\"WARN")) process.stderr.write(text);
    });
    this.child.on("exit", () => {
      for (const { reject } of this.pending.values()) reject(new Error("app-server exited"));
      this.pending.clear();
    });
  }

  handleLine(line) {
    if (!line.trim()) return;
    let message;
    try {
      message = JSON.parse(line);
    } catch (error) {
      process.stderr.write(`Ignored non-JSON app-server line: ${line}\n`);
      return;
    }

    if (message.id != null && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
      return;
    }

    if (message.method && this.notificationHandler) this.notificationHandler(message);
  }

  request(method, params) {
    const id = this.nextId;
    this.nextId += 1;
    const payload = params === undefined ? { id, method } : { id, method, params };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.child.stdin.write(`${JSON.stringify(payload)}\n`);
    });
  }

  async optionalRequest(method, params) {
    try {
      return await this.request(method, params);
    } catch (_) {
      return null;
    }
  }

  notify(method, params) {
    const payload = params === undefined ? { method } : { method, params };
    this.child.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  async initialize() {
    this.start();
    await this.request("initialize", {
      clientInfo: { name: "codex-usage-panel-skill-sync", version: "0.1.0" },
      capabilities: {
        experimentalApi: true,
        optOutNotificationMethods: [
          "thread/started",
          "thread/status/changed",
          "thread/tokenUsage/updated",
          "item/started",
          "item/completed"
        ]
      }
    });
    this.notify("initialized");
    this.ready = true;
  }

  async readUsage() {
    const [rateLimits, usage, account] = await Promise.all([
      this.request("account/rateLimits/read"),
      this.request("account/usage/read"),
      this.optionalRequest("account/read", {})
    ]);
    return { rateLimits, usage, account };
  }

  close() {
    this.readline?.close();
    this.child?.stdin.end();
    this.child?.kill("SIGTERM");
  }
}

async function syncOnce(client) {
  const { rateLimits, usage, account } = await client.readUsage();
  const data = buildUsageData(rateLimits, usage, account);
  writeUsageData(data);
  return data;
}

async function runOnce() {
  const client = new CodexAppServerClient();
  await client.initialize();
  try {
    const data = await syncOnce(client);
    console.log(`Synced Codex usage at ${data.generatedAt}`);
  } finally {
    client.close();
  }
}

async function runWatch() {
  let client = null;
  let timer = null;
  let syncing = false;
  let queued = false;

  const sync = async () => {
    if (!client?.ready) return;
    if (syncing) {
      queued = true;
      return;
    }
    syncing = true;
    try {
      const data = await syncOnce(client);
      console.log(`Synced Codex usage at ${data.generatedAt}`);
    } catch (error) {
      console.error(`Sync failed: ${error.message}`);
    } finally {
      syncing = false;
      if (queued) {
        queued = false;
        sync();
      }
    }
  };

  const connect = async () => {
    client = new CodexAppServerClient();
    client.notificationHandler = (message) => {
      if (message.method === "account/rateLimits/updated") sync();
    };
    await client.initialize();
    await sync();
    timer = setInterval(sync, intervalMs);
    client.child.on("exit", () => {
      clearInterval(timer);
      client = null;
      setTimeout(() => {
        connect().catch((error) => console.error(`Reconnect failed: ${error.message}`));
      }, 5000);
    });
  };

  await connect();

  const shutdown = () => {
    clearInterval(timer);
    client?.close();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

if (watch) {
  runWatch().catch((error) => {
    console.error(error);
    process.exit(1);
  });
} else {
  runOnce().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
