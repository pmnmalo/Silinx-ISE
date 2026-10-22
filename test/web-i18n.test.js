// web/js/i18n.js: the Portuguese dictionary is well formed and covers the UI labels written in the
// web/js sources (menus, processes, dialogs, editors).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';

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

// a key written twice in an object literal is lost to the second one (the standalone build warns of it)
test('no dictionary in web/js/i18n*.js has a key written twice (#362)', () => {
  const files = fs.readdirSync(WEB).filter((f) => /^i18n.*\.js$/.test(f));
  assert.ok(files.length >= 9, files.join(', '));
  const dups = files.flatMap((f) => transformSync(fs.readFileSync(path.join(WEB, f), 'utf8'), { loader: 'js', sourcefile: f }).warnings
    .filter((w) => w.id === 'duplicate-object-key').map((w) => `${f}:${w.location.line}: ${w.text}`));
  assert.deepEqual(dups, []);
  // the check itself: esbuild reports a key written twice
  const w = transformSync("const PT = { 'Test bench name:': 'a', 'Test bench name:': 'b' };", { loader: 'js' }).warnings;
  assert.deepEqual(w.map((x) => [x.id, x.text]), [['duplicate-object-key', 'Duplicate key "Test bench name:" in object literal']]);
});

test('t(): exact strings, patterns, surrounding whitespace, unknown text unchanged', () => {
  assert.equal(t('File'), 'Ficheiro');
  assert.equal(t('  Check Syntax  '), '  Verificar Sintaxe  ');
  assert.equal(t('Processes: top'), 'Processos: top');
  assert.equal(t('Number of DCMs'), 'Número de DCMs');
  assert.equal(t('Example: blinky'), 'Exemplo: blinky');
  // a task's button with its dot (#991): the task and its state
  assert.equal(t('Implement — done with warnings'), 'Implementar — concluído com avisos');
  assert.equal(t('Design — done, no warnings'), 'Design — concluído, sem avisos', 'the Design task: Design in Portuguese too (#1046)');
  assert.equal(t('Design'), 'Projeto', 'elsewhere (the Design pane, the console\'s filter): Projeto; the task keeps Design with data-i18n-keep');
  assert.equal(t('Simulate — out of date (a source changed)'), 'Simular — desatualizado (uma fonte mudou)');
  assert.equal(t('Implement — errors'), 'Implementar — erros');
  assert.equal(t('Implement — running…'), 'Implementar — em curso…');
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
    'schematic' /* default architecture name */, 'iMPACT — Boundary Scan', 'Interface' /* the same word in Portuguese */]);
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

test('gates (#328): the Inverted inputs field and the XOR2B1 / XOR2B2 descriptions are translated', async () => {
  const { SYMBOLS } = await import('../core/schdoc.js');
  assert.equal(t('Inverted inputs'), 'Entradas invertidas');
  assert.equal(t(SYMBOLS.xor2b1.description), 'Porta XOR de 2 entradas com a entrada I0 invertida (bit a bit quando Largura > 1)');
  assert.equal(t(SYMBOLS.xnor3b2.description), 'Porta XNOR de 3 entradas com as entradas I0 e I1 invertidas (bit a bit quando Largura > 1)');
  // #334: the palette's one MUX, its Select bits
  assert.equal(t(SYMBOLS.mux2.paletteDescription), 'Multiplexador de 2, 4, 8 ou 16 entradas de dados, os bits de seleção (1 a 4), o barramento de seleção e a habilitação nas suas propriedades (bit a bit quando Largura > 1)');
  assert.notEqual(t('Select bits'), 'Select bits');
  assert.notEqual(t(SYMBOLS.demux.description), SYMBOLS.demux.description);
  // #330: the palette's one entry a gate
  assert.equal(t(SYMBOLS.and2.paletteDescription), 'Porta AND de 2, 3 ou 4 entradas, as entradas e as entradas invertidas nas suas propriedades (bit a bit quando Largura > 1)');
  for (const g of ['or2', 'nand2', 'nor2', 'xor2', 'xnor2']) assert.match(t(SYMBOLS[g].paletteDescription), /^Porta X?N?(AND|OR) de 2, 3 ou 4 entradas/);
  assert.equal(t('3-input XNOR gate (bitwise when Width > 1)') !== '3-input XNOR gate (bitwise when Width > 1)', true);
  assert.equal(t('Inputs'), 'Entradas');
  assert.equal(t(SYMBOLS.xor2b2.description), 'Porta XOR de 2 entradas com as entradas I0 e I1 invertidas (bit a bit quando Largura > 1)');
});

