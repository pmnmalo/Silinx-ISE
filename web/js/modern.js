// Silinx interfaces: the modern interface (default) or the classic Xilinx ISE one, the colour theme
// of the modern interface (follows the system, light or dark) and the command palette (Ctrl+K / Cmd+K):
// every menu command and every project file, searched by name.
//
// The two interfaces share the same page and element ids (web/index.html): the modern one is
// web/css/modern.css, applied under <html data-ui="modern">, with the theme in data-theme.
// The palette's matching (fuzzyScore, rankEntries, menuCommands) has no DOM and is unit tested.

export const UI_KEY = 'silinx.ui';
export const THEME_KEY = 'silinx.theme';
export const INTERFACES = ['modern', 'classic'];
export const THEMES = ['system', 'light', 'dark'];

const store = () => { try { return globalThis.localStorage || null; } catch { return null; } };
/** A stored preference, or `def` when it is missing or not one of `allowed`. */
export function readPref(key, allowed, def) {
  let v = null;
  try { v = store()?.getItem(key); } catch { /* storage unavailable */ }
  return allowed.includes(v) ? v : def;
}
function writePref(key, v) { try { store()?.setItem(key, v); } catch { /* ignore */ } }

export const getInterface = () => readPref(UI_KEY, INTERFACES, 'modern');
export const getTheme = () => readPref(THEME_KEY, THEMES, 'system');
/** 'light' or 'dark': the theme shown for a preference (`system` follows the OS). */
export const effectiveTheme = (theme, systemDark) => (theme === 'system' ? (systemDark ? 'dark' : 'light') : theme);

const darkQuery = () => globalThis.matchMedia?.('(prefers-color-scheme: dark)');
const listeners = new Set();
/** Call fn({ ui, theme, shown }) after every change of interface or theme. */
export function onPrefsChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** Puts the preferences on <html>: data-ui (modern | classic) and data-theme (light | dark). */
export function applyPrefs(root = document.documentElement) {
  const ui = getInterface();
  const theme = getTheme();
  const shown = ui === 'modern' ? effectiveTheme(theme, !!darkQuery()?.matches) : 'light';   // the ISE look is light only
  root.dataset.ui = ui;
  root.dataset.theme = shown;
  root.style.colorScheme = shown;
  for (const fn of [...listeners]) { try { fn({ ui, theme, shown }); } catch (e) { console.error(e); } }
  return { ui, theme, shown };
}
export function setInterface(ui) { if (INTERFACES.includes(ui)) { writePref(UI_KEY, ui); applyPrefs(); dispatchEvent(new Event('resize')); } }
export function setTheme(theme) { if (THEMES.includes(theme)) { writePref(THEME_KEY, theme); applyPrefs(); } }
/** The theme button: switches between light and dark (View ▸ Theme ▸ System follows the OS again). */
export function toggleTheme() { setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); }
darkQuery()?.addEventListener?.('change', () => { if (getTheme() === 'system') applyPrefs(); });

// ------------------------------------------------------------------ command palette: matching
/** How well `query` matches `text` (higher is better), or null when it does not. A substring
 *  matches best (at a word start better still); otherwise every character of the query, in order,
 *  either right after the previous one or at the start of a word ("st" → "Set as Top", "nsou" → "New Source"). */
export function fuzzyScore(query, text) {
  const q = String(query || '').toLowerCase().replace(/\s+/g, '');
  const s = String(text || '').toLowerCase();
  if (!q) return 0;
  const wordStart = i => i === 0 || !/[a-z0-9]/.test(s[i - 1]);
  const sub = s.indexOf(String(query).toLowerCase().trim());
  if (sub >= 0) return 1000 - sub + (wordStart(sub) ? 200 : 0) - s.length / 100;
  let score = 0, prev = -1;
  for (const c of q) {
    let i = prev + 1;
    while (i < s.length && !(s[i] === c && (i === prev + 1 || wordStart(i)))) i++;
    if (i >= s.length) return null;
    score += i === prev + 1 ? 8 : 4;
    prev = i;
  }
  return score - s.length / 100;
}

/** The entries matching `query`, best first (all of them, in their order, for an empty query).
 *  An entry matches on its text and on its English text (`en`), so either language finds it. */
export function rankEntries(entries, query, limit = 60) {
  if (!String(query || '').trim()) return entries.slice(0, limit);
  return entries
    .map((e, i) => ({ e, i, s: Math.max(fuzzyScore(query, e.text) ?? -Infinity, fuzzyScore(query, e.en ?? e.text) ?? -Infinity) }))
    .filter(x => x.s > -Infinity)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, limit)
    .map(x => x.e);
}

/** The commands of a menu bar definition ([{ label, items: [...] | () => [...] }]): every enabled
 *  item with an action, submenus included, as { group: 'File', label: 'New Project…', path, shortcut, action }. */
export function menuCommands(menus) {
  const out = [];
  const walk = (items, group, trail) => {
    for (const it of (typeof items === 'function' ? items() : items) || []) {
      if (!it || it === '-') continue;
      const disabled = typeof it.disabled === 'function' ? it.disabled() : it.disabled;
      if (disabled) continue;
      const label = String(it.label).replace(/^\s+|\s+$/g, '');
      if (it.submenu) { walk(it.submenu, group, [...trail, label]); continue; }
      if (!it.action) continue;
      const parts = [group, ...trail, label];
      out.push({ group: [group, ...trail], label, path: parts.join(' › '), shortcut: it.shortcut || '', checked: !!it.checked, action: it.action });
    }
  };
  for (const m of menus || []) walk(m.items, m.label, []);
  return out;
}
