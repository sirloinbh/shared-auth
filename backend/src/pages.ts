// The three pages people see: sign in, account (link the other provider, manage passkeys), sign out.
// Plain HTML; the stylesheet and scripts are files of their own (/assets/pages.css, /assets/pages.js,
// /assets/passkey.js), so the Content-Security-Policy allows no inline code (#38). The buttons call Better Auth's endpoints.

// Provider marks as inline SVG, unaltered: the GitHub mark (Octicons mark-github) in the text color,
// and the four-color Google "G" (Google sign-in branding guidelines).
const GITHUB_MARK = `<svg class="mark" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>`;
const GOOGLE_MARK = `<svg class="mark" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`;

const PROVIDERS = [
  { id: 'github', label: 'GitHub', mark: GITHUB_MARK },
  { id: 'google', label: 'Google', mark: GOOGLE_MARK },
] as const;

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The centered card every page uses: the service name above, the page content and an error line, a note below, and the scripts it loads. */
function layout(title: string, card: string, note: string, error = '', scripts: string[] = ['/assets/pages.js'], wide = false): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="referrer" content="same-origin" />
<title>${escape(title)} · daysofme</title>
<link rel="stylesheet" href="/assets/pages.css" />
</head>
<body>
<main${wide ? ' class="wide"' : ''}>
<p class="brand">daysofme</p>
<section class="card">
${card}
<p id="error" class="error" role="alert">${escape(error)}</p>
</section>
<p class="note">${note}</p>
</main>
${scripts.map((src) => `<script src="${src}"></script>`).join('\n')}
</body>
</html>`;
}

// /assets/pages.js: posts JSON to the button's endpoint and follows the provider URL it returns.
export const SCRIPT = `for (const b of document.querySelectorAll('button[data-endpoint]')) {
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
`;

// Passkey buttons (#54): fetch the WebAuthn options, let the browser create or use the passkey
// (@simplewebauthn/browser, served at /assets/webauthn.js and loaded first), then send the result back to Better Auth.
// Served as /assets/passkey.js.
export const PASSKEY_SCRIPT = `const passkeyCall = async (path, init) => {
  const r = await fetch('/api/auth/passkey/' + path, { credentials: 'same-origin', ...init });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.code === 'SESSION_NOT_FRESH' ? 'Sign in again to add a passkey: it needs a sign-in from the last day.' : data.message || 'Something went wrong. Try again.');
  return data;
};
const passkeyPost = (path, body) => passkeyCall(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
for (const b of document.querySelectorAll('button[data-passkey]')) {
  b.addEventListener('click', async () => {
    b.disabled = true;
    try {
      const register = b.dataset.passkey === 'register';
      const optionsJSON = await passkeyCall(register ? 'generate-register-options' : 'generate-authenticate-options');
      const { clientExtensionResults, ...response } = register
        ? await SimpleWebAuthnBrowser.startRegistration({ optionsJSON })
        : await SimpleWebAuthnBrowser.startAuthentication({ optionsJSON });
      await passkeyPost(register ? 'verify-registration' : 'verify-authentication', { response });
      location.assign(b.dataset.done);
    } catch (e) {
      b.disabled = false;
      document.querySelector('#error').textContent = e && e.name === 'NotAllowedError' ? 'The passkey request was cancelled or timed out.' : (e && e.message) || 'Something went wrong. Try again.';
    }
  });
}
`;

/** The scripts of a page with passkey buttons; webauthn.js defines SimpleWebAuthnBrowser for passkey.js. */
const PASSKEY_PAGE_SCRIPTS = ['/assets/pages.js', '/assets/webauthn.js', '/assets/passkey.js'];

/** A button that runs the passkey flow, then goes to `done`. */
const passkeyButton = (flow: 'register' | 'sign-in', done: string, content: string, kind: 'outline' | 'small' = 'outline') =>
  `<button type="button" class="${kind}" data-passkey="${flow}" data-done="${escape(done)}">${content}</button>`;

/** A button that posts `body` to `endpoint`. `content` is trusted HTML (marks and escaped labels). */
const button = (endpoint: string, body: object, content: string, { done, kind = 'outline' }: { done?: string; kind?: 'outline' | 'primary' | 'small' | 'link' } = {}) =>
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
${passkeyButton('sign-in', returnTo, '<span>Sign in with a passkey</span>')}
</div>`,
    `After you sign in, you return to ${escape(appName)}. One sign-in works for every daysofme app.`,
    error,
    PASSKEY_PAGE_SCRIPTS,
  );
}

