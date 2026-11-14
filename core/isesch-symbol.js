// Silinx - a module's symbol read from ISE's drawing of it (#3828): an ISE schematic symbol (a .sym, or the blockdef a
// sheet carries) with pins on any side, as ISE's Symbol Wizard or Silinx's export (core/isesch-export.js, a module's
// symbol of its own, core/symbol-layout.js) draws it, read as a Silinx symbol: each pin's side (left W, right E, top N,
// bottom S, from where it is against the body's rectangle), their order along each side and their spacing. The
// import of a schematic places a module's instance with it, and the import of an ISE project writes it as the module's
// <module>.sym.json (core/xise.js iseModuleSymbols). A symbol drawn as Silinx draws one by default (the inputs on the
// left, the outputs on the right, in the module's order, 20 apart) is none. Isomorphic (no DOM, no Node APIs).
import { parseXml, parseIseName, lc } from './isesch.js';
import { SPACING, newSymbol } from './symbol-layout.js';

const S_IN = 5 / 16;                      // ISE units -> Silinx px (a pin pitch of 64 -> 20)

/** The body's rectangle of an ISE symbol's text (a .sym in XML: its graph's first rect), or null. */
export function iseSymbolRect(text) {
  let root;
  try { root = parseXml(String(text ?? '').replace(/^﻿/, '')); } catch { return null; }
  const find = el => { for (const c of el?.children || []) { if (c.tag === 'rect') return c; const r = find(c); if (r) return r; } return null; };
  const r = find(root);
  const n = v => { const x = parseFloat(v); return Number.isFinite(x) ? x : null; };
  if (!r) return null;
  const rect = { x: n(r.attrs.x), y: n(r.attrs.y), w: n(r.attrs.width), h: n(r.attrs.height) };
  return Object.values(rect).every(v => v != null) ? rect : null;
}

/**
 * The Silinx symbol of module `mod` ({ name, ports }) drawn by ISE as `pins` ([{ name, x, y }], ISE units: the pins'
 * points) around `rect` (the body: { x, y, w, h }; none: the pins' extremes say the sides), or null: a pin not one of
 * its ports, a port with no pin, or the default symbol.
 */
export function iseSymbolLayout(pins, rect, mod) {
  if (!mod?.ports?.length || !pins?.length) return null;
  const port = n => mod.ports.find(q => lc(q.name) === lc(parseIseName(n).base));
  const list = pins.map(p => ({ ...p, port: port(p.name) }));
  if (list.some(p => !p.port) || new Set(list.map(p => lc(p.port.name))).size !== mod.ports.length || list.length !== mod.ports.length) return null;
  const xs = list.map(p => p.x), ys = list.map(p => p.y);
  const side = rect
    ? p => (p.x < rect.x ? 'W' : p.x > rect.x + rect.w ? 'E' : p.y < rect.y ? 'N' : 'S')
    : p => (p.x === Math.min(...xs) ? 'W' : p.x === Math.max(...xs) ? 'E' : p.y === Math.min(...ys) ? 'N' : 'S');
  for (const p of list) p.side = side(p);
  const along = p => (p.side === 'W' || p.side === 'E' ? p.y : p.x);
  const order = ['W', 'E', 'N', 'S'];
  list.sort((a, b) => order.indexOf(a.side) - order.indexOf(b.side) || along(a) - along(b));
  // (the spacing: the nearest pins of a side, as Silinx's 10-px grid takes it)
  const gaps = order.flatMap(s => { const v = list.filter(p => p.side === s).map(along); return v.slice(1).map((x, i) => x - v[i]); }).filter(g => g > 0);
  const spacing = gaps.length ? Math.min(SPACING.max, Math.max(SPACING.min, Math.round((Math.min(...gaps) * S_IN) / 10) * 10)) : SPACING.default;
  const symbol = { ...newSymbol(mod), pins: list.map(p => ({ name: p.port.name, side: p.side })), spacing };
  const dflt = newSymbol(mod);
  // (the default one: each port on its default side, in the module's order along it)
  const key = s => order.map(k => s.pins.filter(q => q.side === k).map(q => lc(q.name)).join(',')).join('|');
  return key(symbol) === key(dflt) && spacing === SPACING.default ? null : symbol;
}

/** The Silinx symbol of module `mod` drawn by an ISE .sym's text, or null (parsed: parseIseSym's { pins }). */
export function iseSymFileLayout(text, parsed, mod) {
  return iseSymbolLayout(parsed?.pins || [], iseSymbolRect(text), mod);
}
