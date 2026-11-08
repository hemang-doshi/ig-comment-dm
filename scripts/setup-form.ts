/**
 * The private page `npm run setup -- --agent` opens in the person's own
 * browser, so an AI agent can run setup without any secret passing through
 * its chat.
 *
 * An agent reads everything a command prints. So in agent mode setup never
 * prints a secret and never reads one from the terminal. Instead it serves this
 * page on 127.0.0.1, on a random port, under a random path that only this
 * process knows, and opens it in the default browser:
 *
 *   1. The person pastes the Meta values here. They go straight from this page
 *      to `wrangler secret put`.
 *   2. The page shows progress while setup deploys.
 *   3. It shows the admin link (and, only if needed, the webhook verify token)
 *      with Copy and Open buttons. The person saves them and clicks Done.
 *
 * It listens on loopback only, accepts a POST only with the random path and
 * a same-origin Content-Type, and stops when setup ends.
 */
import { spawn } from 'node:child_process';
import { webcrypto } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

export type LoginMode = 'unified' | 'instagram';

export interface MetaValues {
  mode: LoginMode;
  configId: string;
  appId: string;
  appSecret: string;
  /** Instagram Login only: the Facebook App Secret, a different value. */
  facebookAppSecret: string;
}

export interface FormState {
  phase: 'form' | 'working' | 'secrets' | 'done' | 'error';
  steps: Array<{ label: string; state: 'done' | 'active' | 'todo' | 'failed' }>;
  error?: string;
  adminUrl?: string;
  verifyToken?: string;
  /** True when Meta's webhook was configured automatically, so the token needs no pasting. */
  webhookAutomatic?: boolean;
  workerUrl?: string;
  /** Which Meta values the page should ask for. Names already stored are skipped. */
  ask: { mode: boolean; configId: boolean; appId: boolean; appSecret: boolean; facebookAppSecret: boolean };
  presetMode?: LoginMode;
}

export interface SetupForm {
  url: string;
  /** Resolves with the values once the person submits them. */
  values: Promise<MetaValues>;
  /** Resolves when the person clicks Done after saving their links, or after `timeoutMs`. */
  acknowledged(timeoutMs: number): Promise<boolean>;
  update(patch: Partial<FormState>): void;
  close(): void;
}

const hex = (n: number): string => Buffer.from(webcrypto.getRandomValues(new Uint8Array(n))).toString('hex');

export function openInBrowser(url: string): void {
  const [cmd, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '""', url.replace(/&/g, '^&')]]
        : ['xdg-open', [url]];
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', () => undefined);
    child.unref();
  } catch {
    // The URL is printed too, so the person can open it by hand.
  }
}

