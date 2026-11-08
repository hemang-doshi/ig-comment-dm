<div align="center">

# Comment to DM

**Self-hosted Instagram comment-to-DM automation.**
Someone comments `GUIDE` on your reel and the link lands in their DMs about two seconds later. It runs on your own Cloudflare account, on the free plan, through Meta's official API.

[![CI](https://img.shields.io/github/actions/workflow/status/hemang-doshi/ig-comment-dm/ci.yml?branch=master&label=CI&logo=githubactions&logoColor=white)](https://github.com/hemang-doshi/ig-comment-dm/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/hemang-doshi/ig-comment-dm?sort=semver&logo=github)](https://github.com/hemang-doshi/ig-comment-dm/releases)
[![MIT License](https://img.shields.io/github/license/hemang-doshi/ig-comment-dm?color=blue)](LICENSE)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers%20%2B%20D1-F38020?logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/workers/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](tsconfig.json)
[![Cost: $0](https://img.shields.io/badge/hosting-%240%20%2F%20month-2ea44f)](#what-it-costs)
[![GitHub stars](https://img.shields.io/github/stars/hemang-doshi/ig-comment-dm?style=flat&logo=github)](https://github.com/hemang-doshi/ig-comment-dm/stargazers)

**[Quick start](#quick-start) · [Docs](https://hemang-doshi.github.io/ig-comment-dm/docs/) · [Dashboard](#the-dashboard) · [Troubleshooting](https://hemang-doshi.github.io/ig-comment-dm/docs/troubleshooting/) · [Contributing](CONTRIBUTING.md)**

</div>

---

## Why

Hosted "comment for the link" tools cost $15 to $99 a month. They keep an access token to your Instagram account on their servers, next to every other customer's, and your followers' messages pass through them. They also miss comments: Instagram quietly drops webhooks for collapsed and low-signal comments, and a tool that relies on webhooks alone never sees those.

This project runs the same automation in **your** Cloudflare account instead. It uses no scraping, no browser automation and no password, and it costs nothing.

## Features

- **Keyword rules per reel, or for all posts.** Match whole words or anywhere in a comment (good for hashtags like `#launch2026`). Any script works, and case, emoji, punctuation and Latin accents are ignored, so `preco` matches `PREÇO`.
- **Exclusions per rule.** "How much is the guide?" won't use up that comment's one DM.
- **Reply to every comment** on a post, no keyword needed, for giveaways and waitlists.
- **`{username}` in messages, and random public replies**, so the thread doesn't look automated.
- **Never misses a comment.** Meta webhooks give instant delivery. A five-minute backup sweep re-reads the last 72 hours and catches whatever Instagram didn't send.
- **Never DMs anyone twice.** Each comment is claimed in the database before anything is sent, and Instagram allows only one private reply per comment.
- **Rate-limit aware.** When Meta's hourly app allowance runs out, the queue pauses and resumes on its own. The newest commenters go first, comments close to Instagram's 7-day cutoff jump the line, and nobody is dropped because of a limit.
- **Exact reasons, not "failed".** Every comment that didn't get a DM shows Meta's real answer in plain English: already answered, user can't be found, comment deleted, limit hit and so on. Each one says what to do next and gives Meta's error code.
- **A real dashboard** (below), installable on your phone.
- **Both Meta logins.** Works with **Unified login** (Facebook Login for Business, the only option for Meta apps created since late October 2026) and with classic Instagram Login.
- **Several Instagram accounts** per deployment.

## The dashboard

A fast React app served by the same Worker, behind your secret admin URL and password.

| Page | What it does |
|---|---|
| **Overview** | A single status line (live, catching up or paused), today's numbers, a 24-hour chart, an on/off switch per automation and the latest comments. |
| **Activity** | Every keyword comment and what happened to it, with filters, search and counts. Open one to see the exact reason, what to do, and a **Check again now** button that can never send twice. |
| **Automations** | A card per reel with its thumbnail and stats. The editor has a post picker with thumbnails, keyword chips, a DM editor with link detection, public replies, a live phone preview and a "try a comment" box that runs the same matcher the Worker uses. |
| **Settings** | Your Instagram connection, health for each of the three ways comments arrive, Meta's hourly allowance meter, a live feed of what Instagram is sending, and the theme. |

It has light and dark themes, a phone layout with bottom tabs, a <kbd>⌘K</kbd> command palette, and the shortcuts <kbd>N</kbd> (new automation) and <kbd>G</kbd> <kbd>A</kbd> (Activity). The classic server-rendered admin pages are still there too.

## How it works

```
someone comments "guide"
          │
          ▼
Meta webhook (signed) ───▶ your Worker ◀─── backup sweep every 5 minutes
                                │
                 claim the comment in D1, match your rules
                                │
                                ▼
         one private DM, now or from the queue (newest first)
                                │
                                ▼
                     an optional public reply
```

- **Two ways in:** a signed webhook, plus a sweep that reads the last 72 hours of comments on your newest posts. Both claim the comment with `INSERT … ON CONFLICT DO NOTHING` before sending.
- **One attempt per DM call.** If Instagram's answer is lost, the comment is marked "unconfirmed" and re-checked automatically. A re-check can't double-send, because Instagram refuses a second private reply.
- **Temporary refusals** (Meta's own errors) are retried after 1, 5 and 20 minutes. Rate-limit pauses don't use up a comment's tries.
- **Security:** Instagram tokens are encrypted at rest with AES-256-GCM. The admin panel sits behind an unguessable URL plus a PBKDF2 password, with signed `SameSite=Strict` sessions, CSRF tokens and a strict CSP. See [SECURITY.md](SECURITY.md).

**Stack:** [Hono](https://hono.dev) on Cloudflare Workers, D1 (SQLite) and cron triggers, built against Graph API v23.0. The dashboard uses React 19, Vite, Tailwind CSS v4, Radix UI and TanStack Query. It has about 470 integration tests that boot the real Worker in workerd with every Meta call faked.

## Quick start

About 15 minutes, mostly in Meta's dashboard. You need:

- Node.js 22.13 or newer
- Free [Cloudflare](https://dash.cloudflare.com/sign-up) and [Meta for Developers](https://developers.facebook.com/) accounts
- An Instagram **Creator or Business** account

**1. Create a Meta app.** Choose the Instagram use case, then follow [Part 1](https://hemang-doshi.github.io/ig-comment-dm/docs/setup/#1-create-the-meta-app) of the setup guide.
- New apps use **Unified login**. You'll need the App ID, the App secret and a Facebook Login for Business **configuration id** with `instagram_basic`, `instagram_manage_comments` and `instagram_manage_messages`.
- Meta requires a business portfolio for the app.

**2. Deploy:**

```bash
git clone https://github.com/hemang-doshi/ig-comment-dm.git
cd ig-comment-dm
npm install
npx wrangler login
npm run setup
```

`setup` does the following, and is safe to re-run:
- builds the dashboard and creates the database and tables
- asks which Meta login your app uses, then for its values
- generates the other secrets and deploys
- prints your admin URL and the exact strings to paste into Meta

**3. Finish in Meta and connect your account.** Paste in the redirect URL and webhook, publish the app, then log in to your admin URL and click **Connect** ([Parts 2 and 4–6](https://hemang-doshi.github.io/ig-comment-dm/docs/setup/#2-invite-each-instagram-account-as-a-tester)).

Prefer an agent? Open the repo in Claude Code and say "set this up". A bundled skill runs the terminal side, and you keep the logins and secrets. See the [agent setup guide](https://hemang-doshi.github.io/ig-comment-dm/docs/agent-setup/).

**Updating:** run `npm run update`. It pulls the latest version, applies migrations and redeploys, and your secrets and data stay in Cloudflare. The [changelog](CHANGELOG.md) says what changed.

## What can go wrong

- **Professional accounts only.** Instagram's API doesn't work with personal accounts. Switching to Creator or Business takes a minute in the app.
- **Your Meta app has to be Live.** In Development mode Meta sends no real comment webhooks. Publishing needs no App Review while only your own accounts connect.
- **One private reply per comment, within 7 days.** If another tool (Meta Business Suite's own automations, say) already answered a comment, Instagram refuses a second one. The dashboard shows these as "Answered earlier". Turn the other tool off.
- **Meta's hourly app allowance.** New apps get roughly 200 calls per connected user per hour, measured by **time spent as well as call count**, so slow answers from Instagram during a burst use it up faster. When it runs out, the bot pauses for 15 minutes and carries on. Nothing is lost.
- **Blind spots.** Comments hidden by Instagram's Hidden Words filter never reach the API. DMs to non-followers land in Message requests.
- **Meta changes things.** It renames dashboard screens and retires login flows: Instagram Login closed to new apps in October 2026. The code pins Graph API v23.0.

## What it costs

$0. Meta doesn't charge for the API, and the Worker fits Cloudflare's free plan:

| Free-plan limit | What uses it |
|---|---|
| 100,000 Worker requests a day | One per webhook, plus dashboard calls, `/health` checks and at most 1,441 cron runs |
| 10 ms CPU per request | Why passwords use PBKDF2 at 12,000 iterations |
| 50 subrequests per run | A cron run sends at most 12 queued DMs per account |
| 5 cron triggers per account | Uses 2: the minute job and the daily job |
| D1: 100,000 rows written a day | About 13 per DM, so roughly 6,000–7,500 DMs a day |

## How you know it's working

- **Dashboard → Settings → Health:** instant delivery, backup sweep and daily check, each with its last run.
- **`/health`:** returns `200` while the database answers and both scheduled jobs run, and `503` when one stalls. Point an uptime monitor at it.
- **`npm run doctor`:** checks the live deployment's secrets, tables, accounts, rules, webhooks and cron jobs, and names the fix.
- **`npx wrangler tail`:** live logs, including Meta's rate-limit usage headers, with tokens never written.

## Development

```bash
npm install
cp .dev.vars.example .dev.vars    # fill in, or run: npm run keys
npm run db:migrate:local
npm run dev                       # Worker on http://localhost:8787
npm --prefix web run dev          # dashboard with hot reload
npm test                          # unit + integration tests
```

Agents and contributors: start with [AGENTS.md](AGENTS.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

## Credits

This project builds on **[CharanMN7/ig-comment-dm](https://github.com/CharanMN7/ig-comment-dm)** by [Charan MN](https://github.com/CharanMN7) and contributors, which is MIT-licensed. That project wrote the Worker, the queue, the security model, the setup tooling and the docs site. This repository adds:
- Meta Unified login support
- the React dashboard with exact delivery reasons
- the rate-limit-aware, newest-first queue
- automatic re-checks of unconfirmed DMs

The full history is preserved in git.

## License

[MIT](LICENSE) © Charan MN and contributors, Hemang Doshi.

Not affiliated with, endorsed by, or sponsored by Meta or Instagram. Instagram is a trademark of Meta Platforms, Inc. Use it within [Meta's Platform Terms](https://developers.facebook.com/terms/) and Instagram's community guidelines. Don't spam people.
