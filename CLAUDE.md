# Quire Anywhere

Chrome extension that adds tasks to Quire.io from the current page, a link, or a Google Docs selection.

General working style, git, and model rules live in `~/.claude/CLAUDE.md` (the claude-config repo).

## Layout
- `app/` is the extension root (load unpacked from here). Manifest V3: module service worker, `action`, content script on Google Docs.
- `app/views/` (popup, settings, links dialog, background) is UI; `app/modules/` holds services (`api.*`, `login.*`,
  `chrome.service.js`, `translation.*`, `update.service.js`), storage (`storage.service.js`), and site-specific extraction
  (`content.utils.js`, `links.collector.js`, `google.docs.utils.js`); `app/models/` holds data models; `app/scripts/content.js` is the
  content-script entry point.
- `app/libraries/` is vendored third-party code (jQuery, Bootstrap, Font Awesome). Never edit it.
- `quire-anywhere/` is the PHP OAuth relay hosted on zicy.net. `app.secret.php` holds the client secret and is gitignored; never read,
  print, or commit it.
- No build step, package manager, or test suite. Verify by reloading the unpacked extension in `chrome://extensions`.

## Core rules
- Deferred work goes in `tmp/TODO.md` (untracked).
- Prefer Chrome APIs, Quire's API, and the vendored libraries over custom code.
- Preserve the architecture split:
  - UI (`views/`): popup, settings page, context-menu entry points; presentation state only.
  - Services (`modules/`): Quire API client, login/OAuth, metadata extraction, task-creation logic.
  - Storage: everything that touches `chrome.storage`/`localStorage` goes through `StorageService`.
  - Content scripts do extraction only; no API calls or tokens.
- Keep remembered preferences (`storage.sync`), device-local settings and tokens (`storage.local`), and transient popup state separate.
- Least privilege: request the minimum permissions and host permissions; prefer `activeTab` over broad host access. No remote code.
- Keep Quire tokens and the client secret out of logs, content scripts, and the repo; handle auth failure, token refresh, and rate limits
  explicitly.
- Favor low-friction capture: one-click or keyboard-first add, sensible defaults (last-used project), no required fields.
- Prefer small adapter-style modules for extracting from specific site types (like `google.docs.utils.js`) over hardwired branching.
- Versions in `app/manifest.json`: right after a release, bump `version` to the next one and set `version_name` to "Beta x.y.z-dev";
  when releasing, drop the `-dev`.

## Model
- Pinned in `.claude/settings.json`: Sonnet, medium effort.

## Workflow
- Always target the fork `joshg253/quire-anywhere` (issues, PRs, `gh api`); pass `-R joshg253/quire-anywhere` since `gh` defaults to upstream.
  Ignore `hunterwilhelm/quire-anywhere` unless I mention upstream.
- Main branch is `develop`. Feature work goes on `feature/<name>` branches.
- Leave changes in the working tree until I've tested them and say push.
- On push: run the checklist, then commit. Checklist: state what to check manually in the reloaded extension, then update docs (README,
  CLAUDE.md if rules or layout changed, comments describing changed behavior) and `tmp/TODO.md`.
- These steps are enforced by hooks in `.claude/settings.json` (`.claude/hooks/`): `git push` and `gh pr create` are blocked until the
  command ends with `# checklist-done`, and `gh pr create` then reminds you to process review comments. Don't append the marker until the
  checklist is actually done.
- Sourcery posts review comments on PRs here.
- Docs-only changes (and supplemental scripts) go straight to `develop` with no PR.
- Update `README.md` for user-visible changes.
- Upstream's Vercel OAuth relay change (`upstream/develop`) is on hold: don't merge or fast-forward it until zicy.net login breaks or the
  extension needs an update.

## Review rules
This project uses the global independent review (`pr-review` skill). The reviewer checks the diff against the Core rules above, chiefly:
least privilege (minimum permissions and host permissions), token and client-secret handling, content scripts do extraction only, no
remote code, and all storage access through `StorageService`.
