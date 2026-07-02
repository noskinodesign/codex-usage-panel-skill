# GitHub Launch Plan

Use this checklist to make the project easy to understand, install, and star.

## Reference Style

Inspired by `zarazhangrui/follow-builders`:

- Clear language switch at the top
- Strong opinionated title
- Short philosophy statement
- "What You Get" before implementation details
- Conversational Quick Start
- No-config / no-key promise when true
- Plain-English customization section
- Practical Privacy section

## Repository Settings

- Repository name: `codex-usage-panel-skill`
- Description: `Codex usage, not guesswork — a local real-time usage dashboard packaged as a Codex Skill.`
- Website: leave empty at first, or use the repository URL
- Topics:
  - `codex`
  - `codex-skill`
  - `codex-usage`
  - `usage-dashboard`
  - `token-usage`
  - `rate-limits`
  - `macos`
  - `local-first`

## Before Publishing

- Confirm repository links use your GitHub username
- Confirm `docs/assets/preview.png` looks good
- Run:

```bash
node --check scripts/install-panel.mjs
node --check scripts/sync-usage.mjs
node --check assets/panel/panel.js
node --check scripts/package-skill.mjs
node scripts/package-skill.mjs
```

- Create a GitHub release named `v0.1.0`
- Attach `dist/codex-usage-panel-skill.zip` to the release

## Install Copy

```bash
git clone https://github.com/noskinodesign/codex-usage-panel-skill.git ~/.codex/skills/codex-usage-panel
```

Then ask Codex:

```text
Use $codex-usage-panel to install and open a local Codex usage dashboard.
```

## Suggested Launch Copy

I built a local Codex usage panel as a shareable Codex Skill.

Philosophy: Codex usage, not guesswork. Keep your limits visible, so you can plan the work instead of discovering quota surprises mid-task.

It shows remaining usage, reset times, Token activity, lifetime tokens, peak token day, task duration, and streaks in a compact dashboard. It syncs locally from the Codex desktop app-server about every 10 seconds. No backend, no analytics, no API key.

Repo: https://github.com/noskinodesign/codex-usage-panel-skill

## 中文首发文案

我做了一个本地 Codex 用量面板，并封装成可分享的 Codex Skill。

理念：看得见的 Codex 用量，而不是靠猜。把额度、重置时间和 Token 活动放在工作流旁边，长任务开始前就知道自己还有多少空间。

它可以显示剩余用量、重置时间、Token 活动热力图、累计 Token、峰值 Token、最长任务和连续使用天数。数据从 Codex 桌面端本地 app-server 读取，约 10 秒同步一次。没有后端，没有分析统计，也不需要 API key。

仓库： https://github.com/noskinodesign/codex-usage-panel-skill

## Star-Friendly README Checklist

- First screen says exactly what the project does
- The title has a point of view
- Preview screenshot is visible near the top
- Install path is one clone command
- Quick Start explains what the agent does
- Privacy claim is specific
- Limitations are honest
- Release zip exists for non-technical users
