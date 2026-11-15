// The three pages people see: sign in, account (link the other provider), sign out.
// Plain HTML with a few lines of script; the forms call Better Auth's own endpoints.

const PROVIDERS = [
  { id: 'github', label: 'GitHub' },
  { id: 'google', label: 'Google' },
] as const;

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="referrer" content="same-origin" />
<title>${escape(title)}</title>
<style>
  :root { color-scheme: light dark; --bg: #ffffff; --fg: #0a0a0a; --muted: #737373; --line: #e5e5e5; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0a0a0a; --fg: #fafafa; --muted: #a3a3a3; --line: #262626; } }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--bg); color: var(--fg); font: 16px/1.5 system-ui, sans-serif; }
  main { width: min(360px, calc(100% - 32px)); display: grid; gap: 12px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  p { margin: 0; color: var(--muted); }
  button { font: inherit; padding: 12px; border-radius: 8px; border: 1px solid var(--line); background: transparent; color: inherit; cursor: pointer; }
  .error { color: #dc2626; }
</style>
</head>
<body><main>${body}</main></body>
</html>`;
}

// Posts JSON to a Better Auth endpoint and follows the provider URL it returns.
const SCRIPT = `<script>
for (const b of document.querySelectorAll('button[data-endpoint]')) {
  b.addEventListener('click', async () => {
    b.disabled = true;
    const body = JSON.parse(b.dataset.body);
    const r = await fetch(b.dataset.endpoint, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = await r.json().catch(() => ({}));
    if (r.ok && data.url) location.assign(data.url);
    else if (r.ok && b.dataset.done) location.assign(b.dataset.done);
    else { b.disabled = false; document.querySelector('#error').textContent = data.message || 'Something went wrong. Try again.'; }
  });
}
</script>`;

const button = (endpoint: string, body: object, label: string, done?: string) =>
  `<button type="button" data-endpoint="${endpoint}" data-body="${escape(JSON.stringify(body))}"${done ? ` data-done="${escape(done)}"` : ''}>${escape(label)}</button>`;

export function signInPage(returnTo: string, error?: string): string {
  const buttons = PROVIDERS.map((p) => button('/api/auth/sign-in/social', { provider: p.id, callbackURL: returnTo, errorCallbackURL: '/sign-in' }, `Continue with ${p.label}`)).join('\n');
  return layout('Sign in', `<h1>Sign in</h1>
<p>One sign-in for all daysofme apps.</p>
${buttons}
<p id="error" class="error">${error ? escape(error) : ''}</p>
${SCRIPT}`);
}

export function accountPage(user: { name: string | null; email: string }, linked: string[]): string {
  const rows = PROVIDERS.map((p) =>
    linked.includes(p.id)
      ? `<p>${escape(p.label)}: linked</p>`
      : button('/api/auth/link-social', { provider: p.id, callbackURL: '/account', errorCallbackURL: '/account' }, `Link ${p.label}`),
  ).join('\n');
  return layout('Account', `<h1>${escape(user.name ?? user.email)}</h1>
<p>${escape(user.email)}</p>
${rows}
${button('/api/auth/sign-out', {}, 'Sign out', '/sign-in')}
<p id="error" class="error"></p>
${SCRIPT}`);
}

export function signOutPage(returnTo: string): string {
  return layout('Sign out', `<h1>Sign out</h1>
<p>This signs you out of every daysofme app.</p>
${button('/api/auth/sign-out', {}, 'Sign out', `/sign-in?returnTo=${encodeURIComponent(returnTo)}`)}
<p id="error" class="error"></p>
${SCRIPT}`);
}
