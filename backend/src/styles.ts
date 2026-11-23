// The page stylesheet, built on the shared design tokens of the daysofme apps.
// The values are copied from @sirloinbh/design-tokens (sirloinbh/project-standards packages/design-tokens/tokens.css)
// because this service has no frontend build. When the tokens change, copy the new values and raise TOKENS_VERSION.

export const TOKENS_VERSION = '1.1.0';

// Only the tokens these pages use. Light is the default; dark follows the system setting, as in the apps (ADR-0008).
const LIGHT = `
    --font-family-sans: "Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
    --radius: 0.625rem;
    --touch-target: 44px;
    --background: oklch(1 0 0);
    --foreground: oklch(0.145 0 0);
    --card: oklch(1 0 0);
    --card-foreground: oklch(0.145 0 0);
    --primary: oklch(0.205 0 0);
    --primary-foreground: oklch(0.985 0 0);
    --secondary: oklch(0.97 0 0);
    --secondary-foreground: oklch(0.205 0 0);
    --muted-foreground: oklch(0.556 0 0);
    --accent: oklch(0.97 0 0);
    --accent-foreground: oklch(0.205 0 0);
    --destructive: oklch(0.577 0.245 27.325);
    --border: oklch(0.922 0 0);
    --input: oklch(0.922 0 0);
    --ring: oklch(0.708 0 0);
    --duration-fast: 150ms;
    --ease-standard: cubic-bezier(0.16, 1, 0.3, 1);`;

const DARK = `
    --background: oklch(0.145 0 0);
    --foreground: oklch(0.985 0 0);
    --card: oklch(0.205 0 0);
    --card-foreground: oklch(0.985 0 0);
    --primary: oklch(0.922 0 0);
    --primary-foreground: oklch(0.205 0 0);
    --secondary: oklch(0.269 0 0);
    --secondary-foreground: oklch(0.985 0 0);
    --muted-foreground: oklch(0.708 0 0);
    --accent: oklch(0.269 0 0);
    --accent-foreground: oklch(0.985 0 0);
    --destructive: oklch(0.704 0.191 22.216);
    --border: oklch(1 0 0 / 10%);
    --input: oklch(1 0 0 / 15%);
    --ring: oklch(0.556 0 0);`;

export const STYLES = `
  :root { color-scheme: light;${LIGHT}
  }
  @media (prefers-color-scheme: dark) {
    :root { color-scheme: dark;${DARK}
    }
  }
  @media (prefers-reduced-motion: reduce) { :root { --duration-fast: 0ms; } }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 1.5rem 1rem; background: var(--background); color: var(--foreground); font: 400 1rem/1.6 var(--font-family-sans); -webkit-font-smoothing: antialiased; }
  main { width: min(24rem, 100%); display: grid; gap: 1rem; }
  p { margin: 0; }
  .brand { text-align: center; font-size: 1.125rem; line-height: 1.75rem; font-weight: 700; letter-spacing: -0.02em; }
  .card { display: grid; gap: 1rem; padding: 2rem 1.5rem; border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); color: var(--card-foreground); box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1); }
  h1 { margin: 0; font-size: 1.5rem; line-height: 2rem; font-weight: 700; letter-spacing: -0.02em; text-align: center; }
  h1 + .lead { margin-top: -0.75rem; }
  h2 { margin: 0.5rem 0 -0.5rem; font-size: 0.875rem; line-height: 1.25rem; font-weight: 600; }
  .lead { text-align: center; font-size: 0.875rem; line-height: 1.25rem; color: var(--muted-foreground); }
  .lead strong { color: var(--card-foreground); font-weight: 600; }
  .note { text-align: center; font-size: 0.75rem; line-height: 1rem; color: var(--muted-foreground); }
  .stack { display: grid; gap: 0.75rem; }
  .list { margin: 0; padding: 0; list-style: none; border: 1px solid var(--border); border-radius: calc(var(--radius) - 2px); }
  .list li { display: flex; align-items: center; gap: 0.75rem; min-height: 3.5rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; }
  .list li + li { border-top: 1px solid var(--border); }
  .grow { flex: 1; min-width: 0; }
  .title { display: block; font-weight: 500; }
  .meta { display: block; font-size: 0.75rem; line-height: 1rem; color: var(--muted-foreground); overflow-wrap: anywhere; }
  .badge { white-space: nowrap; padding: 0.125rem 0.5rem; border-radius: calc(var(--radius) - 4px); background: var(--secondary); color: var(--secondary-foreground); font-size: 0.75rem; line-height: 1rem; font-weight: 500; }
  .mark { width: 1.25rem; height: 1.25rem; flex: none; }
  button { white-space: nowrap; display: flex; align-items: center; justify-content: center; gap: 0.75rem; min-height: var(--touch-target); padding: 0.5rem 1rem; border: 1px solid var(--input); border-radius: calc(var(--radius) - 2px); background: var(--background); color: var(--foreground); font: 500 0.875rem/1.25rem var(--font-family-sans); cursor: pointer; transition: background-color var(--duration-fast) var(--ease-standard); }
  button:hover { background: var(--accent); color: var(--accent-foreground); }
  button.primary { border-color: var(--primary); background: var(--primary); color: var(--primary-foreground); }
  button.primary:hover { opacity: 0.9; }
  button.small { min-height: 2.25rem; padding: 0.25rem 0.75rem; }
  button:focus-visible { outline: 3px solid var(--ring); outline-offset: 2px; }
  button:disabled { opacity: 0.5; cursor: default; }
  .error { text-align: center; font-size: 0.875rem; line-height: 1.25rem; color: var(--destructive); }
  .error:empty { display: none; }
  @media (pointer: coarse) { button.small { min-height: var(--touch-target); } }
`;
