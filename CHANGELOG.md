# Changelog

The full changelog, with what to do when upgrading to each version, is on the docs site:
**[hemang-doshi.github.io/ig-comment-dm/docs/changelog](https://hemang-doshi.github.io/ig-comment-dm/docs/changelog/)**.

Its source is `site/content/changelog/`, one MDX file per release. Write release notes
there; this file is only an index.

| Version | Date | In short |
|---|---|---|
| [0.7.0](https://hemang-doshi.github.io/ig-comment-dm/docs/changelog/#v0-7-0) | 2026-11-08 | Set it up by pasting the repo link into your AI agent: `npm run setup:agent`, a private local page for your Meta values, and Meta's webhook set up through the API. |
| [0.6.0](https://hemang-doshi.github.io/ig-comment-dm/docs/changelog/#v0-6-0) | 2026-11-08 | Meta Unified login for new apps, the dashboard app with exact reasons for every DM that didn't go, and a queue that waits out Meta's hourly limit without giving up. Migration 012. |
| [0.5.0](https://hemang-doshi.github.io/ig-comment-dm/docs/changelog/#v0-5-0) | 2026-10-27 | A Logs page (thanks @ranita872), DMs past 12 a minute per account wait in a queue, refusals for now are retried, and the poll reaches every post your rules cover. Migrations 010 and 011, and the cron runs every minute. |
| [0.4.0](https://hemang-doshi.github.io/ig-comment-dm/docs/changelog/#v0-4-0) | 2026-10-27 | Each DM and public reply is sent once, logout ends every session, and extra public replies from other matching rules. Logs you out once. |
| [0.3.0](https://hemang-doshi.github.io/ig-comment-dm/docs/changelog/#v0-3-0) | 2026-10-27 | Exclusions, match modes, reply-to-everyone rules, `{username}`, reply variations, templates, Home totals, `/health` and `npm run update`. Needs Node 22.13 and `npm run deploy`. |
| [0.2.1](https://hemang-doshi.github.io/ig-comment-dm/docs/changelog/#v0-2-1) | 2026-09-08 | Keywords match in non-Latin scripts and ignore accents on Latin letters. |
| [0.2.0](https://hemang-doshi.github.io/ig-comment-dm/docs/changelog/#v0-2-0) | 2026-08-29 | `npm run setup` and `npm run doctor`, and a hardened admin panel for a public repository. |
| [0.1.0](https://hemang-doshi.github.io/ig-comment-dm/docs/changelog/#v0-1-0) | 2026-08-16 | The first Worker that answers live comments with a DM. |
