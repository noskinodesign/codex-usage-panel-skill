---
name: codex-usage-panel
description: Install, open, repair, or package a shareable local Codex usage dashboard Skill. Use when the user wants a visual Codex usage panel, Token activity heatmap, remaining usage progress bars, near-real-time Codex app-server sync, a localhost dashboard, a macOS launch agent setup, or a shareable Skill package for other Codex users.
---

# Codex Usage Panel

## Quick Start

Use the bundled installer whenever the user asks to install, open, repair, or share the panel:

```bash
node <skill-dir>/scripts/install-panel.mjs --open
```

The installer copies the dashboard to `~/.codex-usage-panel`, starts a local web server at
`http://127.0.0.1:8765/index.html`, and starts a sync service that refreshes Codex account usage
about every 10 seconds.

## What This Skill Provides

- A compact local dashboard with profile, remaining usage progress bars, Token activity, and summary stats.
- A sync script that reads Codex desktop app-server methods `account/rateLimits/read`, `account/usage/read`, and local account metadata when available.
- macOS LaunchAgents for a persistent local web server and a persistent usage sync process.
- An optional SessionStart hook installer that opens the panel when Codex starts or resumes a conversation.
- A shareable Skill folder: zip the whole `codex-usage-panel` directory and have another user unzip it into `~/.codex/skills/`.

## Common Tasks

Install or repair the local panel:

```bash
node <skill-dir>/scripts/install-panel.mjs
```

Install and open it:

```bash
node <skill-dir>/scripts/install-panel.mjs --open
```

Use a custom port when `8765` is already taken:

```bash
node <skill-dir>/scripts/install-panel.mjs --port 8876 --open
```

Keep an old dashboard link working after changing ports:

```bash
node <skill-dir>/scripts/install-panel.mjs --port 8765 --alias-port 8766 --open
```

Set the displayed profile during install:

```bash
node <skill-dir>/scripts/install-panel.mjs --profile-name "Luke_Ji" --profile-handle "@jasondongsheng" --profile-avatar "https://example.com/avatar.png" --open
```

`--profile-avatar` can be an `https://` image URL or a local image path. Local files are copied
into the installed panel assets folder and served from `127.0.0.1`.

Or edit the installed local profile override:

```json
{
  "name": "Luke_Ji",
  "handle": "@jasondongsheng",
  "avatarUrl": "https://example.com/avatar.png"
}
```

Save it as `~/.codex-usage-panel/profile.json`, then run one manual sync.

If no custom port is provided and `8765` is busy, the installer automatically chooses the next
available local port near `8765` and prints the final dashboard URL.
On macOS, when a previous install used a different port, the installer keeps that old port as a
compatibility alias so old Codex conversation links still open the current panel.

Run one manual sync after install:

```bash
node ~/.codex-usage-panel/scripts/sync-usage.mjs --root ~/.codex-usage-panel
```

Enable auto-open in new Codex conversations:

```bash
node <skill-dir>/scripts/install-auto-open-hook.mjs
```

Remove auto-open:

```bash
node <skill-dir>/scripts/install-auto-open-hook.mjs --remove
```

Check service health on macOS:

```bash
launchctl print gui/$(id -u)/com.codex.usage-panel.server
launchctl print gui/$(id -u)/com.codex.usage-panel.sync
```

## Notes For Agents

- Prefer the installer instead of hand-editing LaunchAgents.
- Prefer `scripts/install-auto-open-hook.mjs` instead of hand-editing `~/.codex/hooks.json`.
- If `http://127.0.0.1:8765/index.html` is unreachable, rerun the installer.
- If Codex usage values do not update, inspect `/tmp/codex-usage-panel-sync.err.log` and confirm `/Applications/Codex.app/Contents/Resources/codex` exists.
- Codex currently exposes account email and plan to the local app-server, but not the ChatGPT avatar or display nickname. The sync script derives a local profile from the account email and supports `~/.codex-usage-panel/profile.json` for exact name/avatar overrides.
- The installer disables legacy `com.lukeji.codex-usage-panel-*` LaunchAgents from the early plugin prototype unless `--keep-legacy-launch-agents` is passed.
- The dashboard is a local browser panel. Codex does not currently support injecting this HTML into every conversation body automatically; the auto-open hook opens the panel URL on session start instead.
