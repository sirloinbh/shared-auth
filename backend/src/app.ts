import express from 'express';
import { fromNodeHeaders, toNodeHandler } from 'better-auth/node';
import { returnName } from './apps.js';
import type { Auth } from './auth.js';
import { accountPage, signInPage, signOutPage } from './pages.js';
import { refusalMessage, safeReturnTo } from './rules.js';

export type AppOptions = { baseURL: string; rootDomain: string; ping: () => Promise<void> };

export function createApp(auth: Auth, { baseURL, rootDomain, ping }: AppOptions) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use((_req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'Content-Security-Policy': "frame-ancestors 'none'", 'Cache-Control': 'no-store' });
    next();
  });

  // Better Auth reads the raw body itself, so it is mounted before any body parser.
  app.all('/api/auth/*splat', toNodeHandler(auth));

  app.get('/api/health', async (_req, res) => {
    try {
      await ping();
      res.json({ status: 'ok' });
    } catch {
      res.status(503).json({ status: 'db_unavailable' });
    }
  });

  const account = `${baseURL}/account`;
  const query = (v: unknown) => (typeof v === 'string' ? v : undefined);
  const session = (req: express.Request) => auth.api.getSession({ headers: fromNodeHeaders(req.headers) });

  app.get('/sign-in', async (req, res) => {
    const returnTo = safeReturnTo(query(req.query.returnTo), rootDomain, account);
    if (await session(req)) return res.redirect(303, returnTo);
    res.type('html').send(signInPage({ returnTo, appName: returnName(returnTo, baseURL), error: refusalMessage(query(req.query.error)) }));
  });

  app.get('/account', async (req, res) => {
    const current = await session(req);
    if (!current) return res.redirect(303, `/sign-in?returnTo=${encodeURIComponent(account)}`);
    const accounts = await auth.api.listUserAccounts({ headers: fromNodeHeaders(req.headers) });
    res.type('html').send(accountPage({ name: current.user.name ?? null, email: current.user.email }, accounts.map((a) => a.providerId)));
  });

  app.get('/sign-out', (req, res) => {
    const returnTo = safeReturnTo(query(req.query.returnTo), rootDomain, account);
    res.type('html').send(signOutPage({ returnTo, appName: returnName(returnTo, baseURL) }));
  });

  app.get('/', (_req, res) => res.redirect(303, '/account'));
  return app;
}
