// Light or dark look (S15). Stored on this phone only; "system" follows the phone's own setting.
export type Theme = 'system' | 'light' | 'dark';

const KEY = 'kalender-theme';

export function savedTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

/** Sets data-theme on <html> (index.html does the same before first paint) and keeps the browser bar in step. */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
  try {
    if (theme === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // private mode: the choice lasts until the tab closes
  }
  const ground = getComputedStyle(root).getPropertyValue('--ground').trim();
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    meta.dataset.base ??= meta.content;
    meta.content = theme === 'system' ? meta.dataset.base : ground;
  });
}
