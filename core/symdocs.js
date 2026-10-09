// Symbol Info: datasheets of the schematic symbol library (like the Symbol Info / Libraries Guide
// pages of Xilinx ISE), in English and Portuguese. Isomorphic (no DOM), no simulator: the truth
// tables computed by simulation are in core/symtables.js.
//
//   import { symbolDoc, symbolSummary, docKeys, presetOf, XILINX_SYMBOLS } from '/core/symdocs.js';
//   const d = symbolDoc('mux4', { width: 1 }, { lang: 'pt' });
//   // { type, title, preset, category, summary, text: [paragraphs], formula, xilinx: [names],
//   //   pins: [{ name, dir, width, func }], params: [{ name, label, value, default, meaning, … }],
//   //   mode: null | { cols, rows: [{ in: {pin: '0'|'1'|'X'|'↑'}, q }], notes }, sequential,
//   //   hdl: { vhdl, verilog }, sym (the symbol, for drawing) }
//
// Every SYMBOLS type and every preset has a description, a function per pin and a meaning per
// parameter in both languages (test/symdocs.test.js). Flip-flop texts and mode tables are derived
// from the ff flags of the symbol ({ k, ce, clr, pre, r, s, sp }), so FD*, FT* and FJK* agree.
import { SYMBOLS, defaultParams, symbolDef, newDoc, generateHdl, validIdent, symbolPins, normModules } from './schdoc.js';

export const DOC_LANGS = ['en', 'pt'];
const int = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const pick = lang => (en, pt) => (lang === 'pt' ? pt : en);

// ------------------------------------------------------------------ datasheet UI texts
const UI = {
  'Symbol Info': 'Informação do Símbolo',
  'Description': 'Descrição',
  'Function': 'Função',
  'Pins': 'Pinos',
  'Pin': 'Pino',
  'Direction': 'Sentido',
  'Width': 'Largura',
  'Parameters and attributes': 'Parâmetros e atributos',
  'Parameter': 'Parâmetro',
  'Value': 'Valor',
  'Default': 'Por omissão',
  'Meaning': 'Significado',
  'Truth table': 'Tabela de verdade',
  'Function table': 'Tabela de funcionamento',
  'Mode table': 'Tabela de modos',
  'Inputs': 'Entradas',
  'Outputs': 'Saídas',
  'Equivalent HDL': 'HDL equivalente',
  'Symbol': 'Símbolo',
  'Xilinx library equivalents': 'Equivalentes na biblioteca Xilinx',
  'Formula': 'Fórmula',
  'input': 'entrada',
  'output': 'saída',
  'bidirectional': 'bidirecional',
  'net': 'da rede',
  'No change': 'Sem alteração',
  'Toggle': 'Comuta',
  'Compact table (X = any value)': 'Tabela compacta (X = qualquer valor)',
  'Full table': 'Tabela completa',
  'Close': 'Fechar',
  'Copy': 'Copiar',
  'Category': 'Categoria',
  'yes': 'sim',
  'no': 'não',
  'Representative rows (computed by simulation)': 'Linhas representativas (calculadas por simulação)',
  'Computed by simulating the HDL of the symbol for every input combination.': 'Calculada simulando o HDL do símbolo para todas as combinações das entradas.',
  'Too many inputs for a complete table: representative rows computed by simulating the HDL of the symbol.': 'Entradas a mais para uma tabela completa: linhas representativas calculadas simulando o HDL do símbolo.',
  'The function is bitwise: the table is the same for every bit i of the buses (shown with Width = 1).': 'A função é bit a bit: a tabela é a mesma para cada bit i dos barramentos (mostrada com Largura = 1).',
  'No table: the behaviour is defined by the HDL of the module / block.': 'Sem tabela: o comportamento é definido pelo HDL do módulo / bloco.',
  'The table cannot be computed:': 'Não é possível calcular a tabela:',
  'Computing…': 'A calcular…',
  'Open a symbol from the palette or select a placed symbol.': 'Abra um símbolo da paleta ou selecione um símbolo colocado.',
  'Change the parameters to see the tables and the HDL update (the placed symbol is not changed).': 'Altere os parâmetros para ver as tabelas e o HDL atualizarem (o símbolo colocado não é alterado).',
  'Used as': 'Usado como',
  'Priority': 'Prioridade',
};
/** Datasheet UI text in a language (English key). */
export function T(key, lang) { return lang === 'pt' ? (UI[key] ?? key) : key; }
export const UI_TEXTS = UI;

// parameter labels (as in SYMBOLS) in Portuguese
const PARAM_PT = {
  'Width': 'Largura', 'INIT': 'INIT', 'Select bits': 'Bits de seleção', 'Address bits': 'Bits de endereço',
  'Enable input E': 'Entrada de habilitação E', 'Bus pins (A, D)': 'Pinos em barramento (A, D)', 'Output bits': 'Bits de saída',
  'Type': 'Tipo', 'Bus pins (I, A)': 'Pinos em barramento (I, A)', 'Carry in': 'Transporte de entrada (carry in)',
  'Carry out': 'Transporte de saída (carry out)', 'Operation': 'Operação', 'Signed': 'Com sinal', 'Value': 'Valor',
  'Clock enable': 'Habilitação do relógio', 'Reset': 'Reset', 'Reset/INIT value': 'Valor de reset/INIT', 'Direction': 'Sentido',
  'MSB index': 'Índice do MSB', 'LSB index': 'Índice do LSB', 'Input widths (MSB first)': 'Larguras das entradas (MSB primeiro)',
};
export const PARAM_LABELS_PT = PARAM_PT;

// ------------------------------------------------------------------ keys, presets
/** Every documented entry of the palette: [{ type, preset: title | null, params }]. */
export function docKeys() {
  const out = [];
  for (const [type, S] of Object.entries(SYMBOLS)) {
    for (const pr of S.presets || []) out.push({ type, preset: pr.title, params: { ...defaultParams(type), ...pr.params } });
    out.push({ type, preset: null, params: defaultParams(type) });
  }
  return out;
}
const COSMETIC = new Set(['width', 'bus']);
/** Title of the preset that the parameters correspond to (D3_8E, DEMUX1_4, PENC8_3 …), or null. */
export function presetOf(type, params = {}) {
  const S = SYMBOLS[type];
  if (!S?.presets) return null;
  const p = { ...defaultParams(type), ...params };
  for (const pr of S.presets) {
    const full = { ...defaultParams(type), ...pr.params };
    if (Object.keys(full).every(k => COSMETIC.has(k) || String(full[k]) === String(p[k]))) return pr.title;
  }
  return null;
}
const presetDef = (type, title) => SYMBOLS[type]?.presets?.find(p => p.title === title) || null;

// ------------------------------------------------------------------ Xilinx library symbols
// Xilinx Unified Library symbols that ISE .sch import (core/isesch.js) maps to native symbols: they
// share the datasheet of the native symbol at these parameters.
export const XILINX_SYMBOLS = (() => {
  const X = {};
  for (const [type, S] of Object.entries(SYMBOLS)) {
    if (S.gate && S.inputs > 1) X[S.title] = { type, params: { width: 1 } };
    if (S.ff && type !== 'ft' && type !== 'fjk') X[S.title] = { type, params: { init: S.params[0].default } };   // no plain FT / FJK in the Xilinx library
  }
  X.INV = { type: 'inv', params: { width: 1 } };
  X.BUF = { type: 'buf', params: { width: 1 } };
  for (const w of [8, 16, 32]) { X[`INV${w}`] = { type: 'inv', params: { width: w } }; X[`BUF${w}`] = { type: 'buf', params: { width: w } }; }
  for (const b of ['IBUF', 'OBUF', 'IBUFG', 'BUFG', 'BUFGP']) X[b] = { type: 'buf', params: { width: 1 } };
  X.M2_1 = { type: 'mux2', params: { width: 1 } };
  for (const k of [2, 3, 4]) X[`D${k}_${1 << k}E`] = { type: 'decoder', params: { n: k, en: true, bus: false } };
  X.VCC = { type: 'vcc', params: {} };
  X.GND = { type: 'gnd', params: {} };
  for (const w of [8, 16]) {
    X[`FD${w}CE`] = { type: 'register', params: { width: w, en: true, reset: 'async', init: '0' } };
    X[`FD${w}RE`] = { type: 'register', params: { width: w, en: true, reset: 'sync', init: '0' } };
    X[`CB${w}CE`] = { type: 'counter', params: { width: w, en: true, reset: 'async', dir: 'up' }, note: 'CEO / TC' };
    X[`CB${w}RE`] = { type: 'counter', params: { width: w, en: true, reset: 'sync', dir: 'up' }, note: 'CEO / TC' };
    X[`COMP${w}`] = { type: 'compare', params: { width: w, op: 'eq', signed: false } };
    X[`COMPM${w}`] = { type: 'compare', params: { width: w, op: 'gt', signed: false }, note: 'GT / LT' };
    X[`ADD${w}`] = { type: 'add', params: { width: w, cin: true, cout: true }, note: 'OFL' };
  }
  return X;
})();
/** Xilinx library names documented by this symbol at these parameters (same function). */
export function xilinxEquivalents(type, params = {}) {
  const p = { ...defaultParams(type), ...params };
  const out = [];
  for (const [name, x] of Object.entries(XILINX_SYMBOLS)) {
    if (x.type !== type) continue;
    // INIT of a flip-flop is an attribute of the Xilinx symbol too; COMPM8 / COMPM16 are the GT or LT output
    const same = Object.entries(x.params).every(([k, v]) => (k === 'init' && SYMBOLS[type]?.ff) || String(p[k]) === String(v) || (k === 'op' && v === 'gt' && p.op === 'lt'));
    if (same) out.push(name);
  }
  return out;
}

