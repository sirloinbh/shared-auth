import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import express from 'express';
import { fromNodeHeaders, toNodeHandler } from 'better-auth/node';
import { returnName } from './apps.js';
import type { Auth } from './auth.js';
import { describeDevice } from './devices.js';
import { aboutPage, accountPage, PASSKEY_SCRIPT, privacyPage, type PasskeyRow, SCRIPT, type SessionRow, signInPage, signOutPage } from './pages.js';
import { requestLog } from './request-log.js';
import { renewSessionCookie } from './session-cookie.js';
import { linkErrorMessage, refusalMessage, safeReturnTo } from './rules.js';
import { STYLES } from './styles.js';

/**
 * The Content-Security-Policy of every response (#38): only this service's own files and endpoints. The
 * pages load /assets/pages.css and /assets/pages.js and have no inline code; the buttons fetch this
 * service's endpoints and then navigate (which the policy does not limit) to GitHub, Google, or an app.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "connect-src 'self'",
  "form-action 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
].join('; ');

// The browser half of the passkey flow (#54), served from the installed package instead of a CDN.
const WEBAUTHN_JS = readFileSync(join(dirname(createRequire(import.meta.url).resolve('@simplewebauthn/browser')), '..', 'dist', 'bundle', 'index.umd.min.js'), 'utf8');

export type AppOptions = { baseURL: string; rootDomain: string; ping: () => Promise<void> };

export function createApp(auth: Auth, { baseURL, rootDomain, ping }: AppOptions) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use((_req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'Content-Security-Policy': CONTENT_SECURITY_POLICY, 'Cache-Control': 'no-store' });
    next();
  });

  // Before the request log: the Compose healthcheck calls it every 5 seconds (docs/logging.md allows
  // only the health check first).
  app.get('/api/health', async (_req, res) => {
    try {
      await ping();
      res.json({ status: 'ok' });
    } catch {
      res.status(503).json({ status: 'db_unavailable' });
    }
  });

  // One line per request with its ID (#64), before Better Auth and every page.
  app.use(requestLog);

  // Better Auth reads the raw body itself, so it is mounted before any body parser.
  app.all('/api/auth/*splat', toNodeHandler(auth));


  const account = `${baseURL}/account`;
  const query = (v: unknown) => (typeof v === 'string' ? v : undefined);
  const session = (req: express.Request) => auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  // The browser cookie keeps the lifetime it got at sign-in; the auth pages renew it (#48).
  const renew = async (req: express.Request, res: express.Response, current: { session: { token: string; expiresAt: Date | string } }) =>
    renewSessionCookie(res, (await auth.$context).authCookies.sessionToken, req.headers.cookie, current.session);
  // Read through the adapter: Better Auth's list-sessions endpoint needs a session younger than a day.
  const activeSessions = async (userId: string) => {
    const now = new Date();
    return (await (await auth.$context).internalAdapter.listSessions(userId)).filter((s) => s.expiresAt > now);
  };

  app.get('/sign-in', async (req, res) => {
    const returnTo = safeReturnTo(query(req.query.returnTo), rootDomain, account);
    const current = await session(req);
    if (current) {
      await renew(req, res, current);
      return res.redirect(303, returnTo);
    }
    res.type('html').send(signInPage({ returnTo, appName: returnName(returnTo, baseURL), error: refusalMessage(query(req.query.error)) }));
  });

  app.get('/account', async (req, res) => {
    const current = await session(req);
    if (!current) return res.redirect(303, `/sign-in?returnTo=${encodeURIComponent(account)}`);
    await renew(req, res, current);
    const accounts = await auth.api.listUserAccounts({ headers: fromNodeHeaders(req.headers) });
    const sessions: SessionRow[] = (await activeSessions(current.user.id))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .map((s) => ({ id: s.id, current: s.id === current.session.id, device: describeDevice(s.userAgent), ip: s.ipAddress ?? null, createdAt: s.createdAt, lastUsedAt: s.updatedAt }));
    // Better Auth's unlink-account needs a session younger than freshAge (#43).
    const { freshAge } = (await auth.$context).sessionConfig;
    const canUnlink = freshAge === 0 || Date.now() - new Date(current.session.createdAt).getTime() < freshAge * 1000;
    const passkeys = await (await auth.$context).adapter.findMany<PasskeyRow>({ model: 'passkey', where: [{ field: 'userId', value: current.user.id }] });
    res.type('html').send(
      accountPage(
        { name: current.user.name ?? null, email: current.user.email },
        { linked: accounts.map((a) => ({ id: a.id, providerId: a.providerId })), sessions, passkeys, canUnlink, error: linkErrorMessage(query(req.query.error)) },
      ),
    );
  });

  // Signs out one other session by its id, so session tokens never reach the page (#42). Better Auth's
  // own endpoints check the Origin of every POST; this route does the same, and takes JSON only, which a
  // cross-site form cannot send.
  app.post('/account/sessions/revoke', express.json({ limit: '1kb' }), async (req, res) => {
    if (req.get('origin') !== new URL(baseURL).origin) return res.status(403).json({ message: 'This request did not come from the account page.' });
    const current = await session(req);
    if (!current) return res.status(401).json({ message: 'Sign in again to manage your sessions.' });
    const id = typeof req.body?.id === 'string' ? req.body.id : '';
    const target = (await activeSessions(current.user.id)).find((s) => s.id === id);
    if (!target) return res.status(404).json({ message: 'That session has already ended.' });
    if (target.id === current.session.id) return res.status(400).json({ message: 'Use Sign out to end the session on this device.' });
    await auth.api.revokeSession({ body: { token: target.token }, headers: fromNodeHeaders(req.headers) });
    res.json({ status: true });
  });

  app.get('/sign-out', (req, res) => {
    const returnTo = safeReturnTo(query(req.query.returnTo), rootDomain, account);
    res.type('html').send(signOutPage({ returnTo, appName: returnName(returnTo, baseURL) }));
  });

  // The pages' stylesheet and script. They change only with a deploy, so the browser may keep them but
  // checks the ETag each time (no-cache) instead of the no-store the pages get.
  const asset = (type: string, body: string) => (_req: express.Request, res: express.Response) => void res.set('Cache-Control', 'no-cache').type(type).send(body);
  app.get('/assets/pages.css', asset('css', STYLES));
  app.get('/assets/pages.js', asset('js', SCRIPT));
  app.get('/assets/passkey.js', asset('js', PASSKEY_SCRIPT));
  app.get('/assets/webauthn.js', asset('js', WEBAUTHN_JS));

  // Public pages the Google consent screen asks for (#77): no session, no scripts.
  app.get('/about', (_req, res) => void res.type('html').send(aboutPage()));
  app.get('/privacy', (_req, res) => void res.type('html').send(privacyPage()));

  app.get('/', (_req, res) => res.redirect(303, '/account'));
  return app;
}
