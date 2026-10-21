// Silinx - the device primitives offered to the user (#791, #792, part of #787): the block RAMs, multipliers /
// DSP slices, clock managers and clock buffers of each family, as the schematic library's *Device Primitives*
// (core/schdoc.js) and the Language Templates' *Device Primitives* group (web/js/editor.js) offer them. One
// list, read by both: each primitive's pins as UNISIM's (names, directions, widths), its attributes (the
// generics / parameters, their kinds, ranges and defaults) and its texts in English and Portuguese; the
// resource it takes and its count on a part come from core/resources.js.
//
//   Spartan-3E: RAMB16_S<w> (single port), RAMB16_S<a>_S<b> (dual port), MULT18X18SIO, DCM_SP, BUFG, BUFGMUX, IBUFG
//   Spartan-6:  RAMB8BWER, RAMB16BWER, DSP48A1, PLL_BASE, DCM_SP, BUFG, BUFIO2
//
// A primitive's pin: { name, dir, width, tie, need, clock, vec, func: { en, pt } }. An input left unconnected is tied
// to `tie` ('0' or '1', every bit); `need`: a pin the primitive does not work without (its clock, its address),
// unconnected a warning. An attribute: { name, kind: 'int' | 'real' | 'string' | 'bool' | 'hex', default,
// min / max (int, real), options (string, and the reals of a fixed list), bits (hex), meaning: { en, pt } }.
//
// Isomorphic ES module (browser + Node), no DOM.
//
// API:
//   DEVICE_PRIMITIVES             { type: primitive }: every one, the schematic symbols' types (ramb16_s, dcm_sp …)
//   PRIMITIVE_FAMILIES            the families with primitives offered
//   devicePrimitives(family)      the primitives of a family, in the palette's order
//   primitiveOf(type, params)     the UNISIM primitive a symbol's parameters make: { name, pins, generics, contents, fixed,
//                                 exclusive } (fixed: [attribute, value] always written; exclusive: [[pin, pin]] not both used, Symbol Info
//                                 leaving the first out)
//   genericValue(g, v, lang)      an attribute's value written in VHDL or Verilog (null: not a valid value)
//   initWords(text, width, bits)  a block RAM's contents (hex words from address 0) as its INIT_xx: { 'INIT_00': hex }
//   primitiveResource(type, family, params)  the resource (core/resources.js id) a primitive takes on a family

import { resourceOfPrimitive } from './resources.js';

const tx = (en, pt) => ({ en, pt });
// (vec: a vector of one bit in UNISIM, std_logic_vector(0 downto 0): the parity of a 9-bit port)
const pin = (name, dir, width, func, o = {}) => ({ name, dir, width, tie: dir === 'in' ? (o.tie ?? '0') : null, need: !!o.need, clock: !!o.clock, ...(o.vec ? { vec: true } : {}), func });
const int = (name, def, min, max, meaning) => ({ name, kind: 'int', default: def, min, max, meaning });
const real = (name, def, min, max, meaning, options) => ({ name, kind: 'real', default: def, min, max, meaning, ...(options ? { options } : {}) });
const str = (name, def, options, meaning, num) => ({ name, kind: 'string', default: def, options, meaning, ...(num ? { num: true } : {}) });
// (num: one of a list of integers, chosen as a string but an integer in UNISIM, written unquoted: DATA_WIDTH_A, #859)
const bool = (name, def, meaning) => ({ name, kind: 'bool', default: def, meaning });
const hex = (name, bits, meaning) => ({ name, kind: 'hex', bits, default: '0'.repeat(Math.ceil(bits / 4)), meaning });

// ------------------------------------------------------------------ block RAM (Spartan-3E)
// a port of w bits: its data bits, parity bits and address bits (16 Kbit of data, 2 Kbit of parity)
export const RAMB16_PORTS = { 1: [1, 0, 14], 2: [2, 0, 13], 4: [4, 0, 12], 9: [8, 1, 11], 18: [16, 2, 10], 36: [32, 4, 9] };
const RAM_WIDTHS = ['1', '2', '4', '9', '18', '36'];
const WRITE_MODES = ['WRITE_FIRST', 'READ_FIRST', 'NO_CHANGE'];
const wmMeaning = x => tx(`What port ${x}'s output shows while it writes: WRITE_FIRST the word written, READ_FIRST the word that was there, NO_CHANGE the word read last.`,
  `O que a saída do porto ${x} mostra enquanto escreve: WRITE_FIRST a palavra escrita, READ_FIRST a palavra que lá estava, NO_CHANGE a última palavra lida.`);
const initMeaning = x => tx(`Port ${x}'s output after configuration (data and parity bits, hexadecimal).`, `Saída do porto ${x} após a configuração (bits de dados e de paridade, hexadecimal).`);
const srvalMeaning = x => tx(`The value port ${x}'s output takes when its reset is 1 at a clock edge (hexadecimal).`, `Valor que a saída do porto ${x} toma quando o seu reset está a 1 num flanco do relógio (hexadecimal).`);
const contentsParam = { name: 'contents', label: 'Contents (hex words from address 0)', kind: 'text', default: '' };
const contentsMeaning = tx('The memory\'s initial contents: hexadecimal words of port A\'s data width, separated by spaces or commas, from address 0 up (the INIT_xx attributes; the parity bits 0). Empty: all zeros.',
  'Conteúdo inicial da memória: palavras hexadecimais da largura dos dados do porto A, separadas por espaços ou vírgulas, a partir do endereço 0 (os atributos INIT_xx; os bits de paridade a 0). Vazio: tudo a zeros.');

// the pins of a RAMB16_S port of w bits (x: '' for the single port, 'A' / 'B' for a dual port's)
function ramb16Pins(w, x, needed) {
  const [dw, pw, aw] = RAMB16_PORTS[w];
  const of = x ? tx(` of port ${x}`, ` do porto ${x}`) : tx('', '');
  const f = (en, pt) => tx(en + of.en, pt + of.pt);
  return {
    ins: [pin(`ADDR${x}`, 'in', aw, f(`Address (${2 ** aw} words of ${w} bits)`, `Endereço (${2 ** aw} palavras de ${w} bits)`), { need: needed }),
      pin(`DI${x}`, 'in', dw, f('Data written', 'Dados escritos'), { vec: dw === 1 }),
      ...(pw ? [pin(`DIP${x}`, 'in', pw, f('Parity bits written', 'Bits de paridade escritos'), { vec: true })] : []),
      pin(`WE${x}`, 'in', 1, f('Write enable: 1 writes DI at ADDR on the clock edge', 'Habilitação da escrita: a 1 escreve DI em ADDR no flanco do relógio')),
      pin(`EN${x}`, 'in', 1, f('Enable: 0 holds the port (no read, no write); unconnected 1', 'Habilitação: a 0 o porto fica parado (sem leitura nem escrita); desligado, 1'), { tie: '1' }),
      pin(`SSR${x}`, 'in', 1, f('Synchronous set / reset: 1 loads SRVAL into the output on the clock edge', 'Set / reset síncrono: a 1 carrega SRVAL na saída no flanco do relógio')),
      pin(`CLK${x}`, 'in', 1, f('Clock (rising edge)', 'Relógio (flanco ascendente)'), { need: needed, clock: true })],
    outs: [pin(`DO${x}`, 'out', dw, f('Data read (synchronous: after the clock edge)', 'Dados lidos (síncrono: após o flanco do relógio)'), { vec: dw === 1 }),
      ...(pw ? [pin(`DOP${x}`, 'out', pw, f('Parity bits read', 'Bits de paridade lidos'), { vec: true })] : [])],
  };
}
const ramb16Gens = (w, x) => {
  const [dw, pw] = RAMB16_PORTS[w];
  const g = x ? `_${x}` : '', X = x || 'A';
  return [hex(`INIT${g}`, dw + pw, initMeaning(X)), hex(`SRVAL${g}`, dw + pw, srvalMeaning(X)), str(`WRITE_MODE${g}`, 'WRITE_FIRST', WRITE_MODES, wmMeaning(X))];
};
const widthOf = (v, d = '9') => (RAM_WIDTHS.includes(String(v)) ? String(v) : d);