function readBody(req: IncomingMessage, limit = 16_384): Promise<string> {
  return new Promise((resolveBody, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += String(chunk);
      if (body.length > limit) {
        reject(new Error('too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolveBody(body));
    req.on('error', reject);
  });
}

function send(res: ServerResponse, status: number, type: string, body: string): void {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy':
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  });
  res.end(body);
}

export function validate(input: Record<string, string>, ask: FormState['ask'], presetMode?: LoginMode): MetaValues | string {
  const mode: LoginMode = ask.mode ? (input.mode === 'instagram' ? 'instagram' : 'unified') : (presetMode ?? 'unified');
  const v = (k: string): string => (input[k] ?? '').trim();
  const values: MetaValues = {
    mode,
    configId: v('configId'),
    appId: v('appId'),
    appSecret: v('appSecret'),
    facebookAppSecret: v('facebookAppSecret'),
  };
  if (mode === 'unified' && ask.configId && !/^\d{6,}$/.test(values.configId)) {
    return 'The configuration id is a long number. Copy it from Facebook Login for Business → Configurations.';
  }
  if (ask.appId && !/^\d{6,}$/.test(values.appId)) return 'The App ID is a long number, shown at the top of your Meta app dashboard.';
  if (ask.appSecret && !/^[0-9a-f]{32}$/i.test(values.appSecret)) {
    return 'The App secret is 32 letters and numbers. In Meta: App settings → Basic → App secret → Show, then copy it.';
  }
  if (mode === 'instagram' && ask.facebookAppSecret && !/^[0-9a-f]{32}$/i.test(values.facebookAppSecret)) {
    return 'The Facebook App Secret is 32 letters and numbers, from App settings → Basic → App secret.';
  }
  return values;
}

export async function startSetupForm(initial: Pick<FormState, 'ask' | 'presetMode'>): Promise<SetupForm> {
  const token = hex(16);
  const base = `/${token}`;
  let state: FormState = { phase: 'form', steps: [], ...initial };
  let deliver: (v: MetaValues) => void = () => undefined;
  const values = new Promise<MetaValues>((r) => (deliver = r));
  let ack: () => void = () => undefined;
  const acked = new Promise<void>((r) => (ack = r));
  let submitted = false;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    // Only this process's random path answers. Anything else looks like nothing is here.
    if (url.pathname !== base && !url.pathname.startsWith(`${base}/`)) return send(res, 404, 'text/plain', 'Not found');
    const host = req.headers.host ?? '';
    if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)) return send(res, 421, 'text/plain', 'Wrong host');
    const sub = url.pathname.slice(base.length);

    if (req.method === 'GET' && (sub === '' || sub === '/')) return send(res, 200, 'text/html; charset=utf-8', page(base));
    if (req.method === 'GET' && sub === '/state') {
      const { adminUrl, verifyToken, ...rest } = state;
      // Secrets are only handed to the page in the phase that shows them.
      const visible = state.phase === 'secrets' || state.phase === 'done' ? { adminUrl, verifyToken } : {};
      return send(res, 200, 'application/json', JSON.stringify({ ...rest, ...visible }));
    }
    if (req.method === 'POST') {
      // A JSON body can't be sent cross-origin without a preflight this server never answers.
      if (!(req.headers['content-type'] ?? '').startsWith('application/json')) return send(res, 415, 'text/plain', 'JSON only');
      let body: Record<string, string>;
      try {
        body = JSON.parse(await readBody(req)) as Record<string, string>;
      } catch {
        return send(res, 400, 'application/json', JSON.stringify({ error: 'Could not read that.' }));
      }
      if (sub === '/submit') {
        if (submitted) return send(res, 409, 'application/json', JSON.stringify({ error: 'Already saved.' }));
        const result = validate(body, state.ask, state.presetMode);
        if (typeof result === 'string') return send(res, 422, 'application/json', JSON.stringify({ error: result }));
        submitted = true;
        state = { ...state, phase: 'working' };
        deliver(result);
        return send(res, 200, 'application/json', '{"ok":true}');
      }
      if (sub === '/ack') {
        state = { ...state, phase: 'done' };
        ack();
        return send(res, 200, 'application/json', '{"ok":true}');
      }
    }
    return send(res, 404, 'text/plain', 'Not found');
  });

  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  return {
    url: `http://127.0.0.1:${port}${base}`,
    values,
    acknowledged: (timeoutMs) =>
      Promise.race([acked.then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), timeoutMs).unref())]),
    update(patch) {
      state = { ...state, ...patch };
    },
    close() {
      server.closeAllConnections?.();
      server.close();
    },
  };
}

