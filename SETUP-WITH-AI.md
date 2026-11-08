# Setting this up for someone (instructions for AI agents)

You are an AI agent (Claude Code, Codex, Cursor, Gemini CLI, or any agent with a terminal) and someone gave you this repository's link and asked you to set it up. They are probably a creator, not a developer. Your job is to do **everything you can yourself**, and stop only for the few things that must be theirs: logins, approvals, and copying three values out of Meta's dashboard into a private page on their own computer.

Read this whole file once before you start. Then follow it in order. Keep the person informed in plain, friendly language, with no jargon. Tell them what's happening and what you need from them, one thing at a time.

## What they end up with

Their own Instagram comment-to-DM bot, running free on their own Cloudflare account. Someone comments a keyword on their reel and gets a DM with their link. They manage it from a private dashboard.

## Hard rules

1. **No secret ever goes through this chat.** Never ask the person to paste an App secret, a token, a password or their dashboard link to you. Never read one off their screen, and never click **Show** next to a secret. Secrets go only into the private setup page that `npm run setup:agent` opens on their computer. If one lands in the chat anyway, tell them to reset it. (For the App secret: Meta → App settings → Basic → Reset. Then run `npm run setup:agent -- --rotate`.)
2. **The person does every login and every "Allow".** That covers Cloudflare, Facebook, Instagram, 2FA codes and CAPTCHAs. When you reach one, stop, tell them exactly what to click, and wait.
3. **Ask before anything that grants access or publishes.** Adding roles, publishing the Meta app and connecting their Instagram are their clicks, or yours only after they say yes.
4. **Never create accounts for them.** Never submit the app for Meta's App Review: it isn't needed.
5. **If a Meta screen doesn't match this guide, stop and describe what you see.** Meta renames screens often. Don't guess with a similar-looking setting.
6. **Everything here is safe to re-run.** If anything stops, fix the cause and run the same step again. `npm run doctor` shows what's done and what's missing.

## Step 0: Tell them what to expect

Say something like:

> I'll set up your comment-to-DM bot. It takes about 15 minutes. I'll do the technical parts. I'll need you for a few clicks: logging in to Cloudflare and Facebook, and copying three values from Meta into a private page that opens on your computer. You'll need an Instagram **Creator or Business** account. If yours is personal, switch it in the Instagram app: Settings → Account type and tools → Switch to professional account.

## Step 1: Get the code ready (you)

1. Check Node.js: `node --version` must be **22.13 or newer**.
   - If it's missing or older, offer to install the current LTS: `brew install node` on macOS, `winget install OpenJS.NodeJS.LTS` on Windows, or nvm on Linux. Ask before installing.
2. Clone it with `git clone https://github.com/hemang-doshi/ig-comment-dm.git`, then `cd ig-comment-dm`.
   - With no git, download `https://github.com/hemang-doshi/ig-comment-dm/archive/refs/heads/master.zip` and unzip it.
3. Run `npm install`.

## Step 2: Start setup (you), and let it wait for them

Run this from the repo folder **in the background** (it waits for the person, sometimes for many minutes):

```bash
npm run setup:agent
```

Watch its output. It prints plain progress lines plus a few special lines that are meant for you:

| Line | What you do |
|---|---|
| `ACTION REQUIRED: Cloudflare login…` | A browser tab opened. Tell them: "Sign in to Cloudflare, or create a free account, then click **Allow**." If it says the account has no workers.dev subdomain, ask them to open dash.cloudflare.com → **Workers & Pages** once, then re-run. |
| `ACTION REQUIRED: a private setup page opened…` | Tell them: "A page called *Comment to DM · private setup* opened in your browser. Keep it open. We'll fill it in together in a minute." It's on 127.0.0.1, only on their computer. |
| `WAITING for the person to paste their Meta app details…` | Do Step 3 now if you haven't already. |
| `ACTION REQUIRED: the setup page now shows…their private dashboard link` | Tell them: "Your bot is live! Save the dashboard link on that page, in your password manager or bookmarks, then click **Done**." |
| `SETUP_RESULT {…}` | Setup has finished. The JSON includes `workerUrl` (public, fine to use) and `remaining` (what's left). Go to Step 4. |

If it stops with `Stopped.` and a reason, explain the reason simply, fix it, and run `npm run setup:agent` again.

## Step 3: Create the Meta app (them clicking, you guiding)

Do this while setup runs. If you can control a browser (for example Claude in Chrome or a browser MCP), open the pages and do the clicking yourself, and stop at logins and secrets. If you can't, give them one instruction at a time and wait for "done".

1. **Developer account.** Open https://developers.facebook.com/apps. If they've never used it, they register as a developer (their own login, plus phone or email verification).
2. **Create the app.** Click **Create app**.
   - Name: anything, such as "Comment to DM".
   - Use case: **Manage messaging & content on Instagram**, or anything Instagram-related.
   - Business portfolio: Meta requires one. They pick theirs, or create one when Meta offers.
3. **Login configuration.** In the app, open **Use cases → Instagram API** (or **Customize**). It should say **API setup with Facebook login**, which is what Meta calls "Unified login".
   - If it says **API setup with Instagram login** instead, it's an older-style app. Choose "Instagram login" on the private page and follow the older guide: https://hemang-doshi.github.io/ig-comment-dm/docs/setup/
   - Then open **Facebook Login for Business → Configurations → Create configuration**:
     - Login variation: **General**
     - Access token: **System-user access token**, expiry **Never**
     - Assets: **Instagram accounts** only (no ad accounts, so nothing can spend money)
     - Permissions: `instagram_basic`, `instagram_manage_comments`, `instagram_manage_messages`
   - Save it.
4. **The three values.** Have them fill in the private setup page:
   - **Login configuration ID:** shown on the configuration they just made. Not secret, so you may find it for them.
   - **App ID:** the number at the top of the app dashboard. Not secret.
   - **App secret:** App settings → Basic → App secret → **Show**. Meta may ask for their Facebook password. **This one is secret.** Point them to it, and let them reveal it and paste it into the page themselves. Don't look at it.

   Then they click **Save to my Cloudflare**. Setup continues by itself. When it can, it also sets up Meta's comment webhook and fills in the app's privacy and terms links through Meta's API.

## Step 4: Finish in Meta (you, then them)

Use `workerUrl` from `SETUP_RESULT` (for example `https://ig-comment-dm.NAME.workers.dev`) and work through every item in its `remaining` list. Usually these are:

1. **Valid OAuth Redirect URIs:** Facebook Login for Business → **Settings**. Add `WORKER/connect/callback` and `WORKER/connect/callback/`, then save.
2. **App settings → Basic:** fill in any still-empty URLs: Privacy policy `WORKER/privacy`, Terms `WORKER/terms`, and Data deletion instructions `WORKER/data-deletion`. Pick a category if Meta asks, then save.
3. **Webhook:** only if `webhook` isn't `"configured"`. Go to **Use cases → Instagram API → Configure webhooks**. The callback URL is `WORKER/webhook`. The person pastes the verify token shown on their private setup page. Subscribe to **comments** with **Include values** on.
4. **Publish:** they click **Publish**, or **Go live**, in the app. Until it's live, Meta sends no real comments. No App Review is needed for their own account.

## Step 5: Connect Instagram and make the first automation (them, with you guiding)

1. They open the dashboard link they saved. **Don't ask them for it.** On first visit they create a dashboard password. It can't be reset by email, so they should save it.
2. They click **Connect** and approve on Facebook, choosing their Instagram account.
   - If Meta says the account isn't allowed, add it under **App roles → Roles → Instagram Testers**. They then accept it at https://www.instagram.com/accounts/manage_access/ → **Tester invites**, and try again.
3. **New automation:** they pick the reel, type the keyword (for example `GUIDE`), and write the DM with their link. The live preview shows exactly what people will get, and **Try a comment** checks the keyword match without sending anything.
4. Tell them to turn off any other comment-to-DM tool on the same account, **including Meta Business Suite automations**. Instagram allows only one private reply per comment, and the first tool to answer wins.

## Step 6: Check it works (you)

- `curl -s WORKER/health` should show `"ok": true`.
- `npm run doctor` explains anything missing, with the fix.
- Live test: they comment the keyword on their reel **from a different Instagram account** (their own comments are ignored on purpose). The DM arrives within seconds. The dashboard's **Activity** page shows every comment, plus the exact reason when a DM didn't go.

When it works, congratulate them, and remind them:
- keep the dashboard link and password private
- update later with `npm run update`
- the full docs are at https://hemang-doshi.github.io/ig-comment-dm/docs/

## If something goes wrong

- Re-run the step. Everything is idempotent.
- `npm run doctor` names the problem and the fix.
- Troubleshooting by symptom: https://hemang-doshi.github.io/ig-comment-dm/docs/troubleshooting/
- Still stuck: open an issue at https://github.com/hemang-doshi/ig-comment-dm/issues with what you tried (never secrets).