// ------------------------------------------------------------------ block RAM (Spartan-6)
// RAMB16BWER (18 Kbit) and RAMB8BWER (9 Kbit, TDP or SDP): the pins of ports A and B (core/unisim-s6.js BWER)
const BWER = {
  RAMB16BWER: { aw: 14, dw: 32, pw: 4, ww: 4, iw: 36, widths: ['0', ...RAM_WIDTHS], words: 16384,
    pins: x => ({ addr: `ADDR${x}`, clk: `CLK${x}`, di: `DI${x}`, dip: `DIP${x}`, dout: `DO${x}`, dop: `DOP${x}`, en: `EN${x}`, regce: `REGCE${x}`, rst: `RST${x}`, we: `WE${x}` }) },
  RAMB8BWER: { aw: 13, dw: 16, pw: 2, ww: 2, iw: 18, widths: ['0', '1', '2', '4', '9', '18', '36'], words: 8192, sdp: true,
    pins: x => (x === 'A'
      ? { addr: 'ADDRAWRADDR', clk: 'CLKAWRCLK', di: 'DIADI', dip: 'DIPADIP', dout: 'DOADO', dop: 'DOPADOP', en: 'ENAWREN', regce: 'REGCEA', rst: 'RSTA', we: 'WEAWEL' }
      : { addr: 'ADDRBRDADDR', clk: 'CLKBRDCLK', di: 'DIBDI', dip: 'DIPBDIP', dout: 'DOBDO', dop: 'DOPBDOP', en: 'ENBRDEN', regce: 'REGCEBREGCE', rst: 'RSTBRST', we: 'WEBWEU' }) },
};
function bwerPins(name) {
  const k = BWER[name], ins = [], outs = [];
  for (const x of ['A', 'B']) {
    const p = k.pins(x), of = tx(` of port ${x}`, ` do porto ${x}`);
    const f = (en, pt) => tx(en + of.en, pt + of.pt);
    ins.push(pin(p.addr, 'in', k.aw, f(`Address (its low bits unused as the port is wider: ${k.aw} bits for 1-bit words)`, `Endereço (os bits de menor peso por usar quanto mais largo o porto: ${k.aw} bits para palavras de 1 bit)`), { need: x === 'A' }),
      pin(p.di, 'in', k.dw, f('Data written', 'Dados escritos')), pin(p.dip, 'in', k.pw, f('Parity bits written', 'Bits de paridade escritos')),
      pin(p.we, 'in', k.ww, f('Byte write enables (one per byte on a port of 18 bits or more; else bit 0)', 'Habilitações da escrita por byte (uma por byte num porto de 18 bits ou mais; senão o bit 0)')),
      pin(p.en, 'in', 1, f('Enable: 0 holds the port; unconnected 1', 'Habilitação: a 0 o porto fica parado; desligado, 1'), { tie: '1' }),
      pin(p.regce, 'in', 1, f('Clock enable of the output register (DO_REG = 1); unconnected 1', 'Habilitação do registo de saída (DO_REG = 1); desligado, 1'), { tie: '1' }),
      pin(p.rst, 'in', 1, f('Reset: 1 loads SRVAL into the output', 'Reset: a 1 carrega SRVAL na saída')),
      pin(p.clk, 'in', 1, f('Clock (rising edge)', 'Relógio (flanco ascendente)'), { need: x === 'A', clock: true }));
    outs.push(pin(p.dout, 'out', k.dw, f('Data read', 'Dados lidos')), pin(p.dop, 'out', k.pw, f('Parity bits read', 'Bits de paridade lidos')));
  }
  return [...ins, ...outs];
}
function bwerGens(name) {
  const k = BWER[name];
  const per = x => [
    str(`DATA_WIDTH_${x}`, x === 'A' ? '9' : '0', k.widths, tx(`Port ${x}'s width in bits (0: the port unused${k.sdp ? '; 36: the simple dual port mode, RAM_MODE = SDP' : ''}).`, `Largura do porto ${x} em bits (0: porto por usar${k.sdp ? '; 36: o modo de duplo porto simples, RAM_MODE = SDP' : ''}).`), true),
    int(`DO${x}_REG`, 0, 0, 1, tx(`1: port ${x}'s output through a register (a clock cycle later), 0: the latch only.`, `1: a saída do porto ${x} passa por um registo (um ciclo de relógio depois), 0: só o latch.`)),
    bool(`EN_RSTRAM_${x}`, true, tx(`Whether port ${x}'s reset acts (TRUE) or is ignored (FALSE).`, `Se o reset do porto ${x} atua (TRUE) ou é ignorado (FALSE).`)),
    hex(`INIT_${x}`, k.iw, initMeaning(x)), hex(`SRVAL_${x}`, k.iw, srvalMeaning(x)),
    str(`RST_PRIORITY_${x}`, 'CE', ['CE', 'SR'], tx(`With the output register: CE, the reset acts only when REGCE is 1; SR, the reset first.`, `Com o registo de saída: CE, o reset atua só com REGCE a 1; SR, o reset primeiro.`)),
    str(`WRITE_MODE_${x}`, 'WRITE_FIRST', WRITE_MODES, wmMeaning(x)),
  ];
  return [...per('A'), ...per('B'),
    ...(k.sdp ? [str('RAM_MODE', 'TDP', ['TDP', 'SDP'], tx('TDP: two ports of up to 18 bits; SDP: simple dual port, port A writes 36 bits, port B reads them.', 'TDP: dois portos até 18 bits; SDP: duplo porto simples, o porto A escreve 36 bits e o porto B lê-os.'))] : []),
    str('RSTTYPE', 'SYNC', ['SYNC', 'ASYNC'], tx('The output\'s reset: on the clock edge (SYNC) or at once (ASYNC).', 'O reset da saída: no flanco do relógio (SYNC) ou de imediato (ASYNC).'))];
}

