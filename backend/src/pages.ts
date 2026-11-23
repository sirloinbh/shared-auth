// The three pages people see: sign in, account (link the other provider), sign out.
// Plain HTML with a few lines of script; the buttons call Better Auth's own endpoints.
import { STYLES } from './styles.js';

// Provider marks as inline SVG, unaltered: the GitHub mark (Octicons mark-github) in the text color,
// and the four-color Google "G" (Google sign-in branding guidelines).
const GITHUB_MARK = `<svg class="mark" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>`;
const GOOGLE_MARK = `<svg class="mark" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`;

const PROVIDERS = [
  { id: 'github', label: 'GitHub', mark: GITHUB_MARK },
  { id: 'google', label: 'Google', mark: GOOGLE_MARK },
] as const;

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The centered card every page uses: the service name above, the page content and an error line, and a note below. */
function layout(title: string, card: string, note: string, error = ''): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="referrer" content="same-origin" />
<title>${escape(title)} · daysofme</title>
<style>${STYLES}</style>
</head>
<body>
<main>
<p class="brand">daysofme</p>
<section class="card">
${card}
<p id="error" class="error" role="alert">${escape(error)}</p>
</section>
<p class="note">${note}</p>
</main>
${SCRIPT}
</body>
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

/** A button that posts `body` to `endpoint`. `content` is trusted HTML (marks and escaped labels). */
const button = (endpoint: string, body: object, content: string, { done, kind = 'outline' }: { done?: string; kind?: 'outline' | 'primary' | 'small' } = {}) =>
  `<button type="button" class="${kind}" data-endpoint="${endpoint}" data-body="${escape(JSON.stringify(body))}"${done ? ` data-done="${escape(done)}"` : ''}>${content}</button>`;

export function signInPage({ returnTo, appName, error }: { returnTo: string; appName: string; error?: string }): string {
  const buttons = PROVIDERS.map((p) =>
    button('/api/auth/sign-in/social', { provider: p.id, callbackURL: returnTo, errorCallbackURL: `/sign-in?returnTo=${encodeURIComponent(returnTo)}` }, `${p.mark}<span>Continue with ${escape(p.label)}</span>`),
  ).join('\n');
  return layout(
    'Sign in',
    `<h1>Sign in</h1>
<p class="lead">to continue to <strong>${escape(appName)}</strong></p>
<div class="stack">
${buttons}
</div>`,
    `After you sign in, you return to ${escape(appName)}. One sign-in works for every daysofme app.`,
    error,
  );
}

export function accountPage(user: { name: string | null; email: string }, linked: string[]): string {
  const rows = PROVIDERS.map(
    (p) => `<li>${p.mark}<span class="grow">${escape(p.label)}</span>${
      linked.includes(p.id)
        ? '<span class="badge">Linked</span>'
        : button('/api/auth/link-social', { provider: p.id, callbackURL: '/account', errorCallbackURL: '/account' }, `Link ${escape(p.label)}`, { kind: 'small' })
    }</li>`,
  ).join('\n');
  return layout(
    'Account',
    `<h1>${escape(user.name ?? user.email)}</h1>
<p class="lead">${escape(user.email)}</p>
<h2>Sign-in methods</h2>
<ul class="list">
${rows}
</ul>
${button('/api/auth/sign-out', {}, 'Sign out', { done: '/sign-in' })}`,
    'This account signs you in to every daysofme app.',
  );
}

export function signOutPage({ returnTo, appName }: { returnTo: string; appName: string }): string {
  return layout(
    'Sign out',
    `<h1>Sign out</h1>
<p class="lead">This signs you out of every daysofme app.</p>
${button('/api/auth/sign-out', {}, 'Sign out', { done: `/sign-in?returnTo=${encodeURIComponent(returnTo)}`, kind: 'primary' })}`,
    `You can sign in again to return to ${escape(appName)}.`,
  );
}
