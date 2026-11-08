---
name: setup
description: Set up someone's own copy of ig-comment-dm (Instagram comment-to-DM bot on Cloudflare) end to end, from a repo link to a first DM. Runs `npm run setup:agent`, guides the Meta app (clicking through it with Claude in Chrome when available), and stops only for logins, approvals and the private setup page. Use when the user says "set this up", "deploy this", "install it for me", pastes this repo's link, or asks for help with the Meta app or Cloudflare setup. Not for code changes; AGENTS.md covers those.
---

# Set up ig-comment-dm

Follow **[SETUP-WITH-AI.md](../../../SETUP-WITH-AI.md)** in the repo root, step by step. It's the single playbook for every agent. Read it fully before starting. Assume the person isn't technical: one plain instruction at a time.

Claude Code specifics:

- Run `npm run setup:agent` with `run_in_background`, and read its output as it goes. React to the `ACTION REQUIRED`, `WAITING` and `SETUP_RESULT` lines as the playbook says. It can wait a long time for the person. That's expected, so don't kill it.
- While it waits for the Meta values, do Step 3 of the playbook. With the Claude in Chrome tools (`mcp__claude-in-chrome__*`), click through developers.facebook.com yourself. Without them, describe each screen. Allowing developers.facebook.com for the session saves prompts. Approve actions on facebook.com login pages, instagram.com and dash.cloudflare.com one at a time.
- Never read or screenshot a page while a secret is visible on it: the App secret after **Show**, the private setup page after it shows the dashboard link, or the dashboard itself. Don't open the dashboard link yourself.
- Never type into the private setup page's secret field. You may fill in the App ID and configuration ID if you're driving the browser. The person pastes the App secret.
- Finish with `curl -s <workerUrl>/health` and `npm run doctor`, and explain every ✗ or `!` they report.