// ------------------------------------------------------------------ texts
const GATE = {
  and: ['AND', 'AND (E)'], or: ['OR', 'OR (OU)'], nand: ['NAND', 'NAND (NÃO-E)'], nor: ['NOR', 'NOR (NÃO-OU)'],
  xor: ['XOR (exclusive OR)', 'XOR (OU exclusivo)'], xnor: ['XNOR (equivalence)', 'XNOR (equivalência)'],
};
// formula of a gate: I0·I1, I0 + I1, I0 ⊕ I1, complements as X'
function gateFormula(S) {
  const g = S.gate, n = S.inputs, k = S.invIn || 0;
  if (g === 'not') return "O = I'";
  if (g === 'buf') return 'O = I';
  const lit = i => `I${i}${i < k ? "'" : ''}`;
  const base = g.replace(/^n(?=and|or)/, '').replace(/^xn/, 'x');
  const op = { and: '·', or: ' + ', xor: ' ⊕ ' }[base];
  const e = Array.from({ length: n }, (_, i) => lit(i)).join(op);
  return g === base ? `O = ${e}` : `O = (${e})'`;
}
const ordinalList = (k, tx) => (k === 1 ? 'I0' : k === 2 ? tx('I0 and I1', 'I0 e I1') : `I0..I${k - 1}`);