function page(base: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Comment to DM · Setup</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--fg:#0f172a;--muted:#5b6476;--line:#e4e7ec;--accent:#5b4bff;--accent-2:#e1306c;--ok:#12a150;--warn:#b54708;--bad:#d92d20;--soft:#f1f3f7;--ring:rgba(91,75,255,.25)}
@media (prefers-color-scheme:dark){:root{--bg:#0b0d12;--card:#141821;--fg:#eef1f6;--muted:#9aa3b5;--line:#252b38;--soft:#1b202b;--ring:rgba(140,128,255,.35)}}
*{box-sizing:border-box}html,body{margin:0}body{background:var(--bg);color:var(--fg);font:15px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
main{max-width:640px;margin:0 auto;padding:40px 16px 64px}
.brand{display:flex;align-items:center;gap:10px;font-weight:650;margin-bottom:22px}
.logo{width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,#feda75,#fa7e1e 30%,#d62976 60%,#962fbf 85%,#4f5bd5);display:grid;place-items:center;color:#fff;font-size:17px}
h1{font-size:26px;line-height:1.2;margin:0 0 6px;letter-spacing:-.01em}.lede{color:var(--muted);margin:0 0 24px}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:22px;box-shadow:0 1px 2px rgba(16,24,40,.04)}
.card+.card{margin-top:14px}
label{display:block;font-weight:600;margin:18px 0 6px}label:first-child{margin-top:0}
.hint{color:var(--muted);font-size:13px;margin:-2px 0 8px}
input[type=text],input[type=password]{width:100%;padding:11px 12px;border:1px solid var(--line);border-radius:10px;background:var(--soft);color:var(--fg);font:inherit;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:14px}
input:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 4px var(--ring)}
.seg{display:grid;grid-template-columns:1fr 1fr;gap:6px;background:var(--soft);padding:5px;border-radius:12px}
.seg label{margin:0;font-weight:550;text-align:center;padding:9px 8px;border-radius:9px;cursor:pointer;color:var(--muted);font-size:14px}
.seg input{position:absolute;opacity:0;pointer-events:none}.seg input:checked+span{color:var(--fg)}
.seg label:has(input:checked){background:var(--card);color:var(--fg);box-shadow:0 1px 3px rgba(16,24,40,.12)}
.seg small{display:block;font-weight:400;font-size:12px;color:var(--muted)}
button{appearance:none;border:0;border-radius:11px;padding:12px 18px;font:inherit;font-weight:650;cursor:pointer;background:var(--accent);color:#fff;width:100%;margin-top:22px;transition:transform .05s,filter .15s}
button:hover{filter:brightness(1.07)}button:active{transform:translateY(1px)}button[disabled]{opacity:.6;cursor:default}
button.ghost{background:var(--soft);color:var(--fg);width:auto;margin:0;padding:9px 14px;font-weight:600;font-size:14px}
.err{color:var(--bad);font-size:14px;margin-top:12px;min-height:1px}
.lock{display:flex;gap:10px;align-items:flex-start;color:var(--muted);font-size:13px;margin-top:16px}
ol.steps{list-style:none;padding:0;margin:0}ol.steps li{display:flex;gap:12px;align-items:center;padding:9px 0;color:var(--muted)}
.dot{width:22px;height:22px;border-radius:50%;border:2px solid var(--line);flex:none;display:grid;place-items:center;font-size:12px;color:#fff}
li.done .dot{background:var(--ok);border-color:var(--ok)}li.done{color:var(--fg)}
li.active .dot{border-color:var(--accent);border-top-color:transparent;animation:spin 0.9s linear infinite}li.active{color:var(--fg);font-weight:600}
li.failed .dot{background:var(--bad);border-color:var(--bad)}
@keyframes spin{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){li.active .dot{animation:none}}
.secret{display:flex;gap:8px;align-items:center;background:var(--soft);border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;word-break:break-all}
.secret span{flex:1}
.row{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
.callout{border-left:3px solid var(--warn);background:var(--soft);padding:10px 12px;border-radius:8px;font-size:14px;margin:14px 0}
.check{display:flex;gap:10px;align-items:center;font-weight:500;margin-top:18px}.check input{width:18px;height:18px}
.big{font-size:40px;line-height:1}
[hidden]{display:none!important}
a{color:var(--accent)}
</style>
</head>
<body>
<main>
  <div class="brand"><div class="logo">✦</div>Comment to DM · private setup</div>

  <section id="v-form" hidden>
    <h1>Paste your Meta app details</h1>
    <p class="lede">Your AI agent is setting everything else up. These go straight from this page into your own Cloudflare account. Your agent never sees them.</p>
    <form class="card" id="f" autocomplete="off">
      <div id="f-mode">
        <label>Which login does your Meta app show?</label>
        <div class="seg">
          <label><input type="radio" name="mode" value="unified" checked><span>Unified login<small>“API setup with Facebook login”. Every new app.</small></span></label>
          <label><input type="radio" name="mode" value="instagram"><span>Instagram login<small>Older apps only</small></span></label>
        </div>
      </div>
      <div id="f-config">
        <label for="configId">Login configuration ID</label>
        <p class="hint">Meta app → Facebook Login for Business → Configurations → the ID of your configuration.</p>
        <input type="text" id="configId" name="configId" inputmode="numeric" placeholder="e.g. 1234567890123456">
      </div>
      <div id="f-appid">
        <label for="appId">App ID</label>
        <p class="hint" id="h-appid">The number at the top of your Meta app dashboard.</p>
        <input type="text" id="appId" name="appId" inputmode="numeric" placeholder="e.g. 1234567890123456">
      </div>
      <div id="f-secret">
        <label for="appSecret" id="l-secret">App secret</label>
        <p class="hint" id="h-secret">App settings → Basic → App secret → <b>Show</b>. Meta may ask for your Facebook password.</p>
        <input type="password" id="appSecret" name="appSecret" placeholder="32 letters and numbers" spellcheck="false">
      </div>
      <div id="f-fbsecret" hidden>
        <label for="facebookAppSecret">Facebook App Secret</label>
        <p class="hint">App settings → Basic → App secret → Show. A <b>different</b> value from the Instagram one above.</p>
        <input type="password" id="facebookAppSecret" name="facebookAppSecret" placeholder="32 letters and numbers" spellcheck="false">
      </div>
      <button type="submit" id="go">Save to my Cloudflare</button>
      <div class="err" id="err" role="alert"></div>
      <div class="lock">🔒 <span>This page runs only on your computer (127.0.0.1) and closes when setup finishes. Nothing is sent anywhere but your Cloudflare account.</span></div>
    </form>
  </section>

  <section id="v-work" hidden>
    <h1>Setting up your bot…</h1>
    <p class="lede">Keep this tab open. It takes a minute or two.</p>
    <div class="card"><ol class="steps" id="steps"></ol><div class="err" id="werr" role="alert"></div></div>
  </section>

  <section id="v-secrets" hidden>
    <h1 id="s-title">Your bot is live 🎉</h1>
    <p class="lede">One last thing: save your private dashboard link. Cloudflare keeps it hidden, so this page is the only place you'll see it.</p>
    <div class="card">
      <label>Your private dashboard link</label>
      <p class="hint">Anyone with this link still needs your password, but keep it private: don't post it or show it in a video.</p>
      <div class="secret"><span id="admin"></span></div>
      <div class="row"><button class="ghost" data-copy="admin">Copy link</button><button class="ghost" id="open">Open dashboard</button></div>
      <div id="vt" hidden>
        <label>Webhook verify token</label>
        <p class="hint">Paste this into Meta: Use cases → Instagram API → Configure webhooks → Verify token.</p>
        <div class="secret"><span id="verify"></span></div>
        <div class="row"><button class="ghost" data-copy="verify">Copy token</button></div>
      </div>
      <div class="callout">Save the link in your password manager or bookmarks now. When you open it the first time, you'll create your dashboard password.</div>
      <label class="check"><input type="checkbox" id="saved"> I've saved my dashboard link</label>
      <button id="done" disabled>Done, back to my agent</button>
    </div>
  </section>

  <section id="v-done" hidden>
    <div class="card" style="text-align:center;padding:36px 22px">
      <div class="big">✅</div>
      <h1 style="margin-top:12px">All set</h1>
      <p class="lede" style="margin:0">You can close this tab. Your agent will take it from here.</p>
    </div>
  </section>
</main>
<script>
const B=${JSON.stringify(base)};let S=null;
const $=id=>document.getElementById(id);
function show(v){for(const k of ['form','work','secrets','done'])$('v-'+k).hidden=k!==v}
function mode(){const m=document.querySelector('input[name=mode]:checked');return (S&&!S.ask.mode)?(S.presetMode||'unified'):(m?m.value:'unified')}
function layout(){const m=mode(),a=S.ask;$('f-mode').hidden=!a.mode;$('f-config').hidden=!(m==='unified'&&a.configId);$('f-appid').hidden=!a.appId;$('f-secret').hidden=!a.appSecret;$('f-fbsecret').hidden=!(m==='instagram'&&a.facebookAppSecret);
$('h-appid').innerHTML=m==='unified'?'The number at the top of your Meta app dashboard.':'Instagram → API setup with Instagram login → Business login settings → <b>Instagram App ID</b> (not the number at the top of the dashboard).';
$('l-secret').textContent=m==='unified'?'App secret':'Instagram App Secret';
$('h-secret').innerHTML=m==='unified'?'App settings → Basic → App secret → <b>Show</b>. Meta may ask for your Facebook password.':'Same Business login settings page → Instagram App Secret → <b>Show</b>.'}
document.querySelectorAll('input[name=mode]').forEach(r=>r.addEventListener('change',layout));
$('f').addEventListener('submit',async e=>{e.preventDefault();$('err').textContent='';$('go').disabled=true;$('go').textContent='Saving…';
 const body=Object.fromEntries(new FormData($('f')));body.mode=mode();
 try{const r=await fetch(B+'/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const j=await r.json();
 if(!r.ok){$('err').textContent=j.error||'That did not work.';$('go').disabled=false;$('go').textContent='Save to my Cloudflare';return}
 for(const el of $('f').querySelectorAll('input[type=password],input[type=text]'))el.value='';tick()}catch{$('err').textContent='Setup stopped. Ask your agent to run it again.';$('go').disabled=false}});
function render(){if(!S)return;
 if(S.phase==='form'){show('form');layout();return}
 if(S.phase==='working'||(S.phase==='error'&&!S.adminUrl)){show('work');$('steps').innerHTML=S.steps.map(s=>'<li class="'+s.state+'"><span class="dot">'+(s.state==='done'?'✓':s.state==='failed'?'!':'')+'</span>'+s.label.replace(/</g,'&lt;')+'</li>').join('');$('werr').textContent=S.error||'';return}
 if(S.phase==='secrets'||(S.phase==='error'&&S.adminUrl)){show('secrets');$('s-title').textContent=S.phase==='error'?'Setup stopped, but save this link':'Your bot is live 🎉';$('admin').textContent=S.adminUrl||'Unchanged: use the link from your first setup.';$('open').hidden=!S.adminUrl;$('vt').hidden=!(S.verifyToken&&!S.webhookAutomatic);$('verify').textContent=S.verifyToken||'';return}
 if(S.phase==='done')show('done')}
document.querySelectorAll('[data-copy]').forEach(b=>b.addEventListener('click',async()=>{const t=$(b.dataset.copy).textContent;try{await navigator.clipboard.writeText(t);const o=b.textContent;b.textContent='Copied ✓';setTimeout(()=>b.textContent=o,1500)}catch{}}));
$('open').addEventListener('click',()=>S&&S.adminUrl&&window.open(S.adminUrl,'_blank','noopener,noreferrer'));
$('saved').addEventListener('change',e=>$('done').disabled=!e.target.checked);
$('done').addEventListener('click',async()=>{await fetch(B+'/ack',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).catch(()=>{});S.phase='done';render()});
async function tick(){try{const r=await fetch(B+'/state',{cache:'no-store'});S=await r.json();render()}catch{}}
tick();setInterval(()=>{if(!S||S.phase!=='form'&&S.phase!=='done')tick()},1200);
</script>
</body>
</html>`;
}