/** One active session on the account page. `device` is already a short name (devices.ts). */
export type SessionRow = { id: string; current: boolean; device: string; ip: string | null; createdAt: Date; lastUsedAt: Date };

// The owner lives in Seoul (the server's timers use Seoul time too), so times are shown in that zone.
const TIME = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' });
const time = (d: Date) => `<time datetime="${d.toISOString()}">${escape(TIME.format(d))}</time>`;

function sessionList(sessions: SessionRow[]): string {
  const rows = sessions.map(
    (s) => `<li><span class="grow"><span class="title">${escape(s.device)}</span><span class="meta">${s.ip ? `${escape(s.ip)} · ` : ''}signed in ${time(s.createdAt)} · last used ${time(s.lastUsedAt)}</span></span>${
      s.current ? '<span class="badge">This device</span>' : button('/account/sessions/revoke', { id: s.id }, 'Sign out', { done: '/account', kind: 'small' })
    }</li>`,
  );
  const others = sessions.filter((s) => !s.current).length;
  return `<h2>Active sessions</h2>
<ul class="list">
${rows.join('\n')}
</ul>
${others > 1 ? button('/api/auth/revoke-other-sessions', {}, 'Sign out other devices', { done: '/account' }) : ''}`;
}

/** A passkey registered on /account, as the account page lists it. */
export type PasskeyRow = { id: string; name: string | null; createdAt: Date };

function passkeyList(passkeys: PasskeyRow[], canAdd: boolean): string {
  const rows = passkeys.map(
    (k) =>
      `<li><span class="grow"><span class="title">${escape(k.name || 'Passkey')}</span><span class="meta">added ${time(k.createdAt)}</span></span>${button('/api/auth/passkey/delete-passkey', { id: k.id }, 'Remove', { done: '/account', kind: 'small' })}</li>`,
  );
  return `<h2>Passkeys</h2>
<p class="lead">A passkey signs you in if GitHub and Google are both unavailable. Add one on each device you use.</p>
<ul class="list">
${rows.join('\n') || '<li><span class="grow muted">No passkey yet</span></li>'}
</ul>
${canAdd ? passkeyButton('register', '/account', 'Add a passkey', 'small') : `<p class="hint">Sign in again to add a passkey: it needs a sign-in from the last day. ${button('/api/auth/sign-out', {}, 'Sign in again', { done: '/sign-in', kind: 'link' })}</p>`}`;
}

/** A linked provider: Better Auth's account row id (what unlink-account takes) and the provider. */
export type LinkedAccount = { id: string; providerId: string };

export type AccountView = {
  linked: LinkedAccount[];
  sessions?: SessionRow[];
  passkeys?: PasskeyRow[];
  /** Better Auth unlinks and registers a passkey only from a session younger than its freshAge; older ones must sign in again. Removing a passkey needs no fresh session. */
  canUnlink?: boolean;
  /** A fixed message for a failed link (rules.ts linkErrorMessage), never the query text. */
  error?: string;
};

