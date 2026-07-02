# Changelog

## 0.1.5 - 2026-07-02

- Stop existing panel LaunchAgents before selecting a port, avoiding accidental fallback to a new port during reinstall
- Keep the previous dashboard port as a macOS compatibility alias when the active port changes
- Added `--alias-port` / `--alias-ports` for explicit old-link compatibility
- Disable early prototype `com.lukeji.codex-usage-panel-*` LaunchAgents during install, with `--keep-legacy-launch-agents` as an escape hatch

## 0.1.4 - 2026-07-02

- Let `--profile-avatar` accept local image files and copy them into the installed panel assets
- Documented local avatar file setup for exact profile display

## 0.1.3 - 2026-07-02

- Bumped dashboard asset cache keys so upgraded installs load the latest profile renderer immediately

## 0.1.2 - 2026-07-02

- Added local Codex account metadata sync through `account/read`
- Derived a personalized display name, handle, and initials avatar when ChatGPT nickname/avatar are not exposed locally
- Added `~/.codex-usage-panel/profile.json` and installer flags for exact profile name, handle, and avatar overrides
- Updated the panel renderer to use synced `profile.avatarUrl`

## 0.1.1 - 2026-07-02

- Added optional Codex `SessionStart` hook installer for auto-opening the usage panel in new or resumed conversations
- Documented how to enable and remove auto-open behavior
- Included the auto-open hook installer in the release zip

## 0.1.0 - 2026-06-30

- Initial shareable Codex Skill release
- Local dashboard with profile, remaining usage, token activity, and summary stats
- Near-real-time sync from the Codex desktop app server
- macOS LaunchAgent installer
- Automatic fallback when the default local port is busy
- Root-level Skill repository layout for direct `git clone` installation
