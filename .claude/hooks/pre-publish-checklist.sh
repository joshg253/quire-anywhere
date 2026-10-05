#!/bin/bash
# Blocks `git push` and `gh pr create` until the checklist is acknowledged by adding `# checklist-done` to the command.
input=$(cat)
if [[ "$input" == *checklist-done* ]]; then
  exit 0
fi
cat >&2 <<'MSG'
Before pushing or opening a PR, confirm each item, then re-run the same command with `# checklist-done` appended:
1. README.md, CLAUDE.md (if rules or layout changed), comments describing changed behavior, and tmp/TODO.md are updated.
2. Open issues were checked (`gh issue list`); resolved ones are linked as `Fixes #n`, related ones mentioned.
3. The manual checks for the reloaded extension were stated to the user.
MSG
exit 2