function ffParts(f, tx) {
  const kind = f.k === 'd' ? 'D' : f.k === 't' ? 'T' : 'J-K';
  const feats = [];
  if (f.ce) feats.push(tx('clock enable', 'habilitação do relógio'));
  if (f.clr) feats.push(tx('asynchronous clear', 'clear assíncrono'));
  if (f.pre) feats.push(tx('asynchronous preset', 'preset assíncrono'));
  if (f.r && f.s) feats.push(f.sp ? tx('synchronous set and reset (S over R)', 'set e reset síncronos (S antes de R)') : tx('synchronous reset and set (R over S)', 'reset e set síncronos (R antes de S)'));
  else if (f.r) feats.push(tx('synchronous reset', 'reset síncrono'));
  else if (f.s) feats.push(tx('synchronous set', 'set síncrono'));
  return { kind, feats };
}
const joinList = (a, tx) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} ${tx('and', 'e')} ${a[a.length - 1]}`);

function ffText(type, S, p, tx) {
  const f = S.ff;
  const { kind, feats } = ffParts(f, tx);
  const title = S.title;
  const init = String(p.init ?? S.params[0].default);
  const par = [];
  par.push(tx(`${title} is a ${kind} flip-flop${feats.length ? ` with ${joinList(feats, tx)}` : ''}: a 1-bit memory element that changes only at the rising edge (↑, 0 → 1) of the clock C and keeps its value between edges.`,
    `${title} é uma báscula (flip-flop) ${kind}${feats.length ? ` com ${joinList(feats, tx)}` : ''}: um elemento de memória de 1 bit que só muda no flanco ascendente (↑, 0 → 1) do relógio C e mantém o valor entre flancos.`));
  if (f.k === 'd') par.push(tx('At each rising edge of C the output Q takes the value present at the data input D (Q⁺ = D).', 'Em cada flanco ascendente de C a saída Q toma o valor presente na entrada de dados D (Q⁺ = D).'));
  else if (f.k === 't') par.push(tx("At each rising edge of C, T = 1 inverts (toggles) Q and T = 0 keeps it: Q⁺ = T ⊕ Q. Toggle flip-flops are the natural building block of binary counters and frequency dividers (T = 1 divides the clock frequency by 2).",
    "Em cada flanco ascendente de C, T = 1 inverte (comuta) Q e T = 0 mantém-no: Q⁺ = T ⊕ Q. As básculas T são o bloco natural dos contadores binários e dos divisores de frequência (T = 1 divide a frequência do relógio por 2)."));
  else par.push(tx("At each rising edge of C: J = K = 0 keeps Q, J = 0 and K = 1 resets it to 0, J = 1 and K = 0 sets it to 1, and J = K = 1 toggles it: Q⁺ = J·Q' + K'·Q.",
    "Em cada flanco ascendente de C: J = K = 0 mantém Q, J = 0 e K = 1 coloca-o a 0, J = 1 e K = 0 coloca-o a 1, e J = K = 1 comuta-o: Q⁺ = J·Q' + K'·Q."));
  if (f.ce) par.push(tx(`The clock enable CE must be 1 for an edge to have effect; with CE = 0 Q keeps its value${f.r || f.s ? ' (the synchronous reset / set act even with CE = 0)' : ''}.`,
    `A habilitação do relógio CE tem de estar a 1 para um flanco ter efeito; com CE = 0 Q mantém o valor${f.r || f.s ? ' (o reset / set síncronos atuam mesmo com CE = 0)' : ''}.`));
  if (f.clr) par.push(tx('CLR = 1 clears Q to 0 immediately, without waiting for the clock (asynchronous clear); it has the highest priority.', 'CLR = 1 coloca Q a 0 imediatamente, sem esperar pelo relógio (clear assíncrono); tem a prioridade mais alta.'));
  if (f.pre) par.push(tx(`PRE = 1 sets Q to 1 immediately (asynchronous preset)${f.clr ? '; CLR has priority over PRE' : ''}.`, `PRE = 1 coloca Q a 1 imediatamente (preset assíncrono)${f.clr ? '; CLR tem prioridade sobre PRE' : ''}.`));
  if (f.r && f.s) par.push(f.sp
    ? tx('S = 1 sets Q to 1 and R = 1 resets it to 0 at the next rising edge (synchronous); S has priority over R.', 'S = 1 coloca Q a 1 e R = 1 coloca-o a 0 no flanco ascendente seguinte (síncronos); S tem prioridade sobre R.')
    : tx('R = 1 resets Q to 0 and S = 1 sets it to 1 at the next rising edge (synchronous); R has priority over S.', 'R = 1 coloca Q a 0 e S = 1 coloca-o a 1 no flanco ascendente seguinte (síncronos); R tem prioridade sobre S.'));
  else if (f.r) par.push(tx('R = 1 resets Q to 0 at the next rising edge of C (synchronous reset).', 'R = 1 coloca Q a 0 no flanco ascendente seguinte de C (reset síncrono).'));
  else if (f.s) par.push(tx('S = 1 sets Q to 1 at the next rising edge of C (synchronous set).', 'S = 1 coloca Q a 1 no flanco ascendente seguinte de C (set síncrono).'));
  par.push(tx(`At power-up (FPGA configuration) Q starts with the INIT value (${init}; the Xilinx default is ${S.params[0].default}).`, `No arranque (configuração da FPGA) Q começa com o valor INIT (${init}; o valor por omissão da Xilinx é ${S.params[0].default}).`));
  par.push(tx('Flip-flops are the storage of synchronous circuits: registers, counters, shift registers and the state register of finite state machines.', 'As básculas são a memória dos circuitos síncronos: registos, contadores, registos de deslocamento e o registo de estado das máquinas de estados.'));
  const formula = f.k === 'd' ? 'Q⁺ = D' : f.k === 't' ? 'Q⁺ = T ⊕ Q' : "Q⁺ = J·Q' + K'·Q";
  return { text: par, formula };
}

function describe(type, p, tx, preset) {
  const S = SYMBOLS[type];
  if (!S) return { text: [tx('Unknown symbol.', 'Símbolo desconhecido.')] };
  const W = Math.max(1, int(p.width, 1));
  const widthNote = tx('With Width > 1 all data pins are buses of that width and the symbol works bitwise (bit i of the output depends only on bit i of the data inputs).',
    'Com Largura > 1 todos os pinos de dados são barramentos dessa largura e o símbolo opera bit a bit (o bit i da saída só depende do bit i das entradas de dados).');
  if (S.gate && S.inputs > 1) {
    const n = S.inputs, k = S.invIn || 0;
    const base = S.gate;
    const name = GATE[base];
    const lead = {
      and: tx(`The ${n}-input AND gate outputs 1 only when all its inputs are 1; a single 0 at any input forces the output to 0. It detects that several conditions hold at the same time, enables (gates) a signal with a control input, and forms the product terms of sum-of-products (SOP) circuits.`,
        `A porta AND (E) de ${n} entradas dá 1 apenas quando todas as entradas estão a 1; basta um 0 numa entrada para a saída ser 0. Deteta que várias condições se verificam ao mesmo tempo, habilita (deixa passar) um sinal com uma entrada de controlo e forma os termos de produto dos circuitos soma de produtos (SOP).`),
      or: tx(`The ${n}-input OR gate outputs 1 when at least one of its inputs is 1, and 0 only when all inputs are 0. It combines alternative conditions (e.g. several request signals) and forms the sum terms of product-of-sums (POS) circuits and the final OR of SOP circuits.`,
        `A porta OR (OU) de ${n} entradas dá 1 quando pelo menos uma das entradas está a 1, e 0 só quando todas estão a 0. Combina condições alternativas (p. ex. vários pedidos) e forma os termos de soma dos circuitos produto de somas (POS) e o OU final dos circuitos SOP.`),
      nand: tx(`The ${n}-input NAND gate is an AND followed by an inverter: the output is 0 only when all inputs are 1. NAND is a universal gate — any logic function can be built from NAND gates alone; a two-level NAND–NAND circuit implements a sum of products.`,
        `A porta NAND (NÃO-E) de ${n} entradas é um AND seguido de um inversor: a saída só é 0 quando todas as entradas estão a 1. A NAND é uma porta universal — qualquer função lógica pode ser construída só com portas NAND; um circuito NAND–NAND de dois níveis implementa uma soma de produtos.`),
      nor: tx(`The ${n}-input NOR gate is an OR followed by an inverter: the output is 1 only when all inputs are 0. NOR is also a universal gate; a two-level NOR–NOR circuit implements a product of sums.`,
        `A porta NOR (NÃO-OU) de ${n} entradas é um OR seguido de um inversor: a saída só é 1 quando todas as entradas estão a 0. A NOR também é uma porta universal; um circuito NOR–NOR de dois níveis implementa um produto de somas.`),
      xor: tx('The 2-input XOR (exclusive OR) gate outputs 1 when its inputs are different. It is the sum bit of a half adder, computes parity (a chain of XORs is 1 when an odd number of inputs is 1) and works as a controlled inverter: with I1 = 1 the output is the complement of I0.',
        'A porta XOR (OU exclusivo) de 2 entradas dá 1 quando as entradas são diferentes. É o bit de soma de um meio somador, calcula a paridade (uma cadeia de XOR dá 1 quando há um número ímpar de entradas a 1) e funciona como inversor controlado: com I1 = 1 a saída é o complemento de I0.'),
      xnor: tx('The 2-input XNOR (equivalence) gate outputs 1 when its inputs are equal. It is the 1-bit equality comparator: an n-bit equality comparator is the AND of n XNOR gates.',
        'A porta XNOR (equivalência) de 2 entradas dá 1 quando as entradas são iguais. É o comparador de igualdade de 1 bit: um comparador de igualdade de n bits é o AND de n portas XNOR.'),
    }[base];
    const text = [lead];
    if (k) text.push(tx(`In this variant (Xilinx ${S.title}) ${k === 1 ? 'the input I0 is' : `the inputs ${ordinalList(k, tx)} are`} inverted before the ${name[0]} (the bubbles on the symbol), which saves separate inverters: ${gateFormula(S)}.`,
      `Nesta variante (Xilinx ${S.title}) ${k === 1 ? 'a entrada I0 é invertida' : `as entradas ${ordinalList(k, tx)} são invertidas`} antes da ${name[1]} (as bolinhas no símbolo), o que poupa inversores separados: ${gateFormula(S)}.`));
    text.push(widthNote);
    return { text, formula: gateFormula(S) };
  }
  switch (type) {
    case 'inv': return { text: [tx("The inverter (NOT gate) outputs the complement of its input: O = 1 when I = 0 and O = 0 when I = 1. It negates a condition or an active-low signal (e.g. a button that reads 0 when pressed).", "O inversor (porta NOT) dá na saída o complemento da entrada: O = 1 quando I = 0 e O = 0 quando I = 1. Nega uma condição ou um sinal ativo a 0 (p. ex. um botão que lê 0 quando premido)."), widthNote], formula: "O = I'" };
    case 'buf': return { text: [tx('The buffer copies its input to its output (O = I). Logically it is a wire: it connects two nets with different names (e.g. an internal signal to an output marker) and stands for the Xilinx buffers BUF, IBUF, OBUF and BUFG (clock buffer), whose electrical role is handled by the implementation tools.', 'O buffer copia a entrada para a saída (O = I). Logicamente é um fio: liga duas redes com nomes diferentes (p. ex. um sinal interno a um marcador de saída) e representa os buffers Xilinx BUF, IBUF, OBUF e BUFG (buffer de relógio), cujo papel elétrico é tratado pelas ferramentas de implementação.'), widthNote], formula: 'O = I' };
    case 'mux2': return { text: [tx('The 2:1 multiplexer (M2_1) selects one of its two data inputs and copies it to the output: O = D0 when S0 = 0 and O = D1 when S0 = 1. A multiplexer is a switch controlled by a digital signal: it chooses between two data sources (e.g. load a new value or keep the old one in a register), builds wider multiplexers as trees, and with constants on the data inputs implements any function of one variable.',
      'O multiplexador 2:1 (M2_1) seleciona uma das duas entradas de dados e copia-a para a saída: O = D0 quando S0 = 0 e O = D1 quando S0 = 1. Um multiplexador é um comutador controlado por um sinal digital: escolhe entre duas fontes de dados (p. ex. carregar um valor novo ou manter o antigo num registo), constrói multiplexadores maiores em árvore e, com constantes nas entradas de dados, implementa qualquer função de uma variável.'), widthNote], formula: "O = S0'·D0 + S0·D1" };
    case 'mux4': return { text: [tx('The 4:1 multiplexer (M4_1) copies to its output the data input whose index is the 2-bit select value S: O = D0, D1, D2 or D3 for S = 00, 01, 10, 11 (S(1) is the most significant bit). It selects one of four data sources (e.g. the operation result of a small ALU); with the select bits as variables and constants 0 / 1 on the data inputs it implements any function of two variables.',
      'O multiplexador 4:1 (M4_1) copia para a saída a entrada de dados cujo índice é o valor de seleção S de 2 bits: O = D0, D1, D2 ou D3 para S = 00, 01, 10, 11 (S(1) é o bit mais significativo). Seleciona uma de quatro fontes de dados (p. ex. o resultado da operação de uma pequena ALU); com os bits de seleção como variáveis e constantes 0 / 1 nas entradas de dados implementa qualquer função de duas variáveis.'), widthNote], formula: "O = S1'·S0'·D0 + S1'·S0·D1 + S1·S0'·D2 + S1·S0·D3" };
    case 'demux': {
      const k = Math.max(1, Math.min(4, int(p.sel, 1))), n = 1 << k;
      return { text: [tx(`The 1:${n} demultiplexer${preset ? ` (${preset})` : ''} routes its data input D to the output selected by ${k === 1 ? 'S0' : `the ${k}-bit value S`}: O<S> = D and all the other outputs are 0. It is the opposite of a multiplexer: it distributes one signal (e.g. a write enable or a clock enable) to one of ${n} destinations. A demultiplexer whose D is held at 1 is a decoder, and D works as its enable.`,
        `O desmultiplexador 1:${n}${preset ? ` (${preset})` : ''} encaminha a entrada de dados D para a saída selecionada por ${k === 1 ? 'S0' : `o valor S de ${k} bits`}: O<S> = D e todas as outras saídas ficam a 0. É o contrário de um multiplexador: distribui um sinal (p. ex. uma habilitação de escrita) por um de ${n} destinos. Um desmultiplexador com D fixo a 1 é um descodificador, e D funciona como a sua habilitação.`), widthNote], formula: `Oi = D · (S = i)` };
    }
    case 'decoder': {
      const n = Math.max(1, Math.min(5, int(p.n, 2))), o = 1 << n;
      const en = !!p.en;
      const t = [tx(`The ${n}:${o} binary decoder${preset ? ` (Xilinx ${preset})` : ''} activates exactly one of its ${o} outputs: the one whose index equals the binary address A${en ? ', while the enable E is 1' : ''} (D<A> = 1, all others 0)${en ? '; with E = 0 all outputs are 0' : ''}. Each output is a minterm of the address bits${en ? ' ANDed with E' : ''}, so a decoder plus an OR gate implements any function of ${n} variables (sum of minterms).`,
        `O descodificador binário ${n}:${o}${preset ? ` (Xilinx ${preset})` : ''} ativa exatamente uma das ${o} saídas: aquela cujo índice é igual ao endereço binário A${en ? ', enquanto a habilitação E está a 1' : ''} (D<A> = 1, todas as outras a 0)${en ? '; com E = 0 todas as saídas ficam a 0' : ''}. Cada saída é um mintermo dos bits de endereço${en ? ' em AND com E' : ''}, por isso um descodificador mais uma porta OR implementa qualquer função de ${n} variáveis (soma de mintermos).`),
      tx('Typical uses: address decoding (one chip-select per memory or peripheral), selecting one register or one display digit, and demultiplexing (the data on E).', 'Usos típicos: descodificação de endereços (um chip-select por memória ou periférico), seleção de um registo ou de um dígito de um mostrador, e desmultiplexagem (os dados em E).')];
      if (p.bus) t.push(tx(`With bus pins the address is the ${n}-bit bus A and the outputs are the ${o}-bit bus D (one-hot).`, `Com pinos em barramento o endereço é o barramento A de ${n} bits e as saídas são o barramento D de ${o} bits (one-hot).`));
      return { text: t, formula: `D${'i'} = ${en ? 'E · ' : ''}(A = i)` };
    }
    case 'encoder': {
      const n = Math.max(2, Math.min(5, int(p.n, 2))), m = 1 << n;
      const pri = p.mode !== 'one-hot';
      const t = pri ? [tx(`The ${m}:${n} priority encoder${preset ? ` (${preset})` : ''} outputs on A the binary index of the highest-numbered input that is 1 — inputs with lower indexes are ignored — and V = 1 when some input is 1 (with no input at 1, A = 0 and V = 0). It arbitrates between simultaneous requests (interrupts, keys of a keyboard, bus requests): the request with the highest index wins.`,
        `O codificador com prioridade ${m}:${n}${preset ? ` (${preset})` : ''} dá em A o índice binário da entrada de maior índice que está a 1 — as entradas de índice menor são ignoradas — e V = 1 quando alguma entrada está a 1 (sem nenhuma entrada a 1, A = 0 e V = 0). Faz a arbitragem entre pedidos simultâneos (interrupções, teclas de um teclado, pedidos de barramento): ganha o pedido de maior índice.`)]
        : [tx(`The ${m}:${n} one-hot encoder${preset ? ` (${preset})` : ''} converts a one-hot code (at most one input at 1) into the binary index of the active input: each output bit Aj is the OR of the inputs whose index has bit j at 1. If several inputs are 1 the result is the OR of their indexes (not meaningful). V = 1 when some input is 1. It is the inverse of a decoder and the simplest encoder (only OR gates).`,
          `O codificador one-hot ${m}:${n}${preset ? ` (${preset})` : ''} converte um código one-hot (no máximo uma entrada a 1) no índice binário da entrada ativa: cada bit de saída Aj é o OR das entradas cujo índice tem o bit j a 1. Se várias entradas estiverem a 1 o resultado é o OR dos seus índices (sem significado). V = 1 quando alguma entrada está a 1. É o inverso de um descodificador e o codificador mais simples (só portas OR).`)];
      if (p.bus) t.push(tx(`With bus pins the inputs are the ${m}-bit bus I and the index is the ${n}-bit bus A.`, `Com pinos em barramento as entradas são o barramento I de ${m} bits e o índice é o barramento A de ${n} bits.`));
      return { text: t, formula: pri ? tx('A = max { i : Ii = 1 },  V = I0 + I1 + …', 'A = máx { i : Ii = 1 },  V = I0 + I1 + …') : 'Aj = Σ Ii (i with bit j = 1),  V = I0 + I1 + …' };
    }
    case 'add': {
      const t = [tx(`ADD is a ${W}-bit binary adder: S = A + B${p.cin ? ' + CI' : ''}. The same circuit adds unsigned numbers and two's complement numbers (the bits of the result are the same). The sum is taken modulo 2^${W}: a result that does not fit wraps around${p.cout ? `, and the carry out CO (the carry of the most significant bit) is 1 when the unsigned sum is ${2 ** W} or more` : ''}.`,
        `ADD é um somador binário de ${W} bits: S = A + B${p.cin ? ' + CI' : ''}. O mesmo circuito soma números sem sinal e em complemento para dois (os bits do resultado são os mesmos). A soma é feita módulo 2^${W}: um resultado que não cabe dá a volta${p.cout ? `, e o transporte de saída CO (o transporte do bit mais significativo) é 1 quando a soma sem sinal é ${2 ** W} ou mais` : ''}.`),
      tx('In textbooks it is a chain of full adders (ripple carry: each stage adds Ai, Bi and the carry of the previous stage); synthesis uses the dedicated carry logic of the FPGA. Uses: arithmetic units, counters, address computation.', 'Nos livros é uma cadeia de somadores completos (transporte em cadeia: cada andar soma Ai, Bi e o transporte do andar anterior); a síntese usa a lógica de transporte dedicada da FPGA. Usos: unidades aritméticas, contadores, cálculo de endereços.')];
      if (p.cin) t.push(tx('The carry in CI adds 1: it chains adders for wider words, and with B inverted and CI = 1 the adder subtracts (A + B\' + 1 = A − B).', 'O transporte de entrada CI soma 1: encadeia somadores para palavras maiores e, com B invertido e CI = 1, o somador subtrai (A + B\' + 1 = A − B).'));
      return { text: t, formula: `${p.cout ? '{CO, S}' : 'S'} = A + B${p.cin ? ' + CI' : ''}${p.cout ? '' : ` mod 2^${W}`}` };
    }
    case 'sub': return { text: [tx(`SUB is a ${W}-bit subtractor: D = A − B modulo 2^${W}, computed in two's complement as A + B' + 1. Read as signed (two's complement) numbers the result is the signed difference; read as unsigned, a negative difference wraps around (e.g. 3 − 5 = ${(3 - 5 + 2 ** W) % 2 ** W} in ${W} bits, which is −2 in two's complement).`,
      `SUB é um subtrator de ${W} bits: D = A − B módulo 2^${W}, calculado em complemento para dois como A + B' + 1. Lido como números com sinal (complemento para dois) o resultado é a diferença com sinal; lido sem sinal, uma diferença negativa dá a volta (p. ex. 3 − 5 = ${(3 - 5 + 2 ** W) % 2 ** W} em ${W} bits, que é −2 em complemento para dois).`)], formula: `D = A − B mod 2^${W}` };
    case 'compare': {
      const sym = { eq: '=', ne: '≠', lt: '<', le: '≤', gt: '>', ge: '≥' }[p.op] || '=';
      return { text: [tx(`COMP compares two ${W}-bit numbers A and B and outputs O = 1 when the relation chosen in Operation holds (here A ${sym} B), else 0. With Signed the numbers are two's complement (e.g. 1111 = −1 < 0001); otherwise they are unsigned (1111 = 15 > 0001). Comparators decide in data paths: end of count, thresholds, sorting, the conditions of a state machine.`,
        `COMP compara dois números A e B de ${W} bits e dá O = 1 quando a relação escolhida em Operação se verifica (aqui A ${sym} B), senão 0. Com Com sinal os números estão em complemento para dois (p. ex. 1111 = −1 < 0001); caso contrário são sem sinal (1111 = 15 > 0001). Os comparadores tomam decisões nos caminhos de dados: fim de contagem, limiares, ordenação, as condições de uma máquina de estados.`),
      tx('Equality (=) is the AND of the XNOR of each bit pair; the order relations come from a subtraction (the borrow / sign of A − B).', 'A igualdade (=) é o AND dos XNOR de cada par de bits; as relações de ordem vêm de uma subtração (o empréstimo / sinal de A − B).')], formula: `O = (A ${sym} B)${p.signed ? tx(' (signed)', ' (com sinal)') : ''}` };
    }
    case 'constant': return { text: [tx(`CONSTANT drives a fixed value on its output O (${W} bit${W > 1 ? 's' : ''}): the Value written in decimal, hexadecimal (0x…) or binary (0b…). It sets fixed operands (e.g. the end value of a counter for a comparator), ties unused inputs, and selects fixed modes.`,
      `CONSTANT impõe um valor fixo na saída O (${W} bit${W > 1 ? 's' : ''}): o Valor escrito em decimal, hexadecimal (0x…) ou binário (0b…). Define operandos fixos (p. ex. o valor final de um contador para um comparador), fixa entradas não usadas e seleciona modos fixos.`)], formula: `O = ${p.value ?? 0}` };
    case 'vcc': return { text: [tx('VCC is the logic 1 source: every bit of the net it is connected to is 1 (the width comes from the net). It ties inputs to 1, e.g. an enable that must always be active.', 'VCC é a fonte do 1 lógico: todos os bits da rede a que está ligado ficam a 1 (a largura vem da rede). Fixa entradas a 1, p. ex. uma habilitação que tem de estar sempre ativa.')], formula: 'P = 1…1' };
    case 'gnd': return { text: [tx('GND is the logic 0 source: every bit of the net it is connected to is 0 (the width comes from the net). It ties inputs to 0, e.g. an unused reset or the carry in of an adder.', 'GND é a fonte do 0 lógico: todos os bits da rede a que está ligado ficam a 0 (a largura vem da rede). Fixa entradas a 0, p. ex. um reset não usado ou o transporte de entrada de um somador.')], formula: 'G = 0…0' };
    case 'register': {
      const rs = p.reset === 'async' ? tx(' CLR = 1 loads the Reset/INIT value immediately (asynchronous).', ' CLR = 1 carrega o valor de Reset/INIT imediatamente (assíncrono).') : p.reset === 'sync' ? tx(' R = 1 loads the Reset/INIT value at the next rising edge (synchronous).', ' R = 1 carrega o valor de Reset/INIT no flanco ascendente seguinte (síncrono).') : '';
      return { text: [tx(`REG is a ${W}-bit register: ${W} D flip-flops sharing the clock C. At each rising edge of C${p.en ? ' with CE = 1' : ''} the output Q takes the word on D; otherwise Q keeps its value.${rs} At power-up Q starts with the Reset/INIT value (${p.init ?? 0}).`,
        `REG é um registo de ${W} bits: ${W} básculas D com o relógio C em comum. Em cada flanco ascendente de C${p.en ? ' com CE = 1' : ''} a saída Q toma a palavra presente em D; caso contrário Q mantém o valor.${rs} No arranque Q começa com o valor de Reset/INIT (${p.init ?? 0}).`),
      tx('Registers hold the data of a synchronous circuit: operands and results of a data path, pipeline stages, the state of a state machine, outputs that must stay stable.', 'Os registos guardam os dados de um circuito síncrono: operandos e resultados de um caminho de dados, andares de pipeline, o estado de uma máquina de estados, saídas que têm de ficar estáveis.')], formula: `Q⁺ = ${p.en ? 'CE ? D : Q' : 'D'}` };
    }
    case 'counter': {
      const up = p.dir !== 'down';
      const rs = p.reset === 'async' ? tx(' CLR = 1 clears the count to 0 immediately (asynchronous).', ' CLR = 1 coloca a contagem a 0 imediatamente (assíncrono).') : p.reset === 'sync' ? tx(' R = 1 clears the count to 0 at the next rising edge (synchronous).', ' R = 1 coloca a contagem a 0 no flanco ascendente seguinte (síncrono).') : '';
      return { text: [tx(`CNT is a ${W}-bit binary ${up ? 'up' : 'down'} counter: at each rising edge of C${p.en ? ' with CE = 1' : ''} the output Q ${up ? 'increases by 1' : 'decreases by 1'} modulo 2^${W} (${up ? `after ${2 ** W - 1} it wraps to 0` : `after 0 it wraps to ${2 ** W - 1}`}).${rs} It starts at 0.`,
        `CNT é um contador binário ${up ? 'crescente' : 'decrescente'} de ${W} bits: em cada flanco ascendente de C${p.en ? ' com CE = 1' : ''} a saída Q ${up ? 'aumenta 1' : 'diminui 1'} módulo 2^${W} (${up ? `depois de ${2 ** W - 1} volta a 0` : `depois de 0 volta a ${2 ** W - 1}`}).${rs} Começa em 0.`),
      tx('Counters measure time and events: timers, frequency dividers (bit i of the count has the clock frequency divided by 2^(i+1)), address generators, sequencers. Like the Xilinx CB8CE / CB16CE without the CEO and TC outputs (use a comparator for the terminal count).', 'Os contadores medem tempo e eventos: temporizadores, divisores de frequência (o bit i da contagem tem a frequência do relógio dividida por 2^(i+1)), geradores de endereços, sequenciadores. Como os Xilinx CB8CE / CB16CE sem as saídas CEO e TC (use um comparador para a contagem terminal).')], formula: `Q⁺ = ${p.en ? `CE ? Q ${up ? '+' : '−'} 1 : Q` : `Q ${up ? '+' : '−'} 1`}` };
    }
    case 'slice': {
      const msb = int(p.msb, 0), lsb = int(p.lsb, 0);
      return { text: [tx(`BUS TAP takes bits ${msb} down to ${lsb} of the bus on I and outputs them on O (${Math.abs(msb - lsb) + 1} bit${msb === lsb ? '' : 's'}). It extracts a field of a word: a bit of a status bus, the high nibble of a byte, the most significant bit (the sign) of a number.`,
        `BUS TAP retira os bits ${msb} a ${lsb} do barramento em I e coloca-os em O (${Math.abs(msb - lsb) + 1} bit${msb === lsb ? '' : 's'}). Extrai um campo de uma palavra: um bit de um barramento de estado, o nibble alto de um byte, o bit mais significativo (o sinal) de um número.`)], formula: `O = I(${msb}${msb === lsb ? '' : `:${lsb}`})` };
    }
    case 'busjoin': return { text: [tx('BUS JOIN concatenates its inputs into one bus: O = I0 & I1 & …, I0 being the most significant part. The widths of the inputs are listed in Input widths (MSB first). It builds words from bits or fields: a byte from two nibbles, a number extended with zeros, a shift by wiring.',
      'BUS JOIN concatena as entradas num só barramento: O = I0 & I1 & …, sendo I0 a parte mais significativa. As larguras das entradas estão em Larguras das entradas (MSB primeiro). Constrói palavras a partir de bits ou campos: um byte a partir de dois nibbles, um número estendido com zeros, um deslocamento feito com fios.')], formula: 'O = I0 & I1 & …' };
    case 'module': return { text: [tx('A module symbol is an instance of a module (Verilog) / entity (VHDL) of the project, or of another schematic: its pins are the ports of the module. Hierarchy lets a design be built from tested blocks; double-click the symbol to open its source.',
      'Um símbolo de módulo é uma instância de um módulo (Verilog) / entidade (VHDL) do projeto, ou de outro esquemático: os pinos são os portos do módulo. A hierarquia permite construir um projeto a partir de blocos testados; faça duplo clique no símbolo para abrir a sua fonte.')] };
    case 'hdlblock': return { text: [tx('An HDL block is a box whose pins you define and whose behaviour is written as VHDL or Verilog statements, emitted verbatim in the generated HDL. It holds behavioural code inside a schematic (processes, state machines, expressions) and is what Convert to Schematic produces for code that is not a simple netlist.',
      'Um bloco HDL é uma caixa cujos pinos define e cujo comportamento é escrito em instruções VHDL ou Verilog, copiadas tal e qual para o HDL gerado. Guarda código comportamental dentro de um esquemático (processos, máquinas de estados, expressões) e é o que Converter para Esquemático produz para código que não é uma simples netlist.')] };
  }
  if (S.ff) return ffText(type, S, p, tx);
  return { text: [S.description] };
}