// ------------------------------------------------------------------ DCM_SP (both families)
const DCM_DIVS = ['1.5', '2.0', '2.5', '3.0', '3.5', '4.0', '4.5', '5.0', '5.5', '6.0', '6.5', '7.0', '7.5', '8.0', '9.0', '10.0', '11.0', '12.0', '13.0', '14.0', '15.0', '16.0'];
const DCM_PINS = [
  pin('CLKIN', 'in', 1, tx('Input clock (from an IBUFG or a BUFG)', 'Relógio de entrada (de um IBUFG ou de um BUFG)'), { need: true, clock: true }),
  pin('CLKFB', 'in', 1, tx('Feedback: CLK0 (CLK_FEEDBACK 1X) or CLK2X (2X) through a BUFG', 'Realimentação: CLK0 (CLK_FEEDBACK 1X) ou CLK2X (2X) através de um BUFG')),
  pin('RST', 'in', 1, tx('Reset: 1 stops the outputs and restarts the lock', 'Reset: a 1 para as saídas e recomeça o bloqueio (lock)')),
  pin('DSSEN', 'in', 1, tx('Digital spread spectrum enable (unused: 0)', 'Habilitação do espalhamento espectral digital (por usar: 0)')),
  pin('PSCLK', 'in', 1, tx('Clock of the variable phase shift', 'Relógio do desvio de fase variável')),
  pin('PSEN', 'in', 1, tx('Variable phase shift: 1 makes one step', 'Desvio de fase variável: a 1 dá um passo')),
  pin('PSINCDEC', 'in', 1, tx('Variable phase shift: 1 increments, 0 decrements', 'Desvio de fase variável: a 1 incrementa, a 0 decrementa')),
  pin('CLK0', 'out', 1, tx('The input clock\'s frequency, its phase aligned to CLKIN', 'Frequência do relógio de entrada, com a fase alinhada a CLKIN')),
  pin('CLK90', 'out', 1, tx('CLK0 shifted by 90°', 'CLK0 desviado de 90°')),
  pin('CLK180', 'out', 1, tx('CLK0 shifted by 180°', 'CLK0 desviado de 180°')),
  pin('CLK270', 'out', 1, tx('CLK0 shifted by 270°', 'CLK0 desviado de 270°')),
  pin('CLK2X', 'out', 1, tx('Twice the input frequency', 'O dobro da frequência de entrada')),
  pin('CLK2X180', 'out', 1, tx('CLK2X shifted by 180°', 'CLK2X desviado de 180°')),
  pin('CLKDV', 'out', 1, tx('The input frequency divided by CLKDV_DIVIDE', 'Frequência de entrada dividida por CLKDV_DIVIDE')),
  pin('CLKFX', 'out', 1, tx('The input frequency × CLKFX_MULTIPLY / CLKFX_DIVIDE', 'Frequência de entrada × CLKFX_MULTIPLY / CLKFX_DIVIDE')),
  pin('CLKFX180', 'out', 1, tx('CLKFX shifted by 180°', 'CLKFX desviado de 180°')),
  pin('LOCKED', 'out', 1, tx('1 once the outputs are stable (locked)', 'A 1 quando as saídas estão estáveis (bloqueadas)')),
  pin('PSDONE', 'out', 1, tx('Variable phase shift: 1 when a step is done', 'Desvio de fase variável: a 1 quando um passo terminou')),
  pin('STATUS', 'out', 8, tx('Status bits (bit 1: CLKIN stopped, bit 2: CLKFX stopped)', 'Bits de estado (bit 1: CLKIN parado, bit 2: CLKFX parado)')),
];
const DCM_GENS = [
  real('CLKDV_DIVIDE', '2.0', 1.5, 16, tx('CLKDV = CLKIN / CLKDV_DIVIDE: 1.5 to 8.0 in steps of 0.5, then 9 to 16.', 'CLKDV = CLKIN / CLKDV_DIVIDE: 1,5 a 8,0 em passos de 0,5, depois 9 a 16.'), DCM_DIVS),
  int('CLKFX_MULTIPLY', 4, 2, 32, tx('The multiplier M of CLKFX = CLKIN × M / D.', 'O multiplicador M de CLKFX = CLKIN × M / D.')),
  int('CLKFX_DIVIDE', 1, 1, 32, tx('The divider D of CLKFX = CLKIN × M / D.', 'O divisor D de CLKFX = CLKIN × M / D.')),
  bool('CLKIN_DIVIDE_BY_2', false, tx('TRUE halves the input frequency first.', 'TRUE divide primeiro a frequência de entrada por 2.')),
  real('CLKIN_PERIOD', '10.0', 1.0, 1000, tx('The input clock\'s period in ns (20.0 for 50 MHz), for the timing analysis.', 'Período do relógio de entrada em ns (20,0 para 50 MHz), para a análise temporal.')),
  str('CLKOUT_PHASE_SHIFT', 'NONE', ['NONE', 'FIXED', 'VARIABLE'], tx('The phase shift of the outputs: none, fixed (PHASE_SHIFT) or variable (PSEN / PSINCDEC).', 'O desvio de fase das saídas: nenhum, fixo (PHASE_SHIFT) ou variável (PSEN / PSINCDEC).')),
  str('CLK_FEEDBACK', '1X', ['1X', '2X', 'NONE'], tx('Which output comes back on CLKFB: CLK0 (1X), CLK2X (2X), or none (CLKFX only).', 'Que saída volta em CLKFB: CLK0 (1X), CLK2X (2X), ou nenhuma (só CLKFX).')),
  str('DESKEW_ADJUST', 'SYSTEM_SYNCHRONOUS', ['SYSTEM_SYNCHRONOUS', 'SOURCE_SYNCHRONOUS'], tx('The clock\'s delay adjusted for system-synchronous or source-synchronous interfaces.', 'Atraso do relógio ajustado para interfaces síncronas do sistema ou síncronas da fonte.')),
  str('DFS_FREQUENCY_MODE', 'LOW', ['LOW', 'HIGH'], tx('The frequency range of CLKFX (LOW or HIGH, the data sheet\'s).', 'Gama de frequências de CLKFX (LOW ou HIGH, a da folha de dados).')),
  str('DLL_FREQUENCY_MODE', 'LOW', ['LOW', 'HIGH'], tx('The frequency range of the DLL outputs (CLK0, CLK2X, CLKDV).', 'Gama de frequências das saídas da DLL (CLK0, CLK2X, CLKDV).')),
  bool('DUTY_CYCLE_CORRECTION', true, tx('TRUE corrects the outputs\' duty cycle to 50 %.', 'TRUE corrige o ciclo de trabalho das saídas para 50 %.')),
  int('PHASE_SHIFT', 0, -255, 255, tx('The fixed phase shift, in 1/256 of the period (CLKOUT_PHASE_SHIFT FIXED).', 'Desvio de fase fixo, em 1/256 do período (CLKOUT_PHASE_SHIFT FIXED).')),
  bool('STARTUP_WAIT', false, tx('TRUE: the configuration waits for the DCM to lock before the design starts.', 'TRUE: a configuração espera que o DCM bloqueie antes de o projeto arrancar.')),
];

