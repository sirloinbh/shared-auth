// Alerts the owner when a sign-in comes from an IP or a device not seen before (#36).
// Every successful sign-in (#33) is remembered, also while no alert channel is set, so turning the
// alert on later does not report every device the owner already uses.
import { createHash } from 'node:crypto';
import type pg from 'pg';
import type { SignInEvent } from './signin-log.js';

export type SeenKind = 'ip' | 'device';

/** Remembers what a user signed in from. remember() returns true the first time it sees a value. */
export type SeenStore = { remember: (userId: string, kind: SeenKind, valueHash: string) => Promise<boolean> };

/** Sends one alert text to the owner. */
export type AlertSender = (text: string) => Promise<void>;

/**
 * A browser update changes the version numbers in the user agent, not the device, so they are dropped:
 * "Mozilla/5.0 (Windows NT 10.0) Chrome/131.0.0.0" and ".../132.0.0.0" are one device.
 */
export function deviceOf(userAgent: string | null): string | null {
  return userAgent ? userAgent.replace(/\d+(?:[._]\d+)*/g, '#').trim() : null;
}

/** Values are stored only as hashes: the table says "seen before", not where the owner was. */
const hash = (kind: SeenKind, value: string) => createHash('sha256').update(`${kind}\n${value}`).digest('hex');

export function memorySeenStore(): SeenStore {
  const seen = new Set<string>();
  return {
    remember: async (userId, kind, valueHash) => {
      const key = `${userId}\n${kind}\n${valueHash}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    },
  };
}

export const SEEN_TABLE_SQL = `create table if not exists sign_in_seen (
  user_id text not null,
  kind text not null,
  value_hash text not null,
  first_seen timestamptz not null default now(),
  primary key (user_id, kind, value_hash)
)`;

export function pgSeenStore(pool: pg.Pool): SeenStore {
  return {
    remember: async (userId, kind, valueHash) => {
      const r = await pool.query('insert into sign_in_seen (user_id, kind, value_hash) values ($1, $2, $3) on conflict do nothing', [userId, kind, valueHash]);
      return r.rowCount === 1;
    },
  };
}

/** The alert text: what is new, the provider, the IP, and the user agent. No email, token, or cookie. */
export function alertText(event: SignInEvent, newIp: boolean, newDevice: boolean, now = new Date()): string {
  const what = [newIp && 'IP', newDevice && 'device'].filter(Boolean).join(' and ');
  return `Sign-in from a new ${what}: ${event.provider}, IP ${event.ip ?? 'unknown'}, ${(event.userAgent ?? 'no user agent').slice(0, 200)}, at ${now.toISOString()}`;
}

/**
 * Returns the listener for sign-in events. A success from an IP or device the user has not used before
 * sends one alert when send is set (null: the alert is off, and sign-ins are only remembered).
 * The sign-in itself never waits for, or fails with, the alert.
 */
export function newDeviceWatcher({ store, send, onError }: { store: SeenStore; send: AlertSender | null; onError: (err: unknown) => void }) {
  return async (event: SignInEvent): Promise<void> => {
    if (event.outcome !== 'success' || !event.userId) return;
    try {
      const device = deviceOf(event.userAgent);
      const newIp = event.ip ? await store.remember(event.userId, 'ip', hash('ip', event.ip)) : false;
      const newDevice = device ? await store.remember(event.userId, 'device', hash('device', device)) : false;
      if (send && (newIp || newDevice)) await send(alertText(event, newIp, newDevice));
    } catch (err) {
      onError(err);
    }
  };
}

/** The error line for a failed alert, in the shape the daily report counts ("level":"error"). */
export function alertErrorLine(err: unknown, now = new Date()): string {
  const error = err instanceof Error ? err.message : String(err);
  return JSON.stringify({ time: now.toISOString(), level: 'error', event: 'sign_in_alert_failed', message: 'The new sign-in alert could not be sent', error: error.slice(0, 200) });
}
