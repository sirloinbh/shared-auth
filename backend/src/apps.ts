// The display names of the daysofme apps, by subdomain. Copied from `displayName` and `service.subdomain` in
// sirloinbh/project-standards registry/projects.json; add a line here when an app is added there.
const APPS: Record<string, string> = {
  'workout-memo': 'FORM · My Workout Log',
  'study-log': 'Study Log',
  'health-log': 'Diet, Sleep and Health Log',
  'life-journal': 'Reviews & Diary',
  'money-ledger': 'Ledger, Assets, Mock Trading',
  'cert-manager': 'Cert Manager',
  'plan-routine': 'Plan · Practice · Routine · Feedback',
  'dev-career-portfolio': 'Dev Career Portfolio',
};

/**
 * Names the place a sign-in returns to: the app's display name for a known app subdomain, otherwise the host.
 * `ownOrigin` is this service, whose pages are named "your account".
 */
export function returnName(returnTo: string, ownOrigin: string): string {
  let url: URL;
  try {
    url = new URL(returnTo);
  } catch {
    return 'your account';
  }
  if (url.origin === new URL(ownOrigin).origin) return 'your account';
  return APPS[url.hostname.split('.')[0] ?? ''] ?? url.hostname;
}