// ------------------------------------------------------------------ pins
function pinFunc(type, p, pin, tx) {
  const S = SYMBOLS[type];
  const n = pin.name;
  const idx = /^[A-Z]+(\d+)$/.exec(n)?.[1];
  const i = idx != null ? +idx : null;
  if (S?.gate && S.inputs > 1) {
    if (pin.dir === 'out') return tx(`Output: ${gateFormula(S)}`, `Saída: ${gateFormula(S)}`);
    return pin.inv ? tx(`Input ${i}, inverted before the gate (active at 0)`, `Entrada ${i}, invertida antes da porta (ativa a 0)`) : tx(`Input ${i}`, `Entrada ${i}`);
  }
  switch (type) {
    case 'inv': return n === 'I' ? tx('Input', 'Entrada') : tx('Output, the complement of I', 'Saída, o complemento de I');
    case 'buf': return n === 'I' ? tx('Input', 'Entrada') : tx('Output, equal to I', 'Saída, igual a I');
    case 'mux2': case 'mux4':
      if (n === 'O') return tx('Output: the selected data input', 'Saída: a entrada de dados selecionada');
      if (n === 'S0') return tx('Select: 0 = D0, 1 = D1', 'Seleção: 0 = D0, 1 = D1');
      if (n === 'S') return tx('2-bit select: index of the data input that reaches O (S(1) = MSB)', 'Seleção de 2 bits: índice da entrada de dados que chega a O (S(1) = MSB)');
      return type === 'mux2' ? tx(`Data input selected when S0 = ${i}`, `Entrada de dados selecionada quando S0 = ${i}`)
        : tx(`Data input selected when S = ${i.toString(2).padStart(2, '0')} (${i})`, `Entrada de dados selecionada quando S = ${i.toString(2).padStart(2, '0')} (${i})`);
    case 'demux': {
      if (n === 'D') return tx('Data input, copied to the selected output', 'Entrada de dados, copiada para a saída selecionada');
      if (n === 'S' || n === 'S0') return tx('Select: index of the output that receives D', 'Seleção: índice da saída que recebe D');
      return tx(`Output ${i}: D when the select value is ${i}, else 0`, `Saída ${i}: D quando o valor de seleção é ${i}, senão 0`);
    }
    case 'decoder': {
      const en = !!p.en;
      if (n === 'E') return tx('Enable: 1 = the addressed output is 1; 0 = all outputs are 0', 'Habilitação: 1 = a saída endereçada fica a 1; 0 = todas as saídas a 0');
      if (n === 'A') return tx(`Address (${pin.width} bits, A(${pin.width - 1}) = MSB)`, `Endereço (${pin.width} bits, A(${pin.width - 1}) = MSB)`);
      if (n === 'D') return tx(`Outputs (one-hot): bit i is 1 when A = i${en ? ' and E = 1' : ''}`, `Saídas (one-hot): o bit i é 1 quando A = i${en ? ' e E = 1' : ''}`);
      if (n[0] === 'A') return tx(`Address bit ${i} (weight ${2 ** i})`, `Bit ${i} do endereço (peso ${2 ** i})`);
      return tx(`Output ${i}: 1 when A = ${i}${en ? ' and E = 1' : ''}`, `Saída ${i}: 1 quando A = ${i}${en ? ' e E = 1' : ''}`);
    }
    case 'encoder': {
      const pri = p.mode !== 'one-hot';
      if (n === 'V') return tx('Valid: 1 when at least one input is 1', 'Válido: 1 quando pelo menos uma entrada está a 1');
      if (n === 'I') return tx(`Inputs (${pin.width} bits, bit i = request i)`, `Entradas (${pin.width} bits, bit i = pedido i)`);
      if (n === 'A') return tx(`Index of the ${pri ? 'highest active' : 'active'} input (${pin.width} bits)`, `Índice da entrada ${pri ? 'ativa de maior índice' : 'ativa'} (${pin.width} bits)`);
      if (n[0] === 'I') return pri ? tx(`Input ${i} (request ${i}); has priority over the inputs with a lower index`, `Entrada ${i} (pedido ${i}); tem prioridade sobre as entradas de índice menor`) : tx(`Input ${i} (one-hot code)`, `Entrada ${i} (código one-hot)`);
      return tx(`Bit ${i} of the index of the ${pri ? 'highest active' : 'active'} input`, `Bit ${i} do índice da entrada ${pri ? 'ativa de maior índice' : 'ativa'}`);
    }
    case 'add': return { A: tx('First operand', 'Primeiro operando'), B: tx('Second operand', 'Segundo operando'), CI: tx('Carry in: adds 1 to the sum', 'Transporte de entrada: soma 1 ao resultado'),
      S: tx('Sum A + B (+ CI), modulo 2^Width', 'Soma A + B (+ CI), módulo 2^Largura'), CO: tx('Carry out of the most significant bit: 1 when the unsigned sum does not fit in Width bits', 'Transporte de saída do bit mais significativo: 1 quando a soma sem sinal não cabe em Largura bits') }[n];
    case 'sub': return { A: tx('Minuend', 'Aditivo (minuendo)'), B: tx('Subtrahend', 'Subtrativo (subtraendo)'), D: tx('Difference A − B, modulo 2^Width (two\'s complement)', 'Diferença A − B, módulo 2^Largura (complemento para dois)') }[n];
    case 'compare': {
      const sym = { eq: '=', ne: '≠', lt: '<', le: '≤', gt: '>', ge: '≥' }[p.op] || '=';
      return { A: tx('First operand', 'Primeiro operando'), B: tx('Second operand', 'Segundo operando'), O: tx(`1 when A ${sym} B (${p.signed ? 'signed' : 'unsigned'}), else 0`, `1 quando A ${sym} B (${p.signed ? 'com sinal' : 'sem sinal'}), senão 0`) }[n];
    }
    case 'constant': return tx('The constant value', 'O valor constante');
    case 'vcc': return tx('Logic 1 on every bit of the connected net', '1 lógico em todos os bits da rede ligada');
    case 'gnd': return tx('Logic 0 on every bit of the connected net', '0 lógico em todos os bits da rede ligada');
    case 'slice': return n === 'I' ? tx('Input bus (at least MSB + 1 bits)', 'Barramento de entrada (pelo menos MSB + 1 bits)') : tx(`Bits ${int(p.msb, 0)}..${int(p.lsb, 0)} of I`, `Bits ${int(p.msb, 0)}..${int(p.lsb, 0)} de I`);
    case 'busjoin': return n === 'O' ? tx('Concatenation I0 & I1 & … (I0 = most significant part)', 'Concatenação I0 & I1 & … (I0 = parte mais significativa)')
      : tx(`Part ${i} of the result${i === 0 ? ' (most significant)' : ''}`, `Parte ${i} do resultado${i === 0 ? ' (mais significativa)' : ''}`);
    case 'module': return pin.dir === 'out' ? tx('Output port of the module', 'Porto de saída do módulo') : pin.dir === 'inout' ? tx('Bidirectional port of the module', 'Porto bidirecional do módulo') : tx('Input port of the module', 'Porto de entrada do módulo');
    case 'hdlblock': return pin.dir === 'out' ? tx('Output written by the HDL statements of the block', 'Saída escrita pelas instruções HDL do bloco') : pin.clock ? tx('Clock input read by the HDL statements of the block', 'Entrada de relógio lida pelas instruções HDL do bloco') : tx('Input read by the HDL statements of the block', 'Entrada lida pelas instruções HDL do bloco');
  }
  if (S?.ff || type === 'register' || type === 'counter') {
    const reg = !S?.ff;
    const what = type === 'counter' ? tx('the count', 'a contagem') : reg ? tx('the Reset/INIT value', 'o valor de Reset/INIT') : null;
    return {
      D: reg ? tx('Data input: the word stored at the rising edge of C', 'Entrada de dados: a palavra guardada no flanco ascendente de C') : tx('Data input: the value stored at the rising edge of C', 'Entrada de dados: o valor guardado no flanco ascendente de C'),
      T: tx('Toggle input: 1 = Q inverts at the rising edge of C, 0 = Q holds', 'Entrada de comutação: 1 = Q inverte no flanco ascendente de C, 0 = Q mantém-se'),
      J: tx('J input: J = 1, K = 0 sets Q to 1 (J = K = 1 toggles)', 'Entrada J: J = 1, K = 0 coloca Q a 1 (J = K = 1 comuta)'),
      K: tx('K input: J = 0, K = 1 resets Q to 0 (J = K = 1 toggles)', 'Entrada K: J = 0, K = 1 coloca Q a 0 (J = K = 1 comuta)'),
      CE: type === 'counter' ? tx('Count enable: 1 = count at the rising edge, 0 = hold', 'Habilitação da contagem: 1 = conta no flanco ascendente, 0 = mantém') : tx('Clock enable: 1 = the rising edge of C acts, 0 = Q holds', 'Habilitação do relógio: 1 = o flanco ascendente de C atua, 0 = Q mantém-se'),
      C: tx('Clock: acts on the rising edge (↑)', 'Relógio: atua no flanco ascendente (↑)'),
      CLR: what ? tx(`Asynchronous clear: 1 = Q takes ${type === 'counter' ? '0' : what} at once, without the clock`, `Clear assíncrono: 1 = Q toma ${type === 'counter' ? '0' : what} imediatamente, sem o relógio`) : tx('Asynchronous clear: 1 = Q = 0 at once, without the clock (highest priority)', 'Clear assíncrono: 1 = Q = 0 imediatamente, sem o relógio (prioridade máxima)'),
      PRE: tx('Asynchronous preset: 1 = Q = 1 at once, without the clock', 'Preset assíncrono: 1 = Q = 1 imediatamente, sem o relógio'),
      R: what ? tx(`Synchronous reset: 1 = Q takes ${type === 'counter' ? '0' : what} at the next rising edge`, `Reset síncrono: 1 = Q toma ${type === 'counter' ? '0' : what} no flanco ascendente seguinte`) : tx('Synchronous reset: 1 = Q = 0 at the next rising edge of C', 'Reset síncrono: 1 = Q = 0 no flanco ascendente seguinte de C'),
      S: tx('Synchronous set: 1 = Q = 1 at the next rising edge of C', 'Set síncrono: 1 = Q = 1 no flanco ascendente seguinte de C'),
      Q: type === 'counter' ? tx('Count value', 'Valor da contagem') : reg ? tx('Output: the stored word', 'Saída: a palavra guardada') : tx('Output: the stored bit', 'Saída: o bit guardado'),
    }[n];
  }
  return '';
}