export function accountPage(user: { name: string | null; email: string }, { linked, sessions = [], passkeys = [], canUnlink = true, error }: AccountView): string {
  // The last provider can never be unlinked: it is the only way to sign in.
  const unlinkable = linked.length > 1;
  const rows = PROVIDERS.map((p) => {
    const account = linked.find((a) => a.providerId === p.id);
    const action = !account
      ? button('/api/auth/link-social', { provider: p.id, callbackURL: '/account', errorCallbackURL: '/account' }, `Link ${escape(p.label)}`, { kind: 'small' })
      : `<span class="badge">Linked</span>${unlinkable && canUnlink ? button('/api/auth/unlink-account', { accountId: account.id }, `Unlink ${escape(p.label)}`, { done: '/account', kind: 'small' }) : ''}`;
    return `<li>${p.mark}<span class="grow">${escape(p.label)}</span>${action}</li>`;
  }).join('\n');
  const unlinkNote = unlinkable && !canUnlink ? `<p class="hint">To unlink a provider, sign in again first: unlinking needs a sign-in from the last day. ${button('/api/auth/sign-out', {}, 'Sign in again', { done: '/sign-in', kind: 'link' })}</p>` : '';
  return layout(
    'Account',
    `<h1>${escape(user.name ?? user.email)}</h1>
<p class="lead">${escape(user.email)}</p>
<h2>Sign-in methods</h2>
<ul class="list">
${rows}
</ul>
${unlinkNote}
${passkeyList(passkeys, canUnlink)}
${sessions.length ? sessionList(sessions) : ''}
${button('/api/auth/sign-out', {}, 'Sign out', { done: '/sign-in' })}`,
    'This account signs you in to every daysofme app.',
    error,
    PASSKEY_PAGE_SCRIPTS,
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

/** What daysofme is (#77): the application home page the Google consent screen asks for. Public, no scripts. */
export function aboutPage(): string {
  return layout(
    'About',
    `<h1>About daysofme</h1>
<p class="lead">Personal apps for one owner</p>
<div class="doc">
<p>daysofme is a small set of personal apps, such as a study log, a workout memo and a money ledger. They are built and used by one person, the owner. They are not offered to the public, and nobody else can create an account.</p>
<h2>Sign-in</h2>
<p>All the apps share one sign-in at auth.daysofme.com. The owner signs in with a Google or GitHub account. Only the owner's email address is allowed, and a signed-out visitor sees the sign-in page and nothing else.</p>
<h2>Google features</h2>
<p>Google is used for sign-in. The study log app can also copy its study schedule and review dates to a separate calendar named "Study log", which it creates in the owner's Google account. See the <a href="/privacy">privacy policy</a> for exactly what is used.</p>
</div>`,
    '<a href="/privacy">Privacy policy</a>',
    '',
    [],
    true,
  );
}

/** The privacy policy (#77): what Google data is used, where it is kept, and how to revoke it. Public, no scripts. */
export function privacyPage(): string {
  return layout(
    'Privacy policy',
    `<h1>Privacy policy</h1>
<p class="lead">How daysofme uses your Google data</p>
<div class="doc">
<p>daysofme is a set of personal apps used by its owner alone (see <a href="/about">About</a>). This page says what data the apps use, including data from Google.</p>
<h2>Sign-in data</h2>
<p>When you sign in with Google or GitHub, the apps receive your account's profile name and email address. They are used only to check that the email is the owner's and to show who is signed in. Sign-in sessions are kept in the sign-in service's database until they expire or you sign out.</p>
<h2>Google Calendar data (study log)</h2>
<p>If you choose "Connect Google Calendar" in the study log's Settings, the app asks for one permission: the Google Calendar scope <code>calendar.app.created</code>. It lets the app create its own calendar, named "Study log", and add, change and delete events on that calendar. It cannot see or change your other calendars or their events.</p>
<ul>
<li>What is sent to Google: event titles and dates for planned study days and review due dates, such as the schedule title, the review round, and the textbook or chapter name. Notes, memos and exercise text are never sent.</li>
<li>What is read from Google: only the answers to the app's own requests, such as the calendar's ID. Changes you make in Google Calendar are not read back.</li>
<li>What is stored: the long-term access token (refresh token) Google gives the app. It is stored encrypted in the study log's database, and it is never written to logs.</li>
</ul>
<h2>Sharing and selling</h2>
<p>Your data is not shared with anyone, sold, or used for advertising or for training AI models. The apps use your Google data only to provide the features above. They do not use it for anything else.</p>
<h2>How to revoke access</h2>
<ul>
<li>In the study log, open Settings and choose "Disconnect" under Google Calendar. The app forgets the token and revokes the access. The "Study log" calendar stays in your Google account, and you can delete it there.</li>
<li>Or remove daysofme under "Third-party apps and services" in your Google account's security settings (myaccount.google.com/permissions). The app then can no longer reach your calendar.</li>
<li>To stop signing in with Google, sign in to auth.daysofme.com/account and unlink Google (GitHub stays linked).</li>
</ul>
<h2>Keeping and deleting data</h2>
<p>Calendar sync data is deleted when you disconnect. Study records belong to the owner and stay on the owner's own server until the owner deletes them.</p>
<h2>Changes</h2>
<p>If the way data is used changes, this page is updated before the change takes effect.</p>
</div>`,
    '<a href="/about">About daysofme</a>',
    '',
    [],
    true,
  );
}