// ------------------------------------------------------------------ PLL_BASE (Spartan-6)
const PLL_OUTS = [0, 1, 2, 3, 4, 5];
const PLL_PINS = [
  pin('CLKIN', 'in', 1, tx('Input clock (from an IBUFG, a BUFG or a BUFIO2)', 'Relógio de entrada (de um IBUFG, de um BUFG ou de um BUFIO2)'), { need: true, clock: true }),
  pin('CLKFBIN', 'in', 1, tx('Feedback: CLKFBOUT, directly or through a BUFG', 'Realimentação: CLKFBOUT, diretamente ou através de um BUFG'), { need: true }),
  pin('RST', 'in', 1, tx('Reset: 1 stops the outputs and restarts the lock', 'Reset: a 1 para as saídas e recomeça o bloqueio (lock)')),
  pin('CLKFBOUT', 'out', 1, tx('Feedback output: the VCO / CLKFBOUT_MULT, to CLKFBIN', 'Saída de realimentação: o VCO / CLKFBOUT_MULT, para CLKFBIN')),
  ...PLL_OUTS.map(n => pin(`CLKOUT${n}`, 'out', 1, tx(`Output clock ${n}: the VCO / CLKOUT${n}_DIVIDE`, `Relógio de saída ${n}: o VCO / CLKOUT${n}_DIVIDE`))),
  pin('LOCKED', 'out', 1, tx('1 once the outputs are stable (locked)', 'A 1 quando as saídas estão estáveis (bloqueadas)')),
];
const PLL_GENS = [
  str('BANDWIDTH', 'OPTIMIZED', ['OPTIMIZED', 'HIGH', 'LOW'], tx('The loop\'s bandwidth: OPTIMIZED, HIGH (less jitter of its own) or LOW (filters the input\'s).', 'Largura de banda do anel: OPTIMIZED, HIGH (menos jitter próprio) ou LOW (filtra o da entrada).')),
  int('CLKFBOUT_MULT', 6, 1, 64, tx('The multiplier M: VCO = CLKIN × M / DIVCLK_DIVIDE (400 to 1080 MHz).', 'O multiplicador M: VCO = CLKIN × M / DIVCLK_DIVIDE (400 a 1080 MHz).')),
  real('CLKFBOUT_PHASE', '0.0', 0, 360, tx('The feedback\'s phase shift in degrees.', 'Desvio de fase da realimentação em graus.')),
  real('CLKIN_PERIOD', '10.0', 1.0, 52.6, tx('The input clock\'s period in ns (10.0 for 100 MHz).', 'Período do relógio de entrada em ns (10,0 para 100 MHz).')),
  ...PLL_OUTS.flatMap(n => [
    int(`CLKOUT${n}_DIVIDE`, 6, 1, 128, tx(`The divider of CLKOUT${n} = VCO / CLKOUT${n}_DIVIDE.`, `O divisor de CLKOUT${n} = VCO / CLKOUT${n}_DIVIDE.`)),
    real(`CLKOUT${n}_DUTY_CYCLE`, '0.5', 0.01, 0.99, tx(`The fraction of CLKOUT${n}'s period it is high.`, `Fração do período de CLKOUT${n} em que está a 1.`)),
    real(`CLKOUT${n}_PHASE`, '0.0', -360, 360, tx(`CLKOUT${n}'s phase shift in degrees.`, `Desvio de fase de CLKOUT${n} em graus.`)),
  ]),
  str('CLK_FEEDBACK', 'CLKFBOUT', ['CLKFBOUT', 'CLKOUT0'], tx('The output that comes back on CLKFBIN.', 'A saída que volta em CLKFBIN.')),
  str('COMPENSATION', 'SYSTEM_SYNCHRONOUS', ['SYSTEM_SYNCHRONOUS', 'SOURCE_SYNCHRONOUS', 'INTERNAL', 'EXTERNAL', 'DCM2PLL', 'PLL2DCM'], tx('The clock delay the feedback compensates.', 'O atraso do relógio que a realimentação compensa.')),
  int('DIVCLK_DIVIDE', 1, 1, 52, tx('The input divider D: VCO = CLKIN × CLKFBOUT_MULT / D.', 'O divisor de entrada D: VCO = CLKIN × CLKFBOUT_MULT / D.')),
  real('REF_JITTER', '0.1', 0, 0.999, tx('The input clock\'s jitter, a fraction of its period.', 'O jitter do relógio de entrada, uma fração do seu período.')),
  bool('RESET_ON_LOSS_OF_LOCK', false, tx('Must be FALSE on Spartan-6.', 'Tem de ser FALSE no Spartan-6.')),
];

// ------------------------------------------------------------------ the primitives
const RAMB16_TEXT = tx('Block RAM of 16 Kbit of data and 2 Kbit of parity (18 Kbit), synchronous: the address, the data and the write enable are taken on the clock edge, the word read appears after it.',
  'RAM de bloco de 16 Kbit de dados e 2 Kbit de paridade (18 Kbit), síncrona: o endereço, os dados e a habilitação da escrita são lidos no flanco do relógio, a palavra lida aparece depois dele.');