// ------------------------------------------------------------------ parameters
function paramMeaning(type, d, p, tx) {
  const S = SYMBOLS[type];
  switch (d.name) {
    case 'width':
      if (type === 'constant') return tx('Number of bits of the output', 'Número de bits da saída');
      if (type === 'add' || type === 'sub' || type === 'compare') return tx('Number of bits of the operands (and of the result)', 'Número de bits dos operandos (e do resultado)');
      if (type === 'register' || type === 'counter') return tx('Number of bits (flip-flops) of the register / counter', 'Número de bits (básculas) do registo / contador');
      return tx('Number of bits of the data pins: > 1 makes them buses and the function bitwise', 'Número de bits dos pinos de dados: > 1 torna-os barramentos e a função bit a bit');
    case 'init':
      if (S?.ff) return tx('Value of Q at power-up (FPGA configuration): 0 or 1', 'Valor de Q no arranque (configuração da FPGA): 0 ou 1');
      return tx('Value loaded by the reset and at power-up (decimal, 0x… hex or 0b… binary)', 'Valor carregado pelo reset e no arranque (decimal, 0x… hexadecimal ou 0b… binário)');
    case 'sel': return tx('Number of select bits k: 2^k outputs (1 → DEMUX1_2, 2 → DEMUX1_4, 3 → DEMUX1_8)', 'Número de bits de seleção k: 2^k saídas (1 → DEMUX1_2, 2 → DEMUX1_4, 3 → DEMUX1_8)');
    case 'n': return type === 'decoder' ? tx('Number of address bits n: 2^n outputs (2 → D2_4E, 3 → D3_8E, 4 → D4_16E)', 'Número de bits de endereço n: 2^n saídas (2 → D2_4E, 3 → D3_8E, 4 → D4_16E)')
      : tx('Number of output bits n: 2^n inputs (2 → 4:2, 3 → 8:3, 4 → 16:4)', 'Número de bits de saída n: 2^n entradas (2 → 4:2, 3 → 8:3, 4 → 16:4)');
    case 'en': return type === 'decoder' ? tx('Adds the enable input E (without it the decoder is always enabled)', 'Acrescenta a entrada de habilitação E (sem ela o descodificador está sempre habilitado)')
      : tx('Adds the clock enable input CE (without it every rising edge acts)', 'Acrescenta a entrada de habilitação do relógio CE (sem ela todos os flancos ascendentes atuam)');
    case 'bus': return tx('Draws the multi-bit pins as one bus pin instead of one pin per bit (same function)', 'Desenha os pinos de vários bits como um único pino em barramento em vez de um pino por bit (mesma função)');
    case 'mode': return tx('priority: the highest active input wins; one-hot: OR of the indexes (inputs assumed one-hot)', 'prioridade: ganha a entrada ativa de maior índice; one-hot: OR dos índices (assume entradas one-hot)');
    case 'cin': return tx('Adds the carry in input CI', 'Acrescenta a entrada de transporte CI');
    case 'cout': return tx('Adds the carry out output CO', 'Acrescenta a saída de transporte CO');
    case 'op': return tx('Relation tested: eq (=), ne (≠), lt (<), le (≤), gt (>), ge (≥)', 'Relação testada: eq (=), ne (≠), lt (<), le (≤), gt (>), ge (≥)');
    case 'signed': return tx("Compare as two's complement signed numbers (otherwise unsigned)", 'Comparar como números com sinal em complemento para dois (senão sem sinal)');
    case 'value': return tx('The constant: decimal, 0x… hexadecimal or 0b… binary', 'A constante: decimal, 0x… hexadecimal ou 0b… binário');
    case 'reset': return tx("none; async: CLR input, acts at once; sync: R input, acts at the rising edge", 'none: sem reset; async: entrada CLR, atua imediatamente; sync: entrada R, atua no flanco ascendente');
    case 'dir': return tx('up: count +1; down: count −1', 'up: conta +1; down: conta −1');
    case 'msb': return tx('Index of the most significant bit taken from I', 'Índice do bit mais significativo retirado de I');
    case 'lsb': return tx('Index of the least significant bit taken from I', 'Índice do bit menos significativo retirado de I');
    case 'widths': return tx('Comma-separated widths of the inputs I0, I1, … (I0 is the most significant part)', 'Larguras das entradas I0, I1, … separadas por vírgulas (I0 é a parte mais significativa)');
  }
  return '';
}

