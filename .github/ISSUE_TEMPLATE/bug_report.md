---
name: Bug report
about: Report a problem with installing or running the panel
title: ""
labels: bug
assignees: ""
---

## What happened?


## Expected behavior


## Environment

- macOS version:
- Codex app version:
- Node version:

## Diagnostics

```bash
curl -I http://127.0.0.1:8765/index.html
launchctl print gui/$(id -u)/com.codex.usage-panel.server
launchctl print gui/$(id -u)/com.codex.usage-panel.sync
```
