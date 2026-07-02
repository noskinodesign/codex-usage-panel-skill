# Contributing

Thanks for helping improve Codex Usage Panel Skill.

## Good First Issues

- Improve install diagnostics
- Add screenshots for different panel widths
- Add support for more Codex installation paths
- Improve the collapsed panel view
- Add a lightweight uninstall command

## Development

Install the skill locally:

```bash
rsync -a --delete ./ ~/.codex/skills/codex-usage-panel/ \
  --exclude .git \
  --exclude dist
node ~/.codex/skills/codex-usage-panel/scripts/install-panel.mjs --open
```

Validate scripts:

```bash
node --check scripts/install-panel.mjs
node --check scripts/sync-usage.mjs
node --check assets/panel/panel.js
node --check scripts/package-skill.mjs
```

Package a release:

```bash
node scripts/package-skill.mjs
```

Please avoid committing personal usage data, local logs, generated LaunchAgent files, or machine-specific paths.