test('emulator (#347): the manual clock note is translated', () => {
  assert.equal(t('Manual clock clk (BTN): one edge per press'), 'Relógio manual clk (BTN): um flanco em cada pressão');
  assert.equal(t('Manual clock ck (SW): one edge per press · not emulated: x'), 'Relógio manual ck (SW): um flanco em cada pressão · não emulado: x');
});

test('the wave configuration (#1019): its buttons, dialogs and messages translated', () => {
  assert.deepEqual(['Save Wave Configuration', 'Load Wave Configuration', 'File name in the project:', 'Wave configuration:', 'Load',
    'The project has no wave configuration (.wcfg) yet: save one first.',
    "'a b' is not a valid file name (letters, digits, _ . - and folders; .wcfg).", 'sim/tb.wcfg already exists. Overwrite it?'].map(t),
  ['Guardar Configuração de Formas de Onda', 'Carregar Configuração de Formas de Onda', 'Nome do ficheiro no projeto:', 'Configuração de formas de onda:', 'Carregar',
    'O projeto ainda não tem configurações de formas de onda (.wcfg): guarde uma primeiro.',
    "'a b' não é um nome de ficheiro válido (letras, algarismos, _ . - e pastas; .wcfg).", 'sim/tb.wcfg já existe. Substituí-lo?']);
});

test('SSim (#920): the simulator\'s labels translated with its name, SSim; no label of it says ISim', () => {
  assert.deepEqual(['SSim Simulator', 'Type an SSim command (help)', 'SSim (VHDL/Verilog; Silinx Simulator)'].map(t),
    ['Simulador SSim', 'Escreva um comando do SSim (help)', 'SSim (VHDL/Verilog; Simulador Silinx)']);
  // (ISim, Xilinx's simulator, only in the trademark notice)
  const isim = [...sourceLabels()].map(([s]) => s).filter((s) => /\bISim\b/.test(s) && !/trademarks of AMD/.test(s));
  assert.deepEqual(isim, []);
});

test('ISim groups (#341): the menu items and the prompt are translated', () => {
  assert.deepEqual(['New Group', 'Rename Group...', 'Ungroup', 'Group name:'].map(t), ['Novo Grupo', 'Mudar Nome do Grupo...', 'Desagrupar', 'Nome do grupo:']);
});

test('ISim stimuli (#336): the bar, the dialogs, the status, the errors and Save as Test Bench are translated', () => {
  for (const [en, pt] of [
    ['Fill Expected Outputs', 'Preencher Saídas Esperadas'], ['Save as Test Bench…', 'Guardar como Bancada de Teste…'], ['Stimulus Timing', 'Temporização dos Estímulos'],
    ['None (combinational)', 'Nenhum (combinatório)'], ['Test bench name:', 'Nome da bancada de teste:'],
    ['8 cycles (clock clk, period 20 ns): 2 mismatch(es)', '8 ciclos (relógio clk, período 20 ns): 2 diferença(s)'],
    ['16 cycles (combinational, step 10 ns): no expected outputs', '16 ciclos (combinatório, passo 10 ns): sem saídas esperadas'],
    ['4 cycles (clock ck, period 8 ns): expected outputs OK', '4 ciclos (relógio ck, período 8 ns): saídas esperadas certas'],
    ['Cycles: a whole number of at least 1', 'Ciclos: um número inteiro de pelo menos 1'],
    ["'2q' is not a value (bits 0 1 Z X, h… hexadecimal or d… decimal)", "'2q' não é um valor (bits 0 1 Z X, h… hexadecimal ou d… decimal)"],
    ["'h1F' does not fit in 4 bit(s)", "'h1F' não cabe em 4 bit(s)"],
  ]) assert.equal(t(en), pt);
  assert.match(t('The inputs of ctr as a grid of cycles: with a clock, the inputs change at its falling edge and the outputs are checked before the next one; without one, at every time step.'), /^As entradas de ctr como uma grelha de ciclos/);
});

test('tri-state buffers: the palette category, parameter labels and the descriptions of TBUF and every preset are translated', async () => {
  const { SYMBOLS } = await import('../core/schdoc.js');
  const S = SYMBOLS.tbuf;
  assert.equal(t('Tri-State'), 'Três estados');
  assert.equal(t('Tri-State (2)'), 'Três estados (2)');
  for (const p of S.params) assert.notEqual(t(p.label), p.label, p.label);
  assert.equal(t('Enable input'), 'Entrada de habilitação');
  for (const d of [S.description, ...S.presets.map(p => p.description)]) {
    const v = t(d);
    assert.notEqual(v, d, d);
    assert.match(v, /três estados/);
  }
  // (#326: BUFE and BUFT only, their Width and Pins per bit making BUFT8, BUFE4…)
  assert.deepEqual(S.presets.map(p => p.title), ['BUFE', 'BUFT']);
  assert.equal(t(S.presets.find(p => p.title === 'BUFT').description), 'Buffer de três estados, habilitação T ativa a 0: O = I quando T = 0, Z quando T = 1');
  assert.equal(t('Pins per bit (I0.., O0..)'), 'Um pino por bit (I0.., O0..)');
});