// ------------------------------------------------------------------ mode tables (sequential symbols)
/**
 * Mode table of a flip-flop / register / counter, or null for combinational symbols.
 * { cols: [input pins], rows: [{ in: { pin: '0'|'1'|'X'|'↑' }, q }], notes: [text] }
 * q: '0' | '1' | 'nc' (no change) | 'toggle' | 'D' (Q = D) | 'init' (Reset/INIT value) | 'zero' (0…0) | 'inc' | 'dec'
 */
export function modeTable(type, params = {}, lang = 'en') {
  const S = SYMBOLS[type];
  if (!S) return null;
  const tx = pick(lang);
  const p = { ...defaultParams(type), ...params };
  let f;
  if (S.ff) f = S.ff;
  else if (type === 'register' || type === 'counter') f = { k: type, ce: !!p.en, clr: p.reset === 'async', r: p.reset === 'sync' };
  else return null;
  const asyncL = [f.clr && ['CLR', type === 'counter' ? 'zero' : S.ff ? '0' : 'init'], f.pre && ['PRE', '1']].filter(Boolean);
  const syncL = (f.sp ? [f.s && ['S', '1'], f.r && ['R', '0']] : [f.r && ['R', type === 'counter' ? 'zero' : S.ff ? '0' : 'init'], f.s && ['S', '1']]).filter(Boolean);
  const data = f.k === 'd' || f.k === 'register' ? ['D'] : f.k === 't' ? ['T'] : f.k === 'jk' ? ['J', 'K'] : [];
  const cols = [...asyncL.map(a => a[0]), ...syncL.map(a => a[0]), ...(f.ce ? ['CE'] : []), ...data, 'C'];
  const rows = [];
  const row = (set, q) => { const r = { in: Object.fromEntries(cols.map(c => [c, set[c] ?? 'X'])), q }; rows.push(r); };
  const zero = list => Object.fromEntries(list.map(a => [a[0], '0']));
  asyncL.forEach((a, i) => row({ ...zero(asyncL.slice(0, i)), [a[0]]: '1' }, a[1]));
  syncL.forEach((a, i) => row({ ...zero(asyncL), ...zero(syncL.slice(0, i)), [a[0]]: '1', C: '↑' }, a[1]));
  const base = { ...zero(asyncL), ...zero(syncL) };
  if (f.ce) row({ ...base, CE: '0' }, 'nc');
  const on = { ...base, ...(f.ce ? { CE: '1' } : {}), C: '↑' };
  if (f.k === 'd') { row({ ...on, D: '0' }, '0'); row({ ...on, D: '1' }, '1'); }
  else if (f.k === 't') { row({ ...on, T: '0' }, 'nc'); row({ ...on, T: '1' }, 'toggle'); }
  else if (f.k === 'jk') { row({ ...on, J: '0', K: '0' }, 'nc'); row({ ...on, J: '0', K: '1' }, '0'); row({ ...on, J: '1', K: '0' }, '1'); row({ ...on, J: '1', K: '1' }, 'toggle'); }
  else if (f.k === 'register') row({ ...on, D: 'D' }, 'D');
  else row(on, p.dir === 'down' ? 'dec' : 'inc');
  const notes = [];
  notes.push(tx('↑ = rising edge of C (0 → 1); X = any value. Without a rising edge of C (and no asynchronous input active) Q keeps its value.', '↑ = flanco ascendente de C (0 → 1); X = qualquer valor. Sem flanco ascendente de C (e sem entradas assíncronas ativas) Q mantém o valor.'));
  if (asyncL.length) notes.push(tx(`${asyncL.map(a => a[0]).join(' and ')} ${asyncL.length > 1 ? 'are' : 'is'} asynchronous: ${asyncL.length > 1 ? 'they act' : 'it acts'} at once, whatever the clock.`, `${asyncL.map(a => a[0]).join(' e ')} ${asyncL.length > 1 ? 'são assíncronos: atuam' : 'é assíncrono: atua'} imediatamente, independentemente do relógio.`));
  if (S.ff) notes.push(tx(`Priority, highest first: ${[...asyncL.map(a => a[0]), ...syncL.map(a => a[0]), ...(f.ce ? ['CE'] : [])].join(' > ') || 'C'}${asyncL.length || syncL.length || f.ce ? ' > data' : ''}. INIT = ${p.init} at power-up.`,
    `Prioridade, da mais alta para a mais baixa: ${[...asyncL.map(a => a[0]), ...syncL.map(a => a[0]), ...(f.ce ? ['CE'] : [])].join(' > ') || 'C'}${asyncL.length || syncL.length || f.ce ? ' > dados' : ''}. INIT = ${p.init} no arranque.`));
  return { cols, out: 'Q', rows, notes };
}
/** Text of the Q column of a mode table row. */
export function modeQText(q, type, params = {}, lang = 'en') {
  const tx = pick(lang);
  const p = { ...defaultParams(type), ...params };
  switch (q) {
    case 'nc': return tx('No change', 'Sem alteração');
    case 'toggle': return tx("Toggle (Q')", "Comuta (Q')");
    case 'D': return 'D';
    case 'init': return `INIT (${p.init ?? 0})`;
    case 'zero': return '0';
    case 'inc': return 'Q + 1';
    case 'dec': return 'Q − 1';
    default: return q;
  }
}