const P = {};
P.ramb16_s = {
  name: 'RAMB16_S', title: 'RAMB16_S', families: ['spartan3e'], description: 'Block RAM 16 Kbit + parity, single port (RAMB16_S1 … RAMB16_S36)',
  text: [tx(`${RAMB16_TEXT.en} Single port: its Port width (1, 2, 4, 9, 18 or 36 bits) makes it RAMB16_S1 … RAMB16_S36.`, `${RAMB16_TEXT.pt} Um porto: a sua Largura do porto (1, 2, 4, 9, 18 ou 36 bits) faz dela RAMB16_S1 … RAMB16_S36.`)],
  params: [{ name: 'portWidth', label: 'Port width', kind: 'select', options: RAM_WIDTHS, default: '9' }, contentsParam],
  meanings: { portWidth: tx('The width of the port\'s words in bits (9, 18, 36: 8, 16, 32 data bits and 1, 2, 4 parity bits).', 'Largura das palavras do porto em bits (9, 18, 36: 8, 16, 32 bits de dados e 1, 2, 4 de paridade).'), contents: contentsMeaning },
  of: p => {
    const w = widthOf(p.portWidth), { ins, outs } = ramb16Pins(w, '', true);
    return { name: `RAMB16_S${w}`, pins: [...ins, ...outs], generics: ramb16Gens(w, ''), contents: { width: RAMB16_PORTS[w][0], words: 16384 / RAMB16_PORTS[w][0], inits: 64 } };
  },
};
P.ramb16_s_s = {
  name: 'RAMB16_S_S', title: 'RAMB16_S_S', families: ['spartan3e'], description: 'Block RAM 16 Kbit + parity, dual port (RAMB16_S1_S1 … RAMB16_S36_S36)',
  text: [tx(`${RAMB16_TEXT.en} Dual port: ports A and B, each with its own clock, share the memory; their widths make it RAMB16_S1_S1 … RAMB16_S36_S36 (port A not wider than port B).`,
    `${RAMB16_TEXT.pt} Duplo porto: os portos A e B, cada um com o seu relógio, partilham a memória; as suas larguras fazem dela RAMB16_S1_S1 … RAMB16_S36_S36 (o porto A não mais largo do que o B).`)],
  params: [{ name: 'widthA', label: 'Port A width', kind: 'select', options: RAM_WIDTHS, default: '9' }, { name: 'widthB', label: 'Port B width', kind: 'select', options: RAM_WIDTHS, default: '9' }, contentsParam],
  meanings: { widthA: tx('The width of port A\'s words in bits (not more than port B\'s).', 'Largura das palavras do porto A em bits (não mais do que a do porto B).'),
    widthB: tx('The width of port B\'s words in bits.', 'Largura das palavras do porto B em bits.'), contents: contentsMeaning },
  of: p => {
    const a = widthOf(p.widthA), b = widthOf(p.widthB), A = ramb16Pins(a, 'A', true), B = ramb16Pins(b, 'B', false);
    return { name: `RAMB16_S${a}_S${b}`, pins: [...A.ins, ...B.ins, ...A.outs, ...B.outs], generics: [...ramb16Gens(a, 'A'), ...ramb16Gens(b, 'B')],
      contents: { width: RAMB16_PORTS[a][0], words: 16384 / RAMB16_PORTS[a][0], inits: 64 }, error: +a > +b ? `no RAMB16_S${a}_S${b}: port A must not be wider than port B (RAMB16_S${b}_S${a} with the ports swapped)` : null };
  },
};
P.mult18x18sio = {
  name: 'MULT18X18SIO', title: 'MULT18X18SIO', families: ['spartan3e'], description: '18 × 18 signed multiplier with optional input and output registers',
  text: [tx('Dedicated 18 × 18 bit multiplier of two\'s complement numbers, P = A × B on 36 bits, with an optional register on A, on B and on the product (AREG, BREG, PREG), each with its clock enable and synchronous reset; B from its input or from the multiplier below (BCIN).',
    'Multiplicador dedicado de 18 × 18 bits de números em complemento para dois, P = A × B em 36 bits, com um registo opcional em A, em B e no produto (AREG, BREG, PREG), cada um com a sua habilitação e o seu reset síncrono; B da sua entrada ou do multiplicador de baixo (BCIN).')],
  // (B needed from its input with B_INPUT DIRECT, BCIN with CASCADE, #848)
  of: p => ({ name: 'MULT18X18SIO', pins: [
    pin('A', 'in', 18, tx('Operand A (signed)', 'Operando A (com sinal)'), { need: true }), pin('B', 'in', 18, tx('Operand B (signed)', 'Operando B (com sinal)'), { need: p.B_INPUT !== 'CASCADE' }),
    pin('BCIN', 'in', 18, tx('Operand B from the multiplier below (B_INPUT CASCADE)', 'Operando B do multiplicador de baixo (B_INPUT CASCADE)'), { need: p.B_INPUT === 'CASCADE' }),
    pin('CEA', 'in', 1, tx('Clock enable of the A register; unconnected 1', 'Habilitação do registo de A; desligado, 1'), { tie: '1' }),
    pin('CEB', 'in', 1, tx('Clock enable of the B register; unconnected 1', 'Habilitação do registo de B; desligado, 1'), { tie: '1' }),
    pin('CEP', 'in', 1, tx('Clock enable of the product register; unconnected 1', 'Habilitação do registo do produto; desligado, 1'), { tie: '1' }),
    pin('RSTA', 'in', 1, tx('Synchronous reset of the A register', 'Reset síncrono do registo de A')), pin('RSTB', 'in', 1, tx('Synchronous reset of the B register', 'Reset síncrono do registo de B')),
    pin('RSTP', 'in', 1, tx('Synchronous reset of the product register', 'Reset síncrono do registo do produto')),
    pin('CLK', 'in', 1, tx('Clock of the registers (rising edge)', 'Relógio dos registos (flanco ascendente)'), { clock: true }),
    pin('BCOUT', 'out', 18, tx('Operand B, to the multiplier above\'s BCIN', 'Operando B, para o BCIN do multiplicador de cima')),
    pin('P', 'out', 36, tx('The product A × B (signed)', 'O produto A × B (com sinal)'))],
  generics: [int('AREG', 1, 0, 1, tx('1: A through a register (a clock cycle later), 0: direct.', '1: A através de um registo (um ciclo de relógio depois), 0: direto.')),
    int('BREG', 1, 0, 1, tx('1: B through a register, 0: direct.', '1: B através de um registo, 0: direto.')),
    int('PREG', 1, 0, 1, tx('1: the product through a register, 0: combinational.', '1: o produto através de um registo, 0: combinatório.')),
    str('B_INPUT', 'DIRECT', ['DIRECT', 'CASCADE'], tx('Where B comes from: its input B (DIRECT) or BCIN (CASCADE).', 'De onde vem B: da sua entrada B (DIRECT) ou de BCIN (CASCADE).'))] }),
};
P.dcm_sp = {
  name: 'DCM_SP', title: 'DCM_SP', families: ['spartan3e', 'spartan6'], description: 'Digital clock manager: clocks of the input\'s frequency, its double, a division and a synthesized frequency',
  text: [tx('Digital Clock Manager: from its input clock CLKIN, CLK0 (deskewed, its phase aligned through the feedback CLKFB), CLK90 / CLK180 / CLK270, CLK2X (twice the frequency), CLKDV (divided by CLKDV_DIVIDE) and CLKFX (× CLKFX_MULTIPLY / CLKFX_DIVIDE); LOCKED is 1 once they are stable.',
    'Gestor digital de relógio (DCM): a partir do relógio de entrada CLKIN, CLK0 (sem desvio, a fase alinhada pela realimentação CLKFB), CLK90 / CLK180 / CLK270, CLK2X (o dobro da frequência), CLKDV (dividido por CLKDV_DIVIDE) e CLKFX (× CLKFX_MULTIPLY / CLKFX_DIVIDE); LOCKED fica a 1 quando estão estáveis.')],
  // (its feedback needed unless CLK_FEEDBACK is NONE: without it the DCM does not lock)
  of: p => ({ name: 'DCM_SP', pins: DCM_PINS.map(q => (q.name === 'CLKFB' ? { ...q, need: p.CLK_FEEDBACK !== 'NONE' } : q)), generics: DCM_GENS }),
};
P.bufg = {
  name: 'BUFG', title: 'BUFG', families: ['spartan3e', 'spartan6'], description: 'Global clock buffer: a clock onto the global clock network',
  text: [tx('Global clock buffer: its input drives one of the global clock lines, which reach every flip-flop of the device with a low skew; a clock made inside the design (a DCM\'s, a PLL\'s output) reaches the logic through one.',
    'Buffer global de relógio: a sua entrada aciona uma das linhas globais de relógio, que chegam a todos os flip-flops do dispositivo com pouco desvio; um relógio feito dentro do projeto (a saída de um DCM, de uma PLL) chega à lógica através de um.')],
  of: () => ({ name: 'BUFG', pins: [pin('I', 'in', 1, tx('The clock to distribute', 'O relógio a distribuir'), { need: true }), pin('O', 'out', 1, tx('The clock on the global network', 'O relógio na rede global'))], generics: [] }),
};
P.bufgmux = {
  name: 'BUFGMUX', title: 'BUFGMUX', families: ['spartan3e'], description: 'Global clock buffer that chooses between two clocks',
  text: [tx('Global clock multiplexer: one of two clocks, I0 when S is 0, I1 when S is 1, onto a global clock line; the switch waits for the current clock to go low before the other one takes over, with no glitch.',
    'Multiplexador global de relógio: um de dois relógios, I0 com S a 0, I1 com S a 1, numa linha global de relógio; a troca espera que o relógio atual desça antes de o outro o substituir, sem impulsos espúrios.')],
  of: () => ({ name: 'BUFGMUX', pins: [pin('I0', 'in', 1, tx('Clock chosen when S is 0', 'Relógio escolhido com S a 0'), { need: true }), pin('I1', 'in', 1, tx('Clock chosen when S is 1', 'Relógio escolhido com S a 1'), { need: true }),
    pin('S', 'in', 1, tx('Select: 0 chooses I0, 1 chooses I1', 'Seleção: 0 escolhe I0, 1 escolhe I1'), { need: true }), pin('O', 'out', 1, tx('The chosen clock on the global network', 'O relógio escolhido na rede global'))], generics: [] }),
};
P.ibufg = {
  name: 'IBUFG', title: 'IBUFG', families: ['spartan3e'], description: 'Input buffer of a global clock pin',
  text: [tx('Input buffer of a dedicated global clock pin (GCLK): the board\'s oscillator enters through it, on to a DCM\'s CLKIN or to a BUFG; its input I is a top-level port of the design.',
    'Buffer de entrada de um pino dedicado de relógio global (GCLK): o oscilador da placa entra por ele, para o CLKIN de um DCM ou para um BUFG; a sua entrada I é um porto de topo do projeto.')],
  of: () => ({ name: 'IBUFG', pins: [pin('I', 'in', 1, tx('The clock pin (a top-level input port)', 'O pino do relógio (um porto de entrada de topo)'), { need: true }), pin('O', 'out', 1, tx('The clock, to a DCM or a BUFG', 'O relógio, para um DCM ou um BUFG'))], generics: [] }),
};
const BWER_TEXT = (k, en, pt) => tx(`${en} Each port's width (DATA_WIDTH_A, DATA_WIDTH_B: 1, 2, 4, 9, 18 or 36 bits; 0 unused), an optional output register (DOA_REG, DOB_REG), byte write enables, its reset to SRVAL.`,
  `${pt} A largura de cada porto (DATA_WIDTH_A, DATA_WIDTH_B: 1, 2, 4, 9, 18 ou 36 bits; 0 por usar), um registo de saída opcional (DOA_REG, DOB_REG), habilitações da escrita por byte, o seu reset para SRVAL.`);