test('schematic editor and its RTL / Technology views (#130): every symbol description, parameter and option, the texts of web/js/sch-editor.js and its parts', async () => {
  const { SYMBOLS } = await import('../core/schdoc.js');
  // the same in Portuguese: Buffer, Reset, one-hot, INIT, the comparison operators
  const SAME = new Set(['Buffer', 'Reset', 'one-hot', 'INIT', 'eq', 'ne', 'lt', 'le', 'gt', 'ge']);
  const missing = [];
  const check = (s, what) => { if (/[A-Za-z]{2}/.test(s || '') && !SAME.has(s) && t(s) === s) missing.push(`${what}: ${s}`); };
  for (const [type, S] of Object.entries(SYMBOLS)) {
    check(S.description, type);
    for (const p of S.presets || []) check(p.description, `${type} ${p.title}`);
    // (a device primitive's attributes, #791: their UNISIM names and values, as the HDL writes them)
    for (const p of S.params || []) if (!p.attr) { check(p.label, `${type} parameter`); for (const o of p.options || []) check(Array.isArray(o) ? o[1] : o, `${type} option`); }
  }
  // text: '…' literals of the editor (captions, panel titles, options), besides the labels checked above; the editor's
  // parts in modules of their own (#405) too
  // (the editor's labels: in its parts too since #405)
  for (const f of ['sch-editor.js', 'sch-props.js', 'sch-tools.js', 'sch-palette.js', 'sch-toolbar.js', 'sch-try.js']) {
    const src = fs.readFileSync(path.join(WEB, f), 'utf8');
    for (const m of src.matchAll(/\btext: '([^'$`]+)'/g)) if (/[a-z]{2}/.test(m[1]) && !['labels', 'Verilog', 'schematic'].includes(m[1])) check(m[1], f);
  }
  assert.deepEqual(missing, []);
  // exact translations: palette, tooltips, properties, the status bar
  const T = {
    '<--All Symbols-->': '<--Todos os Símbolos-->', Properties: 'Propriedades', Symbols: 'Símbolos', Categories: 'Categorias', Parameters: 'Parâmetros',
    Inverter: 'Inversor', '2-input AND gate (bitwise when Width > 1)': 'Porta AND de 2 entradas (bit a bit quando Largura > 1)',
    '5-input NOR gate (bitwise when Width > 1)': 'Porta NOR de 5 entradas (bit a bit quando Largura > 1)',
    'Module lut4': 'Módulo lut4', 'Module Blink_Ctrl': 'Módulo Blink_Ctrl', 'Pins (5)': 'Pinos (5)', 'Wire · net clk': 'Fio · rede clk',
    "Net 'clk', 1 bit": "Rede 'clk', 1 bit", "Net 'leds', 8 bits": "Rede 'leds', 8 bits", 'VHDL statements (emitted verbatim)': 'Instruções VHDL (copiadas tal e qual)',
    '2 objects selected': '2 objetos selecionados', '1 symbol, 3 nets': '1 símbolo, 3 redes', '12 symbols, 30 nets · 0 error(s), 2 warning(s)': '12 símbolos, 30 redes · 0 erro(s), 2 aviso(s)',
    '3 ports · VHDL · src/knight.vhd': '3 portos · VHDL · src/knight.vhd', '1 ports': '1 porto', 'Check Schematic: 1 error(s), 0 warning(s)': 'Verificar Esquemático: 1 erro(s), 0 aviso(s)',
    'Open top.vhd': 'Abrir top.vhd', 'Open pong.v': 'Abrir pong.v', 'Drawing Technology schematic of top…': 'A desenhar o esquemático tecnológico de top…',
    'Drawing RTL schematic of knight…': 'A desenhar o esquemático RTL de knight…',
  };
  for (const [en, pt] of Object.entries(T)) assert.equal(t(en), pt, en);
  // not a source file: unchanged
  assert.equal(t('Open file'), 'Abrir ficheiro');
  assert.equal(t('Open the project'), 'Open the project');
});