// ------------------------------------------------------------------ one-symbol schematic and its HDL
/** HDL name of the symbol (entity / module name of its datasheet HDL). */
function hdlName(type, params, modules) {
  const S = SYMBOLS[type];
  const pr = presetOf(type, params);
  let nm = type === 'module' ? `${params.module || 'module'}_symbol` : type === 'hdlblock' ? 'hdl_block' : (pr || symbolDef({ type, params: { ...defaultParams(type), ...params } }, modules).title || S?.title || type);
  nm = String(nm).replace(/[^A-Za-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  if (!/^[A-Za-z]/.test(nm)) nm = `x${nm}`;
  if (!validIdent(nm, 'vhdl') || !validIdent(nm, 'verilog')) nm = `${nm}_sym`;
  return nm;
}
/**
 * A schematic holding the symbol alone, with an I/O marker on each pin named like the pin.
 * Returns { doc, sym, ports: [{ id, name, dir, width, pin }] }.
 */
export function oneSymbolDoc(type, params = {}, { lang = 'vhdl', modules = {}, hdl } = {}) {
  modules = normModules(modules);
  const doc = newDoc(hdlName(type, params, modules), lang);
  const sym = { id: 'S1', type, x: 200, y: 200, rot: 0, mirror: false, name: 'U1', params: { ...defaultParams(type), ...JSON.parse(JSON.stringify(params)) } };
  if (hdl != null) sym.hdl = hdl;
  doc.symbols.push(sym);
  const def = symbolDef(sym, modules);
  const ports = [];
  for (const q of symbolPins(sym, modules, def)) {
    let w = q.width;
    if (w == null) w = type === 'slice' ? Math.max(int(sym.params.msb, 0), int(sym.params.lsb, 0)) + 1 : 1;
    const port = { id: `P${ports.length + 1}`, name: q.name, dir: q.dir === 'out' ? 'out' : q.dir === 'inout' ? 'inout' : 'in', width: w, x: q.x, y: q.y, pin: q.name };
    ports.push(port);
    doc.ports.push({ id: port.id, name: port.name, dir: port.dir, width: port.width, x: port.x, y: port.y });
  }
  return { doc, sym, ports };
}
/** Equivalent HDL of the symbol alone: { vhdl, verilog } (code strings). */
export function symbolHdl(type, params = {}, { modules = {}, hdl } = {}) {
  const out = {};
  for (const lang of ['vhdl', 'verilog']) {
    try {
      const { doc } = oneSymbolDoc(type, params, { lang, modules, hdl });
      const c = lang === 'vhdl' ? '--' : '//';
      out[lang] = generateHdl(doc, { lang, modules }).code.replace(/^.*\n/, `${c} ${doc.name}: HDL equivalent to the schematic symbol (Silinx Symbol Info)\n`);
    } catch (e) { out[lang] = `${lang === 'vhdl' ? '--' : '//'} ${e.message}`; }
  }
  return out;
}

// ------------------------------------------------------------------ summary / datasheet
/** First sentence of a text. */
export function firstSentence(s) {
  const m = /^(.+?[.!?])(\s|$)/s.exec(String(s || '').trim());
  return m ? m[1] : String(s || '').trim();
}
/** One-sentence summary of a symbol (the small info box of the palette). */
export function symbolSummary(type, params = {}, lang = 'en', preset = null) {
  const p = { ...defaultParams(type), ...params };
  return firstSentence(describe(type, p, pick(lang), preset && presetOf(type, p) === preset ? preset : presetOf(type, p)).text[0]);
}

/**
 * The datasheet of a symbol at the given parameters (texts in `lang`), without the simulated
 * truth table (core/symtables.js truthTable()).
 */
export function symbolDoc(type, params = {}, { lang = 'en', modules = {}, preset, hdl, withHdl = true } = {}) {
  modules = normModules(modules);
  const tx = pick(lang);
  const S = SYMBOLS[type];
  const p = { ...defaultParams(type), ...params };
  // a preset title passed explicitly is kept only while the parameters still match it
  const pr = preset && presetOf(type, p) === preset ? preset : presetOf(type, p);
  const sym = { id: 'S1', type, x: 0, y: 0, rot: 0, mirror: false, name: '', params: p };
  if (hdl != null) sym.hdl = hdl;
  const def = symbolDef(sym, modules);
  const d = describe(type, p, tx, pr);
  const title = type === 'module' ? (p.module || 'MODULE') : (pr || (def.shape === 'lib' || def.shape === 'demux' ? def.title : S?.title) || type);
  const pins = def.pins.map(q => ({
    name: q.name, dir: q.dir, width: q.width ?? null,
    widthText: q.width == null ? (type === 'slice' ? `≥ ${Math.max(int(p.msb, 0), int(p.lsb, 0)) + 1}` : T('net', lang)) : String(q.width),
    func: pinFunc(type, p, q, tx) || '', inv: !!q.inv, clock: !!q.clock,
  }));
  const params2 = (S?.params || []).map(x => ({
    name: x.name, label: lang === 'pt' ? (PARAM_PT[x.label] || x.label) : x.label, kind: x.kind, options: x.options, min: x.min, max: x.max,
    value: p[x.name], default: x.default, meaning: paramMeaning(type, x, p, tx),
  }));
  const mode = modeTable(type, p, lang);
  const out = {
    type, title, preset: pr, category: S?.category || '', lang,
    summary: firstSentence(d.text[0]), text: d.text, formula: d.formula || null,
    xilinx: xilinxEquivalents(type, p), pins, params: params2, mode, sequential: !!mode,
    sym, def,
  };
  if (withHdl) out.hdl = type === 'module' && !p.module ? null : symbolHdl(type, p, { modules, hdl });
  return out;
}