P.ramb8bwer = {
  name: 'RAMB8BWER', title: 'RAMB8BWER', families: ['spartan6'], description: 'Block RAM 9 Kbit (half of an 18 Kbit block), true or simple dual port',
  text: [BWER_TEXT('RAMB8BWER', 'Block RAM of 8 Kbit of data and 1 Kbit of parity (9 Kbit, half of an 18 Kbit block), synchronous, with two ports (TDP, up to 18 bits each) or one of 36 bits writing and the other reading (SDP).',
    'RAM de bloco de 8 Kbit de dados e 1 Kbit de paridade (9 Kbit, metade de um bloco de 18 Kbit), síncrona, com dois portos (TDP, até 18 bits cada) ou um de 36 bits a escrever e o outro a ler (SDP).')],
  params: [contentsParam], meanings: { contents: contentsMeaning },
  of: p => ({ name: 'RAMB8BWER', pins: bwerPins('RAMB8BWER'), generics: bwerGens('RAMB8BWER'), contents: bwerContents('RAMB8BWER', p) }),
};
P.ramb16bwer = {
  name: 'RAMB16BWER', title: 'RAMB16BWER', families: ['spartan6'], description: 'Block RAM 18 Kbit, true dual port',
  text: [BWER_TEXT('RAMB16BWER', 'Block RAM of 16 Kbit of data and 2 Kbit of parity (18 Kbit), synchronous, with two independent ports, each with its own clock.',
    'RAM de bloco de 16 Kbit de dados e 2 Kbit de paridade (18 Kbit), síncrona, com dois portos independentes, cada um com o seu relógio.')],
  params: [contentsParam], meanings: { contents: contentsMeaning },
  // (fixed: SIM_DEVICE, whose default in UNISIM is the Spartan-3A DSP's: ngdbuild warns and changes it otherwise, #859)
  of: p => ({ name: 'RAMB16BWER', pins: bwerPins('RAMB16BWER'), generics: bwerGens('RAMB16BWER'), fixed: [['SIM_DEVICE', 'SPARTAN6']], contents: bwerContents('RAMB16BWER', p) }),
};
// a BWER block RAM's contents in port A's data words (DATA_WIDTH_A; 36 in SDP mode)
function bwerContents(name, p) {
  const k = BWER[name], w = String(p.DATA_WIDTH_A ?? '9');
  const dw = { 1: 1, 2: 2, 4: 4, 9: 8, 18: 16, 36: 32 }[w];
  return dw ? { width: dw, words: (k.words) / dw, inits: k.words / 256 } : null;
}
const DSP_REGS = [['A0REG', 0, 'the first A register'], ['A1REG', 1, 'the second A register'], ['B0REG', 0, 'the first B register (before the pre-adder)'], ['B1REG', 1, 'the second B register (after the pre-adder)'],
  ['CARRYINREG', 1, 'the carry-in register'], ['CARRYOUTREG', 1, 'the carry-out register'], ['CREG', 1, 'the C register'], ['DREG', 1, 'the D register'], ['MREG', 1, 'the multiplier\'s register (M)'],
  ['OPMODEREG', 1, 'the OPMODE register'], ['PREG', 1, 'the P register (the post-adder\'s)']];
