**English** | [中文](README.zh-CN.md)

# Codex Usage, Not Guesswork

A local Codex Skill that turns your Codex remaining usage, reset times, token
activity, and streaks into a compact dashboard you can keep open while working.

**Philosophy:** Keep your limits visible, so you can plan the work instead of
discovering quota surprises in the middle of a long task.

![Codex Usage Panel preview](docs/assets/preview.png)

## What You Get

A local dashboard for Codex with:

- Remaining usage for the current short window and weekly window
- Progress bars and reset times that match Codex's local usage data
- A 26-week Token activity heatmap
- Lifetime tokens, peak token day, longest task, and streak stats
- One-click refresh and a compact collapsed view
- Optional auto-open hook for new Codex conversations
- English and Chinese docs

## Quick Start

1. Install the skill in Codex
2. Say "install Codex usage panel" or invoke `$codex-usage-panel`
3. The agent installs the dashboard conversationally — no config files to edit

The agent will:
- Copy the panel to `~/.codex-usage-panel`
- Start a local dashboard server
- Start a background usage sync process
- Open the panel at `http://127.0.0.1:8765/index.html`

No API keys needed. Your first sync runs immediately after setup.

## Changing Settings

The panel can be managed through conversation. Just tell Codex:

- "Open my Codex usage panel"
- "Repair the usage panel"
- "Use port 8876"
- "Refresh usage data"
- "Auto-open the panel in new conversations"
- "Package this skill for sharing"

If port `8765` is busy, the installer automatically chooses a nearby available
port and prints the final dashboard URL.

## Auto-Open in New Conversations

Codex does not currently have a built-in setting that pins a custom HTML panel
inside every conversation. This skill includes a local `SessionStart` hook that
gets you close: when Codex starts or resumes a conversation, the hook opens the
usage panel URL in Codex.

Enable it:

```bash
node ~/.codex/skills/codex-usage-panel/scripts/install-auto-open-hook.mjs
```

Remove it:

```bash
node ~/.codex/skills/codex-usage-panel/scripts/install-auto-open-hook.mjs --remove
```

The first time the hook runs, Codex may ask you to review and trust it. The hook
only opens `http://127.0.0.1:8765/index.html`.

## Customizing the Panel

You can customize it two ways:

**Through conversation (recommended):**
Tell Codex what you want — "Make it more compact", "show only 3 months",
"change the accent color", or "hide streak stats". Codex can edit the panel for you.

**Direct editing (power users):**
Edit the files in `assets/panel/`:
- `index.html` — panel structure
- `panel.css` — layout and visual style
- `panel.js` — refresh, collapse, heatmap, and rendering logic
- `usage-data.js` — sample fallback data, overwritten by sync after install

Changes take effect after reinstalling or reloading the local panel.

## Default Views

### Remaining Usage

Shows the current short-window quota, weekly quota, reset credits, progress bars,
and reset times.

### Token Activity

Shows 26 weeks of daily Token activity as a compact heatmap, with daily, weekly,
and cumulative display modes.

### Token Summary

Shows lifetime tokens, peak token day, longest task, current streak, and longest
streak.

See [examples/sample-panel.md](examples/sample-panel.md) for a quick output tour.

## Installation

### Codex

```bash
git clone https://github.com/noskinodesign/codex-usage-panel-skill.git ~/.codex/skills/codex-usage-panel
```

Then open Codex and say:

```text
Use $codex-usage-panel to install and open a local Codex usage dashboard.
```

You can also run the installer directly:

```bash
node ~/.codex/skills/codex-usage-panel/scripts/install-panel.mjs --open
```

### Release Zip

Download `codex-usage-panel-skill.zip` from GitHub Releases, then:

```bash
mkdir -p ~/.codex/skills
unzip codex-usage-panel-skill.zip -d ~/.codex/skills
```

## Requirements

- macOS
- Codex desktop app installed
- Node.js

That's it. No external account, cloud backend, or usage API key required.

## How It Works

1. The installer copies the dashboard to `~/.codex-usage-panel`
2. A local server serves the HTML panel on `127.0.0.1`
3. A sync process reads Codex desktop app-server usage data every 10 seconds
4. The panel reloads the local `usage-data.js` file and updates itself

The sync process reads local Codex app-server methods such as
`account/rateLimits/read` and `account/usage/read`.

## Privacy

- No API keys are required
- No external analytics
- No usage data is uploaded by this project
- No account credentials are stored by this project
- Usage data stays on your machine in `~/.codex-usage-panel`

## Limitations

Codex does not currently support injecting a custom HTML panel into every
conversation body. The recommended setup is to keep the panel open in the Codex
side browser, use the included auto-open hook, or keep it in a small browser
window.

## License

MIT
