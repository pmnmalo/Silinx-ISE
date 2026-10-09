// web/js/i18n.js: the Portuguese dictionary is well formed and covers the UI labels written in the
// web/js sources (menus, processes, dialogs, editors).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web', 'js');
// the module picks the language from localStorage when it loads
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k) => (k === 'silinx.lang' ? 'pt' : null), setItem() {}, removeItem() {} }, configurable: true, writable: true });
const { t, LOCALES, getLanguage } = await import('../web/js/i18n.js');
const PT = LOCALES.pt;

test('the language comes from localStorage; English has no dictionary', () => {
  assert.equal(getLanguage(), 'pt');
  assert.deepEqual(Object.keys(LOCALES).sort(), ['en', 'pt']);
  assert.deepEqual(LOCALES.en.strings, {});
  assert.equal(LOCALES.pt.name, 'Português');
});

test('Portuguese dictionary: trimmed keys, non-empty translations, valid patterns', () => {
  const keys = Object.keys(PT.strings);
  assert.ok(keys.length > 300, `${keys.length} strings`);
  for (const k of keys) {
    assert.equal(k, k.trim(), `key '${k}' is trimmed`);
    assert.ok(k.length > 0);
    const v = PT.strings[k];
    assert.equal(typeof v, 'string', `translation of '${k}'`);
    assert.ok(v.trim().length > 0, `translation of '${k}' is not empty`);
    assert.equal(t(k), v, `t('${k}')`);
    // placeholders and code-like parts survive the translation
    for (const tok of k.match(/\$\d|\{\w+\}|%\w/g) || []) assert.ok(v.includes(tok), `'${k}' -> '${v}' keeps ${tok}`);
  }
  for (const p of PT.patterns) {
    assert.ok(Array.isArray(p) && p.length === 2, 'pattern is [regexp, replacement]');
    assert.ok(p[0] instanceof RegExp);
    assert.ok(typeof p[1] === 'string' || typeof p[1] === 'function');
    assert.ok(p[0].source.startsWith('^') && p[0].source.endsWith('$'), `pattern ${p[0]} is anchored`);
  }
});

test('t(): exact strings, patterns, surrounding whitespace, unknown text unchanged', () => {
  assert.equal(t('File'), 'Ficheiro');
  assert.equal(t('  Check Syntax  '), '  Verificar Sintaxe  ');
  assert.equal(t('Processes: top'), 'Processos: top');
  assert.equal(t('Number of DCMs'), 'Número de DCMs');
  assert.equal(t('Example: blinky'), 'Exemplo: blinky');
  assert.equal(t('Version 15.5.0'), 'Versão 15.5.0');
  assert.equal(t('SW3 = sw(3) (pin P11) — click to toggle'), 'SW3 = sw(3) (pino P11) — clique para comutar');
  assert.equal(t('Clock clk: 50 MHz on the board · not emulated: vga_red'), 'Relógio clk: 50 MHz na placa · não emulado: vga_red');
  assert.equal(t('some text that is not in the dictionary'), 'some text that is not in the dictionary');
  assert.equal(t(''), '');
  assert.equal(t(null), null);
});

// UI labels written as literals in the sources: label: '…', title: '…', field('…', …), headings…
function sourceLabels() {
  const out = new Map();
  for (const f of fs.readdirSync(WEB).filter((x) => x.endsWith('.js') && !/^(i18n|schematic-demo-data|icons)\.js$/.test(x))) {
    const src = fs.readFileSync(path.join(WEB, f), 'utf8');
    const add = (s) => { if (/[A-Za-z]{2}/.test(s) && !s.includes('\\')) out.set(s, f); };
    for (const re of [/\blabel: '([^'$`]+)'/g, /\btitle: '([^'$`]+)'/g, /\bfield\('([^'$`]+)'/g, /\bplaceholder: '([^'$`]+)'/g,
      /\bh\('(?:h2|h3|h4|th|label|button|summary|caption)', \{[^{}]*\}, '([^'$`]+)'\)/g]) {
      for (const m of src.matchAll(re)) add(m[1]);
    }
  }
  return out;
}

test('every UI label in the web/js sources has a Portuguese translation', () => {
  // the same in both languages: names, codes, abbreviations
  const SAME = new Set(['work', 'iMPACT', 'OK', 'MSB', 'LSB', 'Bitstream', 'labels', 'Slew', 'Pull', 'Case', 'Flip-Flops', 'VHDL', 'Verilog', 'ISim', 'Bidir',
    'schematic' /* default architecture name */, 'iMPACT — Boundary Scan']);
  const labels = sourceLabels();
  assert.ok(labels.size > 200, `${labels.size} labels found`);
  const missing = [...labels].filter(([s]) => !SAME.has(s) && !/^[^a-z]*$/.test(s) && t(s) === s).map(([s, f]) => `${f}: ${s}`);
  assert.deepEqual(missing, []);
});

test('design checks: the Edit menu item, its messages and the labels of the help (core/hints.js) are translated', async () => {
  assert.equal(t('Design Checks (Lint Warnings)'), 'Verificações do Circuito (Avisos de Lint)');
  for (const s of ['Design checks on: Check Syntax and the editor show the lint warnings', 'Design checks off: only errors are shown']) assert.notEqual(t(s), s, s);
  // the help of the Errors / Warnings tabs is rendered per language (the console pages are not translated by the DOM pass)
  const { HINT_LABELS } = await import('../core/hints.js');
  assert.deepEqual(HINT_LABELS.pt, { explain: 'Explicação', fix: 'Como corrigir', more: 'Explicação e correção' });
});