const DSP_REGS_PT = { A0REG: 'o primeiro registo de A', A1REG: 'o segundo registo de A', B0REG: 'o primeiro registo de B (antes do pré-somador)', B1REG: 'o segundo registo de B (depois do pré-somador)',
  CARRYINREG: 'o registo do transporte de entrada', CARRYOUTREG: 'o registo do transporte de saída', CREG: 'o registo de C', DREG: 'o registo de D', MREG: 'o registo do multiplicador (M)',
  OPMODEREG: 'o registo de OPMODE', PREG: 'o registo de P (o do pós-somador)' };
const DSP_CE_RST = [['A', 'A'], ['B', 'B'], ['C', 'C'], ['CARRYIN', 'CARRYIN'], ['D', 'D'], ['M', 'M'], ['OPMODE', 'OPMODE'], ['P', 'P']];
P.dsp48a1 = {
  name: 'DSP48A1', title: 'DSP48A1', families: ['spartan6'], description: 'DSP slice: pre-adder, 18 × 18 multiplier and 48-bit post-adder / accumulator',
  text: [tx('DSP slice: a pre-adder (D ± B, OPMODE(4) and (6)), an 18 × 18 signed multiplier (M = A × B) and a 48-bit post-adder / subtracter (P = Z ± (X + CIN), OPMODE(7)), the X and Z multiplexers chosen by OPMODE(1:0) and OPMODE(3:2): a multiply-accumulate on its own, with optional registers on every stage.',
    'Slice DSP: um pré-somador (D ± B, OPMODE(4) e (6)), um multiplicador de 18 × 18 com sinal (M = A × B) e um pós-somador / subtrator de 48 bits (P = Z ± (X + CIN), OPMODE(7)), os multiplexadores X e Z escolhidos por OPMODE(1:0) e OPMODE(3:2): uma multiplicação-acumulação por si só, com registos opcionais em cada andar.')],
  // (M and P not both used: ISE's map refuses it, PhysDesignRules:2136, #859)
  of: () => ({ name: 'DSP48A1', exclusive: [['M', 'P']], pins: [
    pin('A', 'in', 18, tx('Operand A of the multiplier', 'Operando A do multiplicador')), pin('B', 'in', 18, tx('Operand B (of the pre-adder and the multiplier)', 'Operando B (do pré-somador e do multiplicador)')),
    pin('D', 'in', 18, tx('Operand D of the pre-adder', 'Operando D do pré-somador')), pin('C', 'in', 48, tx('Operand C of the post-adder (Z = C)', 'Operando C do pós-somador (Z = C)')),
    pin('PCIN', 'in', 48, tx('P of the DSP slice below (cascade, Z = PCIN)', 'P do slice DSP de baixo (cascata, Z = PCIN)')),
    pin('OPMODE', 'in', 8, tx('The operation: X (1:0), Z (3:2), pre-adder used (4), carry in (5), pre-subtract (6), post-subtract (7)', 'A operação: X (1:0), Z (3:2), pré-somador usado (4), transporte (5), pré-subtração (6), pós-subtração (7)')),
    pin('CARRYIN', 'in', 1, tx('Carry in of the post-adder (CARRYINSEL CARRYIN)', 'Transporte de entrada do pós-somador (CARRYINSEL CARRYIN)')),
    ...DSP_CE_RST.map(([r]) => pin(`CE${r}`, 'in', 1, tx(`Clock enable of the ${r} register; unconnected 1`, `Habilitação do registo de ${r}; desligado, 1`), { tie: '1' })),
    ...DSP_CE_RST.map(([r]) => pin(`RST${r}`, 'in', 1, tx(`Reset of the ${r} register`, `Reset do registo de ${r}`))),
    pin('CLK', 'in', 1, tx('Clock of the registers (rising edge)', 'Relógio dos registos (flanco ascendente)'), { clock: true }),
    pin('BCOUT', 'out', 18, tx('B after the pre-adder, to the slice above', 'B depois do pré-somador, para o slice de cima')),
    pin('CARRYOUT', 'out', 1, tx('Carry out of the post-adder, to the slice above', 'Transporte de saída do pós-somador, para o slice de cima')),
    pin('CARRYOUTF', 'out', 1, tx('Carry out of the post-adder, to the logic', 'Transporte de saída do pós-somador, para a lógica')),
    pin('M', 'out', 36, tx('The product A × B', 'O produto A × B')), pin('P', 'out', 48, tx('The post-adder\'s result', 'O resultado do pós-somador')),
    pin('PCOUT', 'out', 48, tx('P, to the slice above\'s PCIN', 'P, para o PCIN do slice de cima'))],
  generics: [...DSP_REGS.map(([n, d, en]) => int(n, d, 0, 1, tx(`1: ${en} used (a clock cycle more), 0: bypassed.`, `1: ${DSP_REGS_PT[n]} usado (mais um ciclo de relógio), 0: contornado.`))),
    str('CARRYINSEL', 'OPMODE5', ['OPMODE5', 'CARRYIN'], tx('The post-adder\'s carry in: OPMODE(5) or the CARRYIN pin.', 'O transporte de entrada do pós-somador: OPMODE(5) ou o pino CARRYIN.')),
    str('RSTTYPE', 'SYNC', ['SYNC', 'ASYNC'], tx('The registers\' resets: on the clock edge (SYNC) or at once (ASYNC).', 'Os resets dos registos: no flanco do relógio (SYNC) ou de imediato (ASYNC).'))] }),
};
P.pll_base = {
  name: 'PLL_BASE', title: 'PLL_BASE', families: ['spartan6'], description: 'Phase-locked loop: up to six clocks of the VCO\'s frequency divided',
  text: [tx('Phase-locked loop: a VCO at CLKIN × CLKFBOUT_MULT / DIVCLK_DIVIDE (400 to 1080 MHz) and six output clocks, CLKOUTn = VCO / CLKOUTn_DIVIDE, each with its duty cycle and phase; CLKFBOUT comes back on CLKFBIN; LOCKED is 1 once they are stable.',
    'Anel de captura de fase (PLL): um VCO a CLKIN × CLKFBOUT_MULT / DIVCLK_DIVIDE (400 a 1080 MHz) e seis relógios de saída, CLKOUTn = VCO / CLKOUTn_DIVIDE, cada um com o seu ciclo de trabalho e a sua fase; CLKFBOUT volta em CLKFBIN; LOCKED fica a 1 quando estão estáveis.')],
  of: () => ({ name: 'PLL_BASE', pins: PLL_PINS, generics: PLL_GENS }),
};
P.bufio2 = {
  name: 'BUFIO2', title: 'BUFIO2', families: ['spartan6'], description: 'I/O clock buffer: a clock pin\'s clock to the I/O and to a PLL / DCM, optionally divided',
  text: [tx('I/O clock buffer of a clock region: a clock pin\'s clock onto the I/O clock network (IOCLK) and, divided by DIVIDE or not (DIVIDE_BYPASS), on DIVCLK to a PLL, a DCM or a BUFG; SERDESSTROBE for the I/O serializers.',
    'Buffer de relógio de E/S de uma região de relógio: o relógio de um pino de relógio para a rede de relógio de E/S (IOCLK) e, dividido por DIVIDE ou não (DIVIDE_BYPASS), em DIVCLK para uma PLL, um DCM ou um BUFG; SERDESSTROBE para os serializadores de E/S.')],
  of: () => ({ name: 'BUFIO2', pins: [pin('I', 'in', 1, tx('The clock (from a clock pin\'s IBUFG)', 'O relógio (do IBUFG de um pino de relógio)'), { need: true }),
    pin('DIVCLK', 'out', 1, tx('The clock, divided by DIVIDE unless DIVIDE_BYPASS', 'O relógio, dividido por DIVIDE exceto com DIVIDE_BYPASS')),
    pin('IOCLK', 'out', 1, tx('The clock on the I/O clock network', 'O relógio na rede de relógio de E/S')),
    pin('SERDESSTROBE', 'out', 1, tx('The serializers\' strobe: 1 one cycle in DIVIDE', 'O strobe dos serializadores: a 1 um ciclo em DIVIDE'))],
  generics: [int('DIVIDE', 1, 1, 8, tx('The division of DIVCLK (and the strobe\'s period), 1 to 8.', 'A divisão de DIVCLK (e o período do strobe), 1 a 8.')),
    bool('DIVIDE_BYPASS', true, tx('TRUE: DIVCLK is the input clock, not divided.', 'TRUE: DIVCLK é o relógio de entrada, sem divisão.')),
    bool('I_INVERT', false, tx('TRUE inverts the input clock.', 'TRUE inverte o relógio de entrada.')),
    bool('USE_DOUBLER', false, tx('TRUE: IOCLK at twice the input (with a BUFIO2_2CLK pair).', 'TRUE: IOCLK ao dobro da entrada (com um par BUFIO2_2CLK).'))] }),
};
for (const [type, p] of Object.entries(P)) p.type = type;

