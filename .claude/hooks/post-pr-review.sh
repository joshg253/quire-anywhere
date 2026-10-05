#!/bin/bash
# After `gh pr create`, reminds Claude to work through the PR's review comments.
cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"PR opened. Now read its review comments (gh pr view <n> --comments; gh api repos/{owner}/{repo}/pulls/<n>/comments), wait briefly for bots like Sourcery if none yet, verify each against the code or live behavior, fix valid ones on the branch, reply to the rest with why not, resolve the threads, and report which was which."}}
JSON
