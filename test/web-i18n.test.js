// web/js/i18n.js: the Portuguese dictionary is well formed and covers the UI labels written in the
// web/js sources (menus, processes, dialogs, editors).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';
import { execSync } from 'node:child_process';
import { literalsOf } from './js-literals.js';

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
  // the test designs in New Project (#1746)
  assert.equal(t('Test design: full_adder'), 'Projeto de teste: full_adder');
  assert.equal(t("The test design has its own sources and its test: a test bench (Simulate), or the C program's main() (C Simulation)."), 'O projeto de teste tem as suas próprias fontes e o seu teste: uma bancada de teste (Simular), ou o main() do programa em C (Simulação de C).');
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
  // #1232: a name with $&, $', $` or $$ (a project, a file) comes out as written, its surrounding whitespace kept
  for (const n of ["a$&b", "x$'y", 'p$`q', 'm$$n', '$1'])
    assert.equal(t(`  Reopen ${n} `), `  Reabrir ${n} `, n);
  assert.equal(t("The top-level module 'a$&b' is not in the project."), "O módulo de topo 'a$&b' não está no projeto.");
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

test('the Development menu\'s Pen and Touch Test (#1054): its labels, its states and Silinx\'s actions translated; the report in English', async () => {
  // every capitalised text of web/js/devmenu-pointer.js but the report's (English, pasted into an issue) and the name
  const src = fs.readFileSync(path.join(WEB, 'devmenu-pointer.js'), 'utf8');
  const texts = [...new Set([...src.matchAll(/'([A-Z][^'$`]*[a-z][^'$`]*)'/g)].map((m) => m[1]))].filter((s) => !['Silinx', 'Silinx ISE: pen and touch test'].includes(s));
  assert.ok(texts.length >= 20, texts.join(', '));
  assert.deepEqual(texts.filter((s) => t(s) === s), []);
  assert.equal(t('Pen and Touch Test…'), 'Teste de Caneta e Toque…');
  assert.equal(t('Two-finger pan and zoom'), 'Deslocar e ampliar com dois dedos');
  assert.equal(t('Pointers down at once: 2 (most: 3)'), 'Ponteiros premidos ao mesmo tempo: 2 (máximo: 3)');
});

test('the handwritten input (#1056): the texts of its modules and the recognizer\'s messages are translated', async () => {
  // the literals of the dialog and the pad: texts of elements, messages, titles (besides the labels checked above)
  const missing = [];
  let n = 0;
  for (const f of ['ink-dialog.js', 'ink-pad.js', 'ink-table-dialog.js', 'ink-schematic-dialog.js', 'sch-ink.js', 'ink-drawing.js']) {
    const src = fs.readFileSync(path.join(WEB, f), 'utf8');
    for (const m of src.matchAll(/(?:\}, |textContent = |showMsg\(\[|return )(['"])((?:(?!\1).)*[a-z]{2}(?:(?!\1).)*)\1/g)) { n++; if (t(m[2]) === m[2]) missing.push(`${f}: ${m[2]}`); }
  }
  assert.deepEqual(missing, []);
  assert.ok(n >= 12, `${n} texts`);
  const T = {
    'Samples of your handwriting: 3': 'Amostras da sua letra: 3', "Sample of 'A' saved.": "Amostra de 'A' guardada.",
    'Type one symbol of the set: A B C': 'Escreva um símbolo do conjunto: A B C',
    'A symbol was not recognized (shown as ?): write it again, or teach Silinx your handwriting.': 'Um símbolo não foi reconhecido (mostrado como ?): escreva-o de novo, ou ensine ao Silinx a sua letra.',
    '2 symbols were not recognized (shown as ?): write them again, or teach Silinx your handwriting.': '2 símbolos não foram reconhecidos (mostrados como ?): escreva-os de novo, ou ensine ao Silinx a sua letra.',
    "More than one '=': only the first one separates the name from the expression.": "Mais de um '=': só o primeiro separa o nome da expressão.",
    'Nothing written: write the expression on the pad.': 'Nada escrito: escreva a expressão na área de escrita.',
    'Expression: 1 to 6 inputs (it has 7).': 'Expressão: 1 a 6 entradas (tem 7).', "Expression: 'F-1' is not a valid output name.": "Expressão: 'F-1' não é um nome de saída válido.",
    "Expression: the output 'a' is also an input.": "Expressão: a saída 'a' é também uma entrada.", "Expression: unexpected '+' (at position 3)": "Expressão: unexpected '+' (at position 3)",
    'Handwritten Algebra…': 'Álgebra Manuscrita…', 'Algebra from Module…': 'Álgebra de um Módulo…', 'The output F has two expressions.': 'A saída F tem duas expressões.',
    'F is both an output and an input: an expression of the inputs only.': 'F é uma saída e uma entrada: uma expressão só das entradas.',
    '7 inputs (A, B, C, D, E, G, H): at most 6.': '7 entradas (A, B, C, D, E, G, H): no máximo 6.',
    'Handwritten Expression': 'Expressão Manuscrita', 'Teach Silinx my handwriting': 'Ensinar ao Silinx a minha letra',
    // the truth tables drawn by hand (#1066)
    'Handwritten Boolean Algebra…': 'Álgebra Booleana Manuscrita…', 'Handwritten Schematic…': 'Esquemático Manuscrito…', 'Header: two names over column 2 (A, B).': 'Cabeçalho: dois nomes sobre a coluna 2 (A, B).',
    'Row 3, column 1: no value.': 'Linha 3, coluna 1: sem valor.', 'Row 3, column 1: 2 symbols.': 'Linha 3, coluna 1: 2 símbolos.',
    'Column 3 has no name: out1.': 'A coluna 3 não tem nome: out1.', "Line 1: '1b' is not a name.": "Linha 1: '1b' não é um nome.",
    "Line 1: 'A' is named twice.": "Linha 1: 'A' aparece duas vezes.", '1 to 6 inputs (the table has 7).': '1 a 6 entradas (a tabela tem 7).',
    'Line 2: 2 values, 3 expected.': 'Linha 2: 2 valores, 3 esperados.', "Line 2: an input is 'X': only 0 or 1.": "Linha 2: uma entrada é 'X': só 0 ou 1.",
    "Line 2: an output is '?': only 0, 1 or X.": "Linha 2: uma saída é '?': só 0, 1 ou X.", 'Lines 2 and 3: the inputs 01 with other outputs.': 'Linhas 2 e 3: as entradas 01 com outras saídas.',
    'Line 3 repeats line 2.': 'A linha 3 repete a linha 2.', 'Not in the table: 00, 01 (their outputs are 0).': 'Fora da tabela: 00, 01 (as suas saídas são 0).',
    'Not in the table: 0001, 0010 and 7 more (their outputs are 0).': 'Fora da tabela: 0001, 0010 e mais 7 (as suas saídas são 0).',
    // the schematics drawn by hand (#1067)
    'Two gate outputs are joined (U1, U2).': 'Duas saídas de portas estão ligadas (U1, U2).', 'U2 (NOR): no wire from its output.': 'U2 (NOR): nenhum fio sai da sua saída.',
    'U3 (NOT): 2 inputs, 1 expected.': 'U3 (NOT): 2 entrada(s), 1 esperada.', 'U1 (AND): 1 input, 2 to 5 expected.': 'U1 (AND): 1 entrada(s), 2 a 5 esperadas.',
    'Two names on one net: A, B.': 'Dois nomes numa só rede: A, B.', 'The output of U2 has no name: out1.': 'A saída de U2 não tem nome: out1.',
    "A wire to U1 starts at no output and no name: write the input's name at its end.": 'Um fio para U1 não começa numa saída nem num nome: escreva o nome da entrada na sua ponta.',
    "'_F' is not a name: correct it.": "'_F' não é um nome: corrija-o.", 'The name A is on two nets.': 'O nome A está em duas redes.',
    "The name Q is at no wire's end.": 'O nome Q não está na ponta de nenhum fio.', '3 wire ends touch nothing.': '3 pontas de fios não tocam em nada.',
    'A wire of F could not be routed clear of the others: check it.': 'Um fio de F não pôde ser traçado livre dos outros: verifique-o.',
    "A wire of U2's output could not be routed clear of the others: check it.": 'Um fio da saída de U2 não pôde ser traçado livre dos outros: verifique-o.',
    // a drawing kept (#1749)
    'This is a drawing of a schematic, not of an expression.': 'É um desenho de um esquemático, não de uma expressão.',
    'A Silinx drawing of version 2: this Silinx reads version 1.': 'Um desenho do Silinx da versão 2: este Silinx lê a versão 1.',
    "A Silinx drawing of an unknown kind: 'fsm'.": "Um desenho do Silinx de um tipo desconhecido: 'fsm'.",
    // the flip-flops drawn by hand (#1083)
    "U1 (flip-flop): 'X' is not one of its pins (D, T, J, K, C, CE, CLR, PRE, R, S; Q, Q̄).": "U1 (flip-flop): 'X' não é um dos seus pinos (D, T, J, K, C, CE, CLR, PRE, R, S; Q, Q̄).",
    'U1 (flip-flop): two wires to D.': 'U1 (flip-flop): dois fios para D.', 'U2 (flip-flop): no wire to C.': 'U2 (flip-flop): nenhum fio para C.',
    'U1 (flip-flop): no wire from its outputs.': 'U1 (flip-flop): nenhum fio sai das suas saídas.',
    'U1 (flip-flop): no data input: write D, T, or J and K.': 'U1 (flip-flop): nenhuma entrada de dados: escreva D, T, ou J e K.',
    'U1 (flip-flop): no clock: write C or CLK, or draw a wedge.': 'U1 (flip-flop): nenhum relógio: escreva C ou CLK, ou desenhe uma cunha.',
    'U1 (flip-flop): no flip-flop of the library has the inputs J, K, C, R.': 'U1 (flip-flop): nenhum flip-flop da biblioteca tem as entradas J, K, C, R.',
  };
  for (const [en, pt] of Object.entries(T)) assert.equal(t(en), pt, en);
  // the recognizer's own messages, as it writes them
  const { recognizeExpression, InkError } = await import('../core/ink/expression.js');
  assert.throws(() => recognizeExpression([]), (e) => e instanceof InkError && t(e.message) !== e.message);
  const { readSchematic } = await import('../core/ink/schematic.js');
  assert.throws(() => readSchematic([]), (e) => e instanceof InkError && t(e.message) !== e.message);
  const { readTable, tableFromText } = await import('../core/ink/table.js');
  assert.throws(() => readTable([]), (e) => e instanceof InkError && t(e.message) !== e.message);
  for (const text of ['', 'a b f', '| f', 'a |', 'a b | f\n1 1 | 1\n1 1 | 1']) for (const m of [...tableFromText(text).errors, ...tableFromText(text).warnings]) assert.notEqual(t(m), m, m);
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
  assert.equal(t('The inputs of ctr as a grid of cycles: with a clock, the inputs change at its falling edge and the outputs are checked before the next one; without one, they change at every cycle, one for each combination of the inputs.'),
    'As entradas de ctr como uma grelha de ciclos: com relógio, as entradas mudam no seu flanco descendente e as saídas são verificadas antes do seguinte; sem relógio, mudam a cada ciclo, um por cada combinação das entradas.');
});

test('tri-state buffers: the palette category, parameter labels and the descriptions of TBUF and every preset are translated', async () => {
  const { SYMBOLS } = await import('../core/schdoc.js');
  const S = SYMBOLS.tbuf;
  assert.equal(t('Buffers'), 'Buffers');
  assert.equal(t('Buffers (3)'), 'Buffers (3)');
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
  for (const f of ['sch-editor.js', 'sch-props.js', 'sch-multi.js', 'sch-modsym.js', 'sch-tools.js', 'sch-palette.js', 'sch-toolbar.js', 'sch-try.js', 'sch-rename.js', 'sch-compare.js', 'sch-join.js']) {
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
    'Drawing RTL schematic of knight…': 'A desenhar o esquemático RTL de knight…', '(mixed)': '(vários)',
  };
  for (const [en, pt] of Object.entries(T)) assert.equal(t(en), pt, en);
  // not a source file: unchanged
  assert.equal(t('Open file'), 'Abrir ficheiro');
  assert.equal(t('Open the project'), 'Open the project');
});

test('#1024 Program FPGA with no programming file, or one older than the sources: the question in Portuguese', async () => {
  const { implementFirstText } = await import('../web/js/impact-file.js');
  const T = {
    "There is no programming file of 'top' yet.": "Ainda não há ficheiro de programação de 'top'.",
    "The programming file of 'counter_top' is older than the sources.": "O ficheiro de programação de 'counter_top' é mais antigo do que as fontes.",
    "The last implementation of 'top' failed.": "A última implementação de 'top' falhou.",
    'Implement the design first? When it ends without errors, the FPGA is programmed.': 'Implementar o projeto primeiro? Quando terminar sem erros, a FPGA é programada.',
    'The design is being implemented: program it when it ends': 'O projeto está a ser implementado: programe-o quando terminar',
  };
  for (const [en, pt] of Object.entries(T)) assert.equal(t(en), pt, en);
  // every line the question can have
  for (const st of ['none', 'stale', 'err']) for (const l of implementFirstText(st, 'top')) assert.notEqual(t(l), l, l);
  // the lines of the Tasks interface's Program that #1024 removed: no longer translated
  for (const s of ['Up to date with the sources', 'No programming file yet']) assert.equal(PT[s], undefined, s);
});

// #1405: every key of the Portuguese dictionary is a text of the sources (a string or template literal of web/, core/,
// server/ or the toolchain's package, #1973, or a page's), or a text a template of theirs makes (each ${…} any text: `Simulate ${name} Model`); a key the
// interface no longer has fails here (it is removed with its label)
test('#1405 every Portuguese translation is of a text the sources still have', () => {
  const ROOT = path.join(WEB, '..', '..');
  const tracked = execSync('git ls-files web core server packages/silinx-fpga/src', { cwd: ROOT, encoding: 'utf8' }).split('\n');
  const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const texts = new Set(), made = [];
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const f of tracked.filter((x) => /\.m?js$/.test(x) && !/^web\/js\/i18n[^/]*\.js$/.test(x))) {
    const { strings, templates } = literalsOf(read(f));
    for (const s of strings) texts.add(s);
    for (const parts of templates) {
      if (parts.length === 1) texts.add(parts[0]);
      else if (parts.join('').trim().length >= 4) made.push(new RegExp(`^${parts.map(esc).join('[\\s\\S]*?')}$`));
    }
  }
  // (a text written in pieces: 'a ' + 'b', its quotes escaped in them: \' and \")
  const joined = tracked.filter((x) => /\.(m?js|html)$/.test(x) && !/^web\/js\/i18n[^/]*\.js$/.test(x)).map(read).join('\n').replace(/(['"`])\s*\+\s*(['"`])/g, '').replace(/\\(['"`])/g, '$1');
  const unused = Object.keys(PT.strings).filter((k) => !texts.has(k) && !joined.includes(k) && !made.some((re) => re.test(k)));
  assert.deepEqual(unused, [], 'translations of texts no source has: remove them from web/js/i18n*.js');
});

test('#1405 literalsOf: strings, a template\'s parts, comments and regular expressions skipped', () => {
  const src = "const a = 'x\\'y'; // 'not this'\n/* 'nor this' */ const r = /'[^']*'/g; const t = `Open ${f(`in ${n}`)} now`; return /a`b/.test(\"z\");";
  const { strings, templates } = literalsOf(src);
  assert.deepEqual(strings, ["x'y", 'z']);
  assert.deepEqual(templates, [['in ', ''], ['Open ', ' now']]);
});

test('#2082 the FSM, ASM and UCF wizards\' messages in Portuguese', () => {
  const T = {
    'Wizard >': 'Assistente >',
    "'x' is used twice (the clock and input)": "'x' é usado duas vezes (o relógio e entrada)",
    "'rst' is used twice (the reset and output)": "'rst' é usado duas vezes (o reset e saída)",
    "Two states are named 'idle'.": "Há dois estados com o nome 'idle'.",
    'Not assigned: s[2..].': 'Por atribuir: s[2..].',
    'The pin P11 is given to a and s<0>.': 'O pino P11 está dado a a e a s<0>.',
    "The wizard will create constraints/pins.ucf, the project's constraints file:": 'O assistente vai criar constraints/pins.ucf, o ficheiro de restrições do projeto:',
    'The wizard will create constraints/more.ucf:': 'O assistente vai criar constraints/more.ucf:',
    'Each bit of the module\'s ports on a pin of the Digilent Basys2: assigned from the board by their names (clk, led, sw, btn…) and directions; change them at will.':
      'Cada bit dos portos do módulo num pino da Digilent Basys2: atribuído pela placa pelos nomes (clk, led, sw, btn…) e pelas direções; mude-os à vontade.',
  };
  for (const [en, pt] of Object.entries(T)) assert.equal(t(en), pt, en);
  // the old label of the button: gone with it
  assert.equal(PT.strings.Wizard, undefined);
});
