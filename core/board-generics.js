// Silinx - an example's top made for another board (#3710): the examples take the board's clock as a generic, CLK_HZ
// (their timing generics default from it: TICK := CLK_HZ, REFRESH := CLK_HZ / 1000…), and the level of its buttons and
// switches as BTN_LOW and SW_LOW (true: they read '0' when pressed or on, as the Numato boards' do), and the level of its
// 7-segment display's digit enables as AN_LOW (true: a digit is on at '0', as the Basys2's is; false on the EDGE
// Spartan 6, #3884). A project made from an example for another board than the example's gets them written as the
// defaults of its top's generics, from the board's pin table: its clock's period, the activeLow of its buttons and
// switches, the activeHigh of its digit enables. Shared by the server's New
// Project (server/projects.js), the browser edition's (web/js/project-store.js) and the tests' example projects.
//
// Isomorphic ES module (browser + Node), no DOM.
import { periodNs } from '../packages/silinx-fpga/src/parts.js';

// a board resource by its name, else the first of its group (as boardAutoAssign finds a port's: Numato's "dip")
const resourceOf = (resources, name, group) => resources.find(r => r.name === name) || resources.find(r => r.group === group) || null;

/** The values of a board (resolveBoard's { resources }): { CLK_HZ, BTN_LOW, SW_LOW, AN_LOW }, each only when the board has
 *  the resource (a board with no clock has no CLK_HZ). */
export function boardGenericValues(resolved) {
  const res = resolved?.resources || [];
  const out = {};
  const clk = resourceOf(res, 'clk', 'Clock');
  // (in whole kHz: the iCEBreaker's 83.333 ns is 12 MHz)
  if (clk) out.CLK_HZ = Math.round(1e6 / periodNs(clk.extra?.period || '20 ns')) * 1000;
  const btn = resourceOf(res, 'btn', 'Buttons'), sw = resourceOf(res, 'sw', 'Switches');
  if (btn) out.BTN_LOW = !!btn.extra?.activeLow;
  if (sw) out.SW_LOW = !!sw.extra?.activeLow;
  // (the digit enables: active low unless the board says activeHigh, #3884)
  const an = res.find(r => r.name === 'an');
  if (an) out.AN_LOW = !an.extra?.activeHigh;
  return out;
}

// a value as the language writes it: 100_000_000 (VHDL, the examples' style), 100000000 (Verilog); true / 1
const literal = (v, lang) => (typeof v === 'boolean' ? (lang === 'verilog' ? (v ? '1' : '0') : String(v))
  : lang === 'verilog' ? String(v) : String(v).replace(/\B(?=(\d{3})+(?!\d))/g, '_'));
// a literal's value: 50_000_000 -> 50000000, true -> true, 1 / 0 (a Verilog flag) as written; null: not a literal
const valueOf = (text) => {
  const t = text.trim().toLowerCase();
  if (t === 'true' || t === 'false') return t === 'true';
  return /^\d[\d_]*$/.test(t) ? Number(t.replace(/_/g, '')) : null;
};

/** The text of a top with these generics' defaults (values: { NAME: number | boolean }), for the generics it declares
 *  with a literal default (VHDL `NAME : integer := 50_000_000`, Verilog `parameter NAME = 50000000`); a default already
 *  of that value is kept as written. Returns { text, changed: [NAME] }. */
export function setGenericDefaults(text, lang, values) {
  const changed = [];
  let out = String(text);
  for (const [name, v] of Object.entries(values)) {
    // the default: one word (a literal: 50_000_000, true, 0), the spaces after it, what ends it (; , ) or nothing), the
    // spaces after that (before a comment)
    const re = lang === 'verilog'
      ? new RegExp(`(\\bparameter\\s+(?:integer\\s+)?${name}\\s*=\\s*)([^\\s,;)]+)([ \\t]*)([,)]*)([ \\t]*)`)
      : new RegExp(`(\\b${name}\\s*:\\s*(?:integer|natural|positive|boolean)\\s*:=\\s*)([^\\s,;)]+)([ \\t]*)([;)]*)([ \\t]*)`, 'i');
    const m = re.exec(out);
    if (!m) continue;
    const was = valueOf(m[2]);
    const same = typeof v === 'boolean' ? was === v || was === (v ? 1 : 0) : was === v;
    if (was === null || same) continue;
    // (the comments after it kept in their column: the spaces after its end, or else before it, take the difference)
    const lit = literal(v, lang), d = m[2].length - lit.length;
    let [ws1, ws2] = [m[3], m[5]];
    if (ws2) ws2 = ' '.repeat(Math.max(1, ws2.length + d));
    else if (ws1) ws1 = ' '.repeat(Math.max(1, ws1.length + d));
    out = out.slice(0, m.index) + m[1] + lit + ws1 + m[4] + ws2 + out.slice(m.index + m[0].length);
    changed.push(name);
  }
  return { text: out, changed };
}

/** The file of sources ([{ path, lang, text }]) that declares the top (an entity or a module of that name), or null. */
export function topFileOf(sources, top) {
  const t = String(top || '').replace(/[^\w$]/g, '');
  if (!t) return null;
  const vhdl = new RegExp(`^\\s*entity\\s+${t}\\s+is\\b`, 'im'), verilog = new RegExp(`^\\s*module\\s+${t}\\b`, 'm');
  return sources.find(s => (s.lang === 'verilog' ? verilog : vhdl).test(s.text || '')) || null;
}

/** The top's file with the board's values (resolveBoard's result), or null when nothing changes: { path, lang, text,
 *  changed: [NAME], values: { NAME: value } (the changed ones) }. */
export function topForBoard(sources, top, resolved) {
  const f = topFileOf(sources, top);
  if (!f || !resolved) return null;
  const all = boardGenericValues(resolved);
  const { text, changed } = setGenericDefaults(f.text, f.lang, all);
  return changed.length ? { path: f.path, lang: f.lang, text, changed, values: Object.fromEntries(changed.map(n => [n, all[n]])) } : null;
}

/** The console's line of a top made for a board (topForBoard's result): its generics' new defaults. */
export function topForBoardText(r, boardName) {
  const what = r.changed.includes('AN_LOW') ? 'clock, inputs and display' : 'clock and inputs';
  return `${r.path}: ${r.changed.map(n => `${n} = ${literal(r.values[n], r.lang)}`).join(', ')}, the ${boardName}'s ${what} (the defaults of its generics).`;
}