/** Every device primitive by its symbol type. */
export const DEVICE_PRIMITIVES = P;
/** The families with primitives offered. */
export const PRIMITIVE_FAMILIES = ['spartan3e', 'spartan6'];
const ORDER = {
  spartan3e: ['ramb16_s', 'ramb16_s_s', 'mult18x18sio', 'dcm_sp', 'bufg', 'bufgmux', 'ibufg'],
  spartan6: ['ramb8bwer', 'ramb16bwer', 'dsp48a1', 'pll_base', 'dcm_sp', 'bufg', 'bufio2'],
};
/** The primitives of a family ('spartan3e', 'spartan6'), in the palette's order; none for another family. */
export function devicePrimitives(family) {
  return (ORDER[family] || []).map(t => P[t]);
}

/** A symbol's parameters (its attributes by their names, plus portWidth / widthA / widthB / contents) with the
 *  defaults: the attributes of `type` at their defaults when the parameters do not set them. */
export function primitiveDefaults(type) {
  const d = P[type];
  if (!d) return {};
  const out = {};
  for (const x of d.params || []) out[x.name] = x.default;
  for (const g of d.of(out).generics) out[g.name] = g.default;
  return out;
}

/** The UNISIM primitive a symbol of `type` makes with these parameters: { name, pins, generics, contents?, error? }. */
export function primitiveOf(type, params = {}) {
  const d = P[type];
  if (!d) return null;
  return d.of({ ...primitiveDefaults(type), ...params });
}

/** The resource (a core/resources.js id) a primitive of `type` takes on a family (null: none counted). */
export function primitiveResource(type, family, params = {}) {
  const r = primitiveOf(type, params);
  return r ? resourceOfPrimitive(family, r.name) : null;
}

const realText = n => (Number.isInteger(n) ? n.toFixed(1) : String(n));
/**
 * An attribute's value `v` written in VHDL ('vhdl') or Verilog ('verilog'); null when it is not one of its values
 * (out of range, not a number, not hexadecimal). A real has its decimal point (2.0); a boolean is TRUE / FALSE in
 * VHDL and "TRUE" / "FALSE" in Verilog (as Xilinx's Verilog UNISIM); a hexadecimal value X"…" / <bits>'h….
 */
export function genericValue(g, v, lang) {
  const vl = lang === 'verilog';
  const s = String(v ?? '').trim();
  switch (g.kind) {
    case 'int': {
      if (!/^-?\d+$/.test(s)) return null;
      const n = +s;
      return n < g.min || n > g.max ? null : String(n);
    }
    case 'real': {
      if (!/^-?(\d+(\.\d*)?|\.\d+)$/.test(s)) return null;
      const n = +s;
      if (g.options ? !g.options.some(o => +o === n) : n < g.min || n > g.max) return null;
      return realText(n);
    }
    case 'string': return g.options.includes(s) ? (g.num ? s : `"${s}"`) : null;
    case 'bool': {
      const b = v === true || /^true$/i.test(s) ? true : v === false || /^false$/i.test(s) ? false : null;
      if (b == null) return null;
      return vl ? `"${b ? 'TRUE' : 'FALSE'}"` : (b ? 'TRUE' : 'FALSE');
    }
    case 'hex': {
      const h = s.replace(/^(0x|x")/i, '').replace(/"$/, '').replace(/_/g, '');
      const digits = Math.ceil(g.bits / 4);
      if (!/^[0-9A-Fa-f]+$/.test(h) || BigInt(`0x${h}`) >= 1n << BigInt(g.bits)) return null;
      const p = BigInt(`0x${h}`).toString(16).toUpperCase().padStart(digits, '0');
      return vl ? `${g.bits}'h${p}` : `X"${p}"`;
    }
    default: return null;
  }
}

/**
 * A block RAM's initial contents: `text` hexadecimal words of `width` data bits (spaces or commas between them),
 * from address 0 up, as its INIT_xx attributes ({ INIT_00: '…64 hex digits' }, the ones not all zero); `inits`
 * the number of INIT_xx. Throws an Error naming the word that is not hexadecimal, too wide or past the end.
 */
export function initWords(text, width, inits = 64) {
  const words = String(text || '').split(/[\s,;]+/).filter(Boolean);
  const total = inits * 256 / width;
  if (words.length > total) throw new Error(`${words.length} words: the memory has ${total} words of ${width} bits`);
  let bits = 0n;
  words.forEach((w, k) => {
    const h = w.replace(/^0x/i, '');
    if (!/^[0-9A-Fa-f]+$/.test(h)) throw new Error(`word ${k} '${w}' is not hexadecimal`);
    const n = BigInt(`0x${h}`);
    if (n >= 1n << BigInt(width)) throw new Error(`word ${k} '${w}' is wider than ${width} bits`);
    bits |= n << BigInt(k * width);
  });
  const out = {};
  for (let j = 0; j < inits; j++) {
    const v = (bits >> BigInt(j * 256)) & ((1n << 256n) - 1n);
    if (v) out[`INIT_${j.toString(16).toUpperCase().padStart(2, '0')}`] = v.toString(16).toUpperCase().padStart(64, '0');
  }
  return out;
}
