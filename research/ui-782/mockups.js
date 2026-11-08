// Silinx, a third interface (#782): clickable mock-ups of three directions, each task at four
// screen sizes. Static: no build step, no server; the content is the pong example's (examples/pong)
// and the messages are the ones the app printed for it. Nothing here is the app's code.

// ------------------------------------------------------------------ state
const SIZES = {
  desk:   { w: 1920, h: 1080, label: 'Lab desktop', pt: 'Computador do laboratório', tablet: false },
  laptop: { w: 1366, h: 768,  label: 'Laptop',      pt: 'Portátil', tablet: false },
  tabl:   { w: 1180, h: 820,  label: 'Tablet landscape', pt: 'Tablet horizontal', tablet: true },
  tabp:   { w: 820,  h: 1180, label: 'Tablet portrait',  pt: 'Tablet vertical', tablet: true },
};
const TASKS = ['edit', 'sim', 'emu', 'impl', 'prog'];
const TASK_LABEL = { edit: 'Edit', sim: 'Simulate', emu: 'Emulate', impl: 'Implement', prog: 'Program' };
const DIRS = {
  a: { name: 'Task workspaces', pt: 'Espaços por tarefa',
       note: 'The five tasks are the top-level navigation. Each task opens with its own arrangement: the editor and the design when editing, the waves when simulating, the board when emulating, the results when implementing. Panels the task does not need fold into a rail and come back with one click; one message centre at the bottom, folded to its last line.' },
  b: { name: 'The flow', pt: 'O fluxo',
       note: 'The design flow is the left rail: Design, Simulate, Emulate, Implement, Program, in order, each with its state (done, out of date, not run) and its results as places to open (the waves, the board, the summary, the timing, the bitstream). No Implementation / Simulation view: the test bench sits with Simulate, the UCF with Implement. The rail folds to numbered dots; messages are kept per step and in one log.' },
  c: { name: 'Stage and dock', pt: 'Palco e painel',
       note: 'One stage for the document in front (editor, waves, board, summary), which maximizes or opens in a window of its own, and one dock beside it whose tabs follow the task: Design, Signals, Watch, Reports, Messages. One command bar on top for commands, files and ISim commands. Closest to today\'s modern interface: the cheapest to build.' },
};
const S = { dir: 'a', task: 'edit', size: 'laptop', lang: 'en', actual: false, file: 'pong.v', filter: null, cursor: 3200 };   // filter null: the task's own source
const UI = {};                                   // per screen size: the panels the viewer opened or closed
const ui = size => (UI[size] ||= {});
const reset = () => { for (const k in UI) delete UI[k]; };

// ------------------------------------------------------------------ Portuguese (the app's own words where it has them, web/js/i18n.js)
const PT = {
  'Edit': 'Editar', 'Simulate': 'Simular', 'Emulate': 'Emular', 'Implement': 'Implementar', 'Program': 'Programar',
  'Design': 'Projeto', 'Hierarchy': 'Hierarquia', 'Test Benches': 'Bancadas de Teste', 'Constraints': 'Restrições',
  'Search commands and files…': 'Procurar comandos e ficheiros…', 'Messages': 'Mensagens', 'Check': 'Verificar',
  'Check Syntax': 'Verificar Sintaxe', 'All': 'Todas', 'Simulation': 'Simulação', 'Emulator': 'Emulador', 'Synthesis': 'Síntese',
  'Implementation': 'Implementação', 'Board': 'Placa', 'Errors': 'Erros', 'Warnings': 'Avisos', 'Ready': 'Pronto',
  'Restart': 'Reiniciar', 'Run All': 'Executar Tudo', 'Run for': 'Executar durante', 'Step': 'Passo', 'Break': 'Parar',
  'Objects': 'Objetos', 'Instances': 'Instâncias', 'Value': 'Valor', 'Signals': 'Sinais', 'Sim Time': 'Tempo de Simulação',
  'Pause': 'Pausa', 'Run': 'Executar', 'Power cycle': 'Desligar e ligar', 'Clock:': 'Relógio:', 'Real time': 'Tempo real',
  'Model:': 'Modelo:', 'Behavioral (RTL)': 'Comportamental (RTL)', 'Watch': 'Observar', 'Timing generics': 'Genéricos de temporização',
  'Synthesize - Yosys': 'Sintetizar - Yosys', 'Implement Design': 'Implementar Projeto', 'Translate': 'Traduzir', 'Map': 'Mapear',
  'Place & Route': 'Posicionar e Encaminhar', 'Static Timing': 'Temporização Estática', 'Generate Programming File': 'Gerar Ficheiro de Programação',
  'Run all steps': 'Executar todos os passos', 'Design Summary': 'Resumo do Projeto', 'Device Utilization Summary': 'Resumo da Utilização do Dispositivo',
  'Timing Constraints': 'Restrições de Temporização', 'All constraints met': 'Todas as restrições cumpridas', 'Minimum period': 'Período mínimo',
  'Programming File': 'Ficheiro de Programação', 'Detailed Reports': 'Relatórios Detalhados', 'Slices': 'Slices', 'LUTs': 'LUTs',
  'Flip-flops': 'Flip-flops', 'Bonded IOBs': 'IOBs ligados', 'Initialize Chain (Scan)': 'Inicializar Cadeia (Scan)', 'Program FPGA': 'Programar FPGA',
  'Program PROM': 'Programar PROM', 'Configuration file': 'Ficheiro de configuração', 'up to date': 'atualizado', 'Connected': 'Ligada',
  'Loads the FPGA directly (volatile: lost at power-off).': 'Carrega a FPGA diretamente (volátil: perde-se ao desligar).',
  'Stores the design in the flash: it starts at power-up (mode jumper on ROM, JP3).': 'Guarda o projeto na flash: arranca ao ligar (jumper de modo em ROM, JP3).',
  'Maximize': 'Maximizar', 'Open in a window': 'Abrir numa janela', 'Show or hide the panel': 'Mostrar ou esconder o painel',
  'Reports': 'Relatórios', 'Waves': 'Ondas', 'Log': 'Registo', 'Sources': 'Fontes', 'Results': 'Resultados', 'not run yet': 'ainda não executado',
  'done': 'feito', 'out of date': 'desatualizado', 'Utilization': 'Utilização', 'Timing met': 'Temporização cumprida', 'Pin plan': 'Plano de pinos',
  'FPGA view': 'Vista da FPGA', 'Chain': 'Cadeia', 'RTL schematic': 'Esquemático RTL', 'Test bench': 'Bancada de teste', 'Board (RTL)': 'Placa (RTL)',
  'New Source…': 'Nova Fonte…', 'Type a command, a file or an ISim command': 'Escreva um comando, um ficheiro ou um comando do ISim',
  'press BTN0 to serve': 'carregue em BTN0 para servir', 'Process "Generate Programming File" completed successfully': 'Processo "Gerar Ficheiro de Programação" concluído com sucesso',
  'no errors, no warnings': 'sem erros, sem avisos', 'Timing report': 'Relatório de temporização', 'Synthesis report': 'Relatório de síntese',
  'Programmed': 'Programada', 'Steps': 'Passos', 'Board picture fits the screen; double-tap to maximize': 'A placa ocupa o ecrã; toque duas vezes para maximizar',
  'Behavioral Check Syntax': 'Verificar Sintaxe Comportamental', 'Simulate Behavioral Model': 'Simular Modelo Comportamental',
  'View RTL Schematic': 'Ver Esquemático RTL', 'I/O Pin Planning': 'Planeamento de Pinos de E/S', 'Edit Constraints (Text)': 'Editar Restrições (Texto)',
  'Emulate Behavioral Model (RTL)': 'Emular Modelo Comportamental (RTL)', 'Configure Target Device': 'Configurar Dispositivo',
  'more': 'mais', 'Command line': 'Linha de comandos', 'Files': 'Ficheiros', 'Close': 'Fechar', 'Current': 'Atual', 'Used': 'Usado', 'Available': 'Disponível',
  'Generated': 'Gerado', 'Status': 'Estado', 'Report': 'Relatório', 'Out of date since pong.v changed': 'Desatualizado desde que pong.v mudou',
};
const T = s => (S.lang === 'pt' && PT[s]) || s;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ------------------------------------------------------------------ icons
const P = {
  edit: '<path d="M3 13l.8-3.4L10.5 3a1.4 1.4 0 0 1 2 2L5.8 11.7z"/><path d="M9.5 4l2.5 2.5"/>',
  sim: '<path d="M1 9h2.5l2-5 3 9 2.2-6 1.3 2H15"/>',
  emu: '<rect x="1.5" y="3" width="13" height="10" rx="1.5"/><rect x="6" y="5.5" width="4" height="4"/><path d="M3.5 11h1M11.5 11h1"/>',
  impl: '<rect x="4" y="4" width="8" height="8" rx="1"/><path d="M6 1.5V4M10 1.5V4M6 12v2.5M10 12v2.5M1.5 6H4M1.5 10H4M12 6h2.5M12 10h2.5"/>',
  prog: '<path d="M8 1.5v8M5 6.5l3 3 3-3"/><path d="M2.5 11v2.5h11V11"/>',
  panel: '<rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M6 2.5v11"/>',
  rpanel: '<rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M10 2.5v11"/>',
  max: '<path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"/>',
  pop: '<rect x="1.5" y="5" width="9.5" height="9.5" rx="1"/><path d="M8 1.5h6.5V8M14.5 1.5L8 8"/>',
  msg: '<path d="M2 2.5h12v8.5H6.5L3.5 14v-3H2z"/>',
  search: '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/>',
  play: '<path d="M4.5 2.5l9 5.5-9 5.5z" fill="currentColor"/>',
  pause: '<path d="M5 3v10M11 3v10" stroke-width="2.5"/>',
  step: '<path d="M3 3l7 5-7 5z" fill="currentColor"/><path d="M12.5 3v10" stroke-width="2"/>',
  restart: '<path d="M3 8a5 5 0 1 0 1.6-3.7"/><path d="M3 2v3.5h3.5"/>',
  check: '<path d="M2.5 8.5l3.5 3.5 7.5-8"/>',
  zin: '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14M5 7h4M7 5v4"/>',
  zout: '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14M5 7h4"/>',
  fit: '<path d="M1.5 5V1.5H5M11 1.5h3.5V5M14.5 11v3.5H11M5 14.5H1.5V11"/><path d="M5 8h6"/>',
  file: '<path d="M4 1.5h5.5L12.5 4.5v10h-8.5z"/><path d="M9.5 1.5v3h3"/>',
  chip: '<rect x="3" y="3" width="10" height="10" rx="1"/><path d="M6 6h4v4H6z"/>',
  pin: '<path d="M8 14.5s-4.5-4.5-4.5-8a4.5 4.5 0 0 1 9 0c0 3.5-4.5 8-4.5 8z"/><circle cx="8" cy="6.5" r="1.6"/>',
  close: '<path d="M4 4l8 8M12 4l-8 8"/>',
  plus: '<path d="M8 3v10M3 8h10"/>',
  bench: '<path d="M6 1.5v5L2.5 13a1 1 0 0 0 .9 1.5h9.2a1 1 0 0 0 .9-1.5L10 6.5v-5M5 1.5h6"/>',
  list: '<path d="M2 4h12M2 8h12M2 12h8"/>',
  grid: '<rect x="2" y="2" width="5" height="5"/><rect x="9" y="2" width="5" height="5"/><rect x="2" y="9" width="5" height="5"/><rect x="9" y="9" width="5" height="5"/>',
};
const I = k => `<span class="ico" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${P[k]}</svg></span>`;
const TASK_ICON = { edit: 'edit', sim: 'sim', emu: 'emu', impl: 'impl', prog: 'prog' };

// ------------------------------------------------------------------ the pong example
const FILES = {
  'pong.v': { start: 12, lang: 'v', text: `module pong #(
    parameter TICK     = 6250000,             // clock cycles per ball step at the start (8 per second)
    parameter STABLE   = 1000000,             // button debounce (20 ms)
    parameter REFRESH  = 50000,               // display: cycles per digit (1 ms)
    parameter WIN      = 5                    // points to win a game
) (
    input  wire       clk,                    // 50 MHz
    input  wire [1:0] sw,
    input  wire [3:0] btn,
    output reg  [7:0] led,
    output wire [6:0] seg,
    output wire [3:0] an,
    output wire       dp
);
    localparam SERVE = 2'd0, PLAY = 2'd1, POINT = 2'd2, OVER = 2'd3;
    localparam RIGHT = 1'b0, LEFT = 1'b1;

    wire pressR, pressL, press1, press2;
    debounce #(.STABLE(STABLE)) dbR (.clk(clk), .btn(btn[0]), .press(pressR));
    debounce #(.STABLE(STABLE)) dbL (.clk(clk), .btn(btn[3]), .press(pressL));
    debounce #(.STABLE(STABLE)) db1 (.clk(clk), .btn(btn[1]), .press(press1));
    debounce #(.STABLE(STABLE)) db2 (.clk(clk), .btn(btn[2]), .press(press2));

    reg [1:0]  state = SERVE;
    reg [2:0]  pos = 3'd0;                    // the ball: LED 0 (right) .. 7 (left)
    reg        dir = LEFT;                    // where the ball goes
    reg [23:0] period = TICK;                 // cycles per step now
    reg [23:0] timer = 24'd0;
    reg [3:0]  scoreL = 4'd0, scoreR = 4'd0;
    reg        server = RIGHT, pointTo = RIGHT;
    reg        lockL = 1'b0, lockR = 1'b0;    // pressed too early in this rally
    reg [3:0]  hold = 4'd0;                   // steps left showing a point
    reg        paused = 1'b0;
    // a slow beat for blinking: one half-period every TICK cycles
    reg [23:0] beatCount = 24'd0;
    reg        beat = 1'b0;

    wire [23:0] start  = sw[1] ? TICK / 2 : TICK;
    wire [23:0] faster = period - (period >> 3);
    wire        step   = !paused && (timer == period - 1);

    always @(posedge clk) begin
        if (beatCount == TICK - 1) begin beatCount <= 24'd0; beat <= ~beat; end
        else beatCount <= beatCount + 24'd1;
    end

    always @(posedge clk) begin
        if (sw[0]) begin
            state <= SERVE; server <= RIGHT; pos <= 3'd0;
            scoreL <= 4'd0; scoreR <= 4'd0; timer <= 24'd0; paused <= 1'b0;
        end else begin` },
  'tb_pong.v': { start: 7, lang: 'v', text: `\`timescale 1ns / 1ps
module tb_pong;
    reg        clk = 1'b0;
    reg  [1:0] sw = 2'b01;                    // in reset
    reg  [3:0] btn = 4'b0000;
    wire [7:0] led;
    wire [6:0] seg;
    wire [3:0] an;
    wire       dp;
    integer    errors = 0;

    pong #(.TICK(32), .STABLE(2), .REFRESH(2), .WIN(2)) uut (
        .clk(clk), .sw(sw), .btn(btn), .led(led), .seg(seg), .an(an), .dp(dp));

    always #10 clk = ~clk;                    // 50 MHz

    // press and release a button (long enough for the debouncer)
    task press(input integer b);
        begin
            btn[b] = 1'b1; repeat (6) @(posedge clk);
            btn[b] = 1'b0; repeat (6) @(posedge clk);
        end
    endtask` },
  'top.ucf': { start: 1, lang: 'ucf', text: `# UCF for top 'pong' on Digilent Basys2 (xc3s250e-4-cp132), generated by Silinx

NET "clk"    LOC = "B8" ;
NET "clk"    CLOCK_DEDICATED_ROUTE = FALSE ;
NET "sw<0>"  LOC = "P11" ;
NET "sw<1>"  LOC = "L3" ;
NET "btn<0>" LOC = "G12" ;
NET "btn<1>" LOC = "C11" ;
NET "btn<2>" LOC = "M4" ;
NET "btn<3>" LOC = "A7" ;
NET "led<0>" LOC = "M5" ;
NET "led<1>" LOC = "M11" ;
NET "led<2>" LOC = "P7" ;
NET "led<3>" LOC = "P6" ;
NET "led<4>" LOC = "N5" ;
NET "led<5>" LOC = "N4" ;
NET "led<6>" LOC = "P4" ;
NET "led<7>" LOC = "G1" ;

# Timing constraints
NET "clk" TNM_NET = "clk" ;
TIMESPEC "TS_clk" = PERIOD "clk" 20 ns HIGH 50% ;` },
};
const KW = /\b(module|endmodule|parameter|localparam|input|output|wire|reg|integer|always|posedge|begin|end|if|else|case|endcase|task|endtask|repeat|NET|LOC|TIMESPEC|PERIOD|TNM_NET|HIGH)\b/g;
function highlight(line, lang) {
  let code = line, com = '';
  const ci = lang === 'ucf' ? line.indexOf('#') : line.indexOf('//');
  if (ci >= 0) { code = line.slice(0, ci); com = line.slice(ci); }
  let h = esc(code).replace(/\b(\d+'[bdh][0-9a-fA-F_]+|\d+)\b/g, '<span class="n">$1</span>').replace(KW, '<span class="k">$1</span>');
  return h + (com ? `<span class="c">${esc(com)}</span>` : '');
}

// the messages the app printed for pong (Check Syntax, simulation, emulator, implementation), by source
const MSGS = [
  ['check', 'info', 'Started : "Check Syntax".'],
  ['check', 'info', 'Analyzing Verilog file "src/debounce.v" into library work'],
  ['check', 'info', 'Analyzing Verilog file "src/sevenseg.v" into library work'],
  ['check', 'info', 'Analyzing Verilog file "src/pong.v" into library work'],
  ['check', 'info', 'Elaborating top module <pong>: 49 signals, 19 processes.'],
  ['check', 'ok', 'Process "Check Syntax" completed successfully'],
  ['sim', 'info', 'Started : "Simulate Behavioral Model".'],
  ['sim', 'info', "Building simulation model for top 'tb_pong'..."],
  ['sim', 'info', 'Simulation model ready: 49 signals, 19 processes. Launching ISim view.'],
  ['sim', 'info', 'Simulator is doing circuit initialization process.'],
  ['sim', 'info', 'Finished circuit initialization process.'],
  ['sim', 'cmd', 'ISim> run 8 us'],
  ['emu', 'info', "Board Emulator: 'pong' (RTL, compiled) on Digilent Basys2 — 27 port bit(s) on board resources."],
  ['synth', 'info', 'Started : "Generate Programming File".'],
  ['synth', 'info', 'Writing <pong> as one flat module for Yosys; Yosys (WebAssembly) maps it onto the spartan3e cells.'],
  ['synth', 'info', 'Netlist: build/open/pong.json (1009 cells) in 3.6 s'],
  ['impl', 'info', 'Netlist of <pong> read; constraints: pong.ucf, 27 pin location(s), 1 PERIOD constraint(s).'],
  ['impl', 'info', 'Number of occupied Slices: 243 out of 2448 10%'],
  ['impl', 'info', 'Placed 271 sites in 0.3 s (estimated critical path 10.9 ns): build/open/placed.xdl'],
  ['impl', 'info', 'Routed 632 nets (4217 PIPs, 14 passes) in 0.7 s: build/open/routed.xdl'],
  ['impl', 'ok', 'constraint PERIOD 20 ns on clk: met (period 11.724 ns, slack 8.276 ns)'],
  ['impl', 'info', 'Bitstream: build/pong.bit (169287 bytes, every feature in the bit database)'],
  ['impl', 'ok', 'Process "Generate Programming File" completed successfully'],
  ['prog', 'info', 'Programming FPGA (SRAM)...'],
  ['prog', 'ok', "'1': Programmed successfully."],
];
const SRC = { check: 'Check Syntax', sim: 'Simulation', emu: 'Emulator', synth: 'Synthesis', impl: 'Implementation', prog: 'Board' };
const TASK_SRC = { edit: 'check', sim: 'sim', emu: 'emu', impl: 'impl', prog: 'prog' };
const LAST = {
  edit: ['ok', 'no errors, no warnings — 3 files, 49 signals, 19 processes'],
  sim: ['info', 'ISim> run 8 us — Sim Time 8,000,000 ps'],
  emu: ['info', "Board Emulator: 'pong' (RTL, compiled) on Digilent Basys2 — 27 port bit(s)"],
  impl: ['ok', 'Process "Generate Programming File" completed successfully — build/pong.bit'],
  prog: ['ok', "'1': Programmed successfully. (Digilent Basys2, XC3S250E)"],
};

// ------------------------------------------------------------------ the waves (tb_pong: TICK 32, a ball step every 640 ns)
const SPAN = 8000;
const WAVES = [
  { name: 'clk', kind: 'clock' },
  { name: 'sw[1:0]', bus: [[0, '01'], [80, '00']] },
  { name: 'btn[3:0]', bus: [[0, '0'], [1300, '1'], [1420, '0']] },
  { name: 'led[7:0]', bus: [[0, '00'], [80, '01'], [720, '00'], [1360, '01'], [2080, '02'], [2720, '04'], [3360, '08'], [4000, '10'], [4640, '20'], [5280, '40'], [5920, '80'], [6560, '00']] },
  { name: 'uut/state', bus: [[0, 'SERVE'], [1440, 'PLAY'], [6560, 'POINT']] },
  { name: 'uut/pos[2:0]', bus: [[0, '0'], [2080, '1'], [2720, '2'], [3360, '3'], [4000, '4'], [4640, '5'], [5280, '6'], [5920, '7']] },
  { name: 'uut/scoreL[3:0]', bus: [[0, '0']] },
  { name: 'uut/scoreR[3:0]', bus: [[0, '0'], [6560, '1']] },
  { name: 'an[3:0]', kind: 'dense', v: 'e…7' },
  { name: 'seg[6:0]', kind: 'dense', v: '40…7f' },
];
const valAt = (w, t) => w.kind === 'clock' ? (Math.floor(t / 10) % 2 ? '1' : '0') : w.kind === 'dense' ? w.v : w.bus.filter(([at]) => at <= t).pop()[1];
function drawWaves(el) {
  const W = el.clientWidth, rowh = parseFloat(getComputedStyle(el).getPropertyValue('--rowh')) || 26, top = 24;
  const H = top + WAVES.length * rowh;
  const x = t => (t / SPAN) * (W - 8);
  let g = '';
  for (let t = 0; t <= SPAN; t += 1000) {
    g += `<line x1="${x(t)}" y1="${top}" x2="${x(t)}" y2="${H}" stroke="var(--wave-grid)"/>`;
    g += `<text x="${x(t) + 3}" y="15" fill="var(--wave-text)" font-size="11" font-family="ui-monospace,Menlo,monospace">${t / 1000} us</text>`;
  }
  WAVES.forEach((w, i) => {
    const y0 = top + i * rowh + 5, y1 = top + (i + 1) * rowh - 5, ym = (y0 + y1) / 2;
    g += `<line x1="0" y1="${top + (i + 1) * rowh}" x2="${W}" y2="${top + (i + 1) * rowh}" stroke="var(--wave-grid)"/>`;
    if (w.kind === 'clock') {
      g += `<rect x="0" y="${y0}" width="${x(SPAN)}" height="${y1 - y0}" fill="var(--wave-fg)" opacity=".55"/>`;
    } else if (w.kind === 'dense') {
      g += `<rect x="0" y="${y0}" width="${x(SPAN)}" height="${y1 - y0}" fill="var(--wave-bus)" opacity=".28"/><line x1="0" y1="${y0}" x2="${x(SPAN)}" y2="${y0}" stroke="var(--wave-bus)"/><line x1="0" y1="${y1}" x2="${x(SPAN)}" y2="${y1}" stroke="var(--wave-bus)"/>`;
    } else {
      w.bus.forEach(([t, v], k) => {
        const a = x(t), b = x(k + 1 < w.bus.length ? w.bus[k + 1][0] : SPAN), d = Math.min(3, (b - a) / 2);
        g += `<path d="M${a} ${ym}L${a + d} ${y0}H${b - d}L${b} ${ym}L${b - d} ${y1}H${a + d}Z" fill="none" stroke="var(--wave-fg)"/>`;
        if (b - a > v.length * 7 + 6) g += `<text x="${(a + b) / 2}" y="${ym + 4}" fill="var(--wave-text)" font-size="11" text-anchor="middle" font-family="ui-monospace,Menlo,monospace">${v}</text>`;
      });
    }
  });
  const cx = x(S.cursor);
  g += `<line x1="${cx}" y1="0" x2="${cx}" y2="${H}" stroke="var(--wave-cursor)" stroke-width="1.5"/><rect x="${cx - 30}" y="2" width="60" height="16" rx="3" fill="var(--wave-cursor)"/><text x="${cx}" y="14" text-anchor="middle" font-size="11" font-family="ui-monospace,Menlo,monospace" fill="#111">${(S.cursor / 1000).toFixed(2)} us</text>`;
  el.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Waves of tb_pong, 0 to 8 us">${g}</svg>`;
}
function wavesView() {
  const names = WAVES.map(w => `<div><span>${esc(w.name)}</span><span>${esc(valAt(w, S.cursor))}</span></div>`).join('');
  return `<div class="wavebox"><div class="wnames"><div class="wh"><span>${T('Signals')}</span><span>${T('Value')}</span></div>${names}</div><div class="wplot" data-act="cursor"></div></div>`;
}
function objectsList() {
  const inst = ['tb_pong', 'uut - pong', 'dbR - debounce', 'dbL - debounce', 'db1 - debounce', 'db2 - debounce', 'display - sevenseg'];
  return `<div class="ph">${T('Instances')}</div><ul class="tree">${inst.map((n, i) => `<li class="${i ? (i === 1 ? 'ind1 sel' : 'ind2') : ''}">${I(i ? 'chip' : 'bench')}<span>${n}</span></li>`).join('')}</ul>
    <div class="ph">${T('Objects')} <span class="spacer"></span><span class="muted" style="text-transform:none;letter-spacing:0">uut</span></div>
    <ul class="tree objs">${['state', 'pos', 'dir', 'period', 'timer', 'scoreL', 'scoreR', 'server', 'paused', 'beat'].map(n => {
      const w = WAVES.find(w => w.name.startsWith('uut/' + n)); return `<li><span>${n}</span><span class="mono muted">${w ? esc(valAt(w, S.cursor)) : n === 'dir' ? '1' : n === 'period' ? '32' : n === 'timer' ? '17' : '0'}</span></li>`; }).join('')}</ul>`;
}

// ------------------------------------------------------------------ the board (Basys2) and a small model of pong for it
const E = { state: 'SERVE', server: 0, pos: 0, dir: 1, sL: 0, sR: 0, beat: false, paused: false, running: true, sw: [0, 0, 0, 0, 0, 0, 0, 0], cycles: 11018814 };
function emuPress(b) {
  if (E.state === 'OVER') { Object.assign(E, { state: 'SERVE', server: 0, pos: 0, sL: 0, sR: 0 }); return; }
  if (b === 1 || b === 2) { if (E.state === 'PLAY') E.paused = !E.paused; return; }
  if (E.state === 'SERVE') {
    if (b === 0 && E.server === 0) Object.assign(E, { state: 'PLAY', pos: 0, dir: 1 });
    if (b === 3 && E.server === 1) Object.assign(E, { state: 'PLAY', pos: 7, dir: -1 });
  } else if (E.state === 'PLAY' && !E.paused) {
    if (b === 3 && E.pos === 7 && E.dir === 1) E.dir = -1;
    if (b === 0 && E.pos === 0 && E.dir === -1) E.dir = 1;
  }
}
function emuTick() {
  if (!E.running) return;
  E.beat = !E.beat; E.cycles += 6250000;
  if (E.sw[0]) Object.assign(E, { state: 'SERVE', server: 0, pos: 0, sL: 0, sR: 0, paused: false });
  else if (E.state === 'PLAY' && !E.paused) {
    E.pos += E.dir;
    if (E.pos > 7 || E.pos < 0) {
      const leftMissed = E.pos > 7;
      if (leftMissed) E.sR++; else E.sL++;
      E.server = leftMissed ? 1 : 0; E.state = (E.sL >= 5 || E.sR >= 5) ? 'OVER' : 'SERVE';
      E.pos = E.server ? 7 : 0;
    }
  }
  paintBoards();
}
function ledsNow() {
  const on = new Array(8).fill(false);
  if (E.state === 'SERVE') on[E.server ? 7 : 0] = E.beat;
  else if (E.state === 'PLAY') on[E.pos] = true;
  else if (E.state === 'OVER') for (let i = 0; i < 4; i++) on[(E.sR >= 5 ? 0 : 4) + i] = E.beat;
  return on;
}
const SEGS = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '-': 'g', ' ': '' };
function paintBoards() {
  const leds = ledsNow(), digits = [E.sL, E.paused ? '-' : ' ', E.paused ? '-' : ' ', E.sR];
  document.querySelectorAll('[data-led]').forEach(el => el.classList.toggle('on', leds[+el.dataset.led]));
  document.querySelectorAll('[data-seg]').forEach(el => { const [d, s] = el.dataset.seg.split(':'); el.classList.toggle('on', SEGS[digits[+d]].includes(s)); });
  document.querySelectorAll('[data-sw]').forEach(el => el.setAttribute('transform', `translate(0 ${E.sw[+el.dataset.sw] ? -9 : 0})`));
  document.querySelectorAll('[data-emustat]').forEach(el => { el.textContent = `t = ${(E.cycles * 20).toLocaleString('en-US')} ns · ${E.cycles.toLocaleString('en-US')} cycles`; });
  document.querySelectorAll('[data-watch]').forEach(el => { el.textContent = { state: E.state, pos: E.pos, scoreL: E.sL, scoreR: E.sR, paused: +E.paused }[el.dataset.watch]; });
}
function digitSvg(x, y, d) {
  const s = { a: [x + 4, y, 22, 5], d: [x + 4, y + 50, 22, 5], g: [x + 4, y + 25, 22, 5], f: [x, y + 3, 5, 22], b: [x + 25, y + 3, 5, 22], e: [x, y + 28, 5, 22], c: [x + 25, y + 28, 5, 22] };
  return Object.entries(s).map(([k, [a, b, w, h]]) => `<rect class="seg" data-seg="${d}:${k}" x="${a}" y="${b}" width="${w}" height="${h}" rx="2"/>`).join('');
}
function boardSvg() {
  let s = `<svg viewBox="0 0 700 430" role="img" aria-label="Digilent Basys2 board"><rect x="4" y="4" width="692" height="422" rx="22" fill="var(--pcb)" stroke="var(--pcb-edge)" stroke-width="6"/>`;
  [[30, 30], [670, 30], [30, 400], [670, 400]].forEach(([a, b]) => { s += `<circle cx="${a}" cy="${b}" r="10" fill="#c9a23a"/><circle cx="${a}" cy="${b}" r="5" fill="var(--pcb-edge)"/>`; });
  ['JA', 'JB', 'JC', 'JD'].forEach((p, i) => { s += `<rect x="${150 + i * 120}" y="22" width="70" height="16" rx="2" fill="#111"/><text x="${185 + i * 120}" y="58" fill="var(--pcb-ink)" font-size="12" text-anchor="middle" font-family="Arial">${p}</text>`; });
  s += `<text x="40" y="160" fill="#fff" font-size="40" font-weight="700" font-family="Arial">BASYS 2</text>`;
  s += `<rect x="300" y="90" width="120" height="120" rx="4" fill="#15171b"/><text x="360" y="140" fill="#fff" font-size="15" font-weight="700" text-anchor="middle" font-family="Arial">XILINX</text><text x="360" y="160" fill="#bbb" font-size="10" text-anchor="middle" font-family="Arial">SPARTAN-3E</text><text x="360" y="174" fill="#bbb" font-size="10" text-anchor="middle" font-family="Arial">XC3S250E</text>`;
  s += `<text x="560" y="190" fill="#fff" font-size="20" font-weight="700" text-anchor="middle" font-family="Arial">DIGILENT</text>`;
  for (let i = 0; i < 8; i++) { const x = 40 + i * 42, n = 7 - i; s += `<rect class="board-led" data-led="${n}" x="${x}" y="250" width="16" height="10" rx="2"/><text x="${x + 8}" y="276" fill="var(--pcb-ink)" font-size="10" text-anchor="middle" font-family="Arial">LD${n}</text>`; }
  s += `<rect x="440" y="230" width="230" height="80" rx="4" fill="#1a0b0b"/>`;
  for (let d = 0; d < 4; d++) s += digitSvg(458 + d * 54, 243, d);
  for (let i = 0; i < 8; i++) { const x = 40 + i * 42, n = 7 - i; s += `<g class="board-sw" data-act="sw:${n}" role="button" aria-label="SW${n}"><rect x="${x}" y="320" width="18" height="34" rx="2" fill="#0d0d0d"/><g data-sw="${n}"><rect x="${x + 3}" y="336" width="12" height="14" rx="1" fill="#e9e9e9"/></g><text x="${x + 9}" y="372" fill="var(--pcb-ink)" font-size="10" text-anchor="middle" font-family="Arial">SW${n}</text></g>`; }
  for (let i = 0; i < 4; i++) { const x = 470 + i * 54, n = 3 - i; s += `<g class="board-btn" data-act="btn:${n}" role="button" aria-label="BTN${n}"><rect x="${x - 18}" y="322" width="36" height="36" rx="4" fill="#0d0d0d"/><circle cx="${x}" cy="340" r="12" fill="#5a6070"/><text x="${x}" y="376" fill="var(--pcb-ink)" font-size="10" text-anchor="middle" font-family="Arial">BTN${n}</text></g>`; }
  return s + '</svg>';
}
function emuBar(compact) {
  return `<div class="strip">
    ${compact ? '' : `<span class="muted">${T('Model:')}</span><span class="chip">${T('Behavioral (RTL)')} ▾</span><span class="sep"></span>`}
    <button class="btn ${E.running ? '' : 'primary'}" data-act="emu:run">${I(E.running ? 'pause' : 'play')}${T(E.running ? 'Pause' : 'Run')}</button>
    <button class="btn" data-act="emu:step">${I('step')}${compact ? '' : T('Step')}</button>
    <button class="btn" data-act="emu:power">${I('restart')}${compact ? '' : T('Power cycle')}</button>
    ${compact ? '' : `<span class="sep"></span><span class="muted">${T('Clock:')}</span><span class="chip">${T('Real time')} ▾</span>`}
    <span class="muted mono" data-emustat style="font-size:12px"></span></div>`;
}
function watchPanel() {
  return `<div class="ph">${T('Watch')}</div><ul class="watch">${['state', 'pos', 'scoreL', 'scoreR', 'paused'].map(k => `<li><span>uut/${k}</span><span data-watch="${k}"></span></li>`).join('')}</ul>
    <div class="ph">${T('Timing generics')}</div><dl class="kv"><dt>TICK</dt><dd>6,250,000</dd><dt>STABLE</dt><dd>1,000,000</dd><dt>REFRESH</dt><dd>50,000</dd></dl>
    <p class="note">${S.lang === 'pt' ? 'Carregue em BTN0 para servir; BTN3 devolve a bola no LED 7; BTN1 ou BTN2: pausa. SW0: reset.' : 'Press BTN0 to serve; BTN3 sends the ball back at LED 7; BTN1 or BTN2: pause. SW0: reset.'}</p>`;
}

// tablet portrait: the board on top, what is watched below it (the width is the board's, the height is spare)
const stacked = () => `<div style="position:absolute;inset:0;display:grid;grid-template-rows:minmax(0,1fr) auto"><div class="boardwrap">${boardSvg()}</div><div style="border-top:1px solid var(--m-border)">${watchPanel()}</div></div>`;

// ------------------------------------------------------------------ shared views
function hierarchy() {
  const row = (cls, ico, name, badge, file) => `<li class="${cls}" data-act="${file ? 'file:' + file : ''}">${I(ico)}<span>${name}</span>${badge ? `<span class="badge">${badge}</span>` : ''}${file ? `<span class="muted">(${file})</span>` : ''}</li>`;
  return `<ul class="tree">
    <li class="grp">${T('Design')} · xc3s250e-4-cp132 · Basys2</li>
    ${row(S.file === 'pong.v' ? 'sel' : '', 'chip', '<b>pong</b>', 'Verilog', 'pong.v')}
    ${['dbR', 'dbL', 'db1', 'db2'].map(n => row('ind1', 'chip', `${n} - debounce`, 'Verilog', '')).join('')}
    ${row('ind1', 'chip', 'display - sevenseg', 'Verilog', '')}
    <li class="grp">${T('Test Benches')}</li>
    ${row(S.file === 'tb_pong.v' ? 'sel' : '', 'bench', 'tb_pong', 'Verilog', 'tb_pong.v')}
    <li class="grp">${T('Constraints')}</li>
    ${row(S.file === 'top.ucf' ? 'sel' : '', 'pin', 'top.ucf', 'UCF', 'top.ucf')}
  </ul>`;
}
function editorTabs() {
  return `<div class="doctabs">${Object.keys(FILES).map(f => `<button class="doctab" data-act="file:${f}" aria-current="${S.file === f}">${I('file')}${f}</button>`).join('')}</div>`;
}
function editorView() {
  const f = FILES[S.file], lines = f.text.split('\n');
  return `<div class="code"><div class="ln">${lines.map((_, i) => f.start + i).join('\n')}</div><div class="src">${lines.map((l, i) => i === 25 && S.file === 'pong.v' ? `<span class="cur">${highlight(l, f.lang)}</span>` : highlight(l, f.lang)).join('\n')}</div></div>`;
}
function simBar(compact) {
  return `<div class="strip">
    <button class="ibtn" title="${T('Restart')}">${I('restart')}</button>
    <button class="ibtn" title="${T('Run All')}">${I('play')}</button>
    ${compact ? '' : `<span class="muted">${T('Run for')}</span>`}<span class="timebox">8 us</span>
    <button class="ibtn" title="${T('Step')}">${I('step')}</button><span class="sep"></span>
    <button class="ibtn" title="Zoom In">${I('zin')}</button><button class="ibtn" title="Zoom Out">${I('zout')}</button><button class="ibtn" title="Zoom to Full View">${I('fit')}</button>
    ${compact ? '' : `<span class="sep"></span><span class="muted mono" style="font-size:12px">${T('Sim Time')}: 8,000,000 ps</span>`}</div>`;
}
function util(label, used, avail) {
  const p = Math.round(used / avail * 100);
  return `<div><div style="display:flex;justify-content:space-between;gap:8px"><span>${T(label)}</span><span class="mono">${used} / ${avail} · ${p}%</span></div><div class="bar"><i style="width:${Math.max(p, 2)}%"></i></div></div>`;
}
function summaryView(compact) {
  return `<div class="cards">
    <div class="card"><h4>${T('Device Utilization Summary')}</h4>${util('Slices', 243, 2448)}${util('LUTs', 484, 4896)}${util('Flip-flops', 226, 4896)}${util('Bonded IOBs', 27, 92)}</div>
    <div class="card link" data-act="place:timing"><h4>${T('Timing Constraints')}</h4><div class="big ok">${T('All constraints met')}</div><div>${T('Minimum period')}: <b class="mono">11.724 ns</b> (85.3 MHz)</div><div class="muted">PERIOD 20 ns on clk · slack 8.276 ns</div></div>
    <div class="card link" data-act="task:prog"><h4>${T('Programming File')}</h4><div class="big">pong.bit</div><div class="mono">165 KB · 3s250ecp132</div><div class="ok">${I('check')} ${T('up to date')}</div></div>
    ${compact ? '' : `<div class="card"><h4>${T('Detailed Reports')}</h4><table class="t"><tr><td>${T('Synthesis report')} (Yosys)</td><td class="ok">${T('Current')}</td></tr><tr><td>Placed Design (XDL)</td><td class="ok">${T('Current')}</td></tr><tr><td>Routed Design (XDL)</td><td class="ok">${T('Current')}</td></tr><tr><td data-act="place:timing" style="cursor:pointer;color:var(--m-accent)">${T('Timing report')}</td><td class="ok">${T('Current')}</td></tr></table></div>`}
  </div>`;
}
function timingView() {
  return `<div class="pad"><p class="h2">${T('Timing report')}</p><div class="code" style="border:1px solid var(--m-border);border-radius:8px"><div class="ln">1\n2\n3\n4\n5\n6\n7</div><div class="src">Timing constraint: PERIOD 20 ns on clk (TS_clk)
constraint PERIOD 20 ns on clk: met (period 11.724 ns, slack 8.276 ns)
clock $iopadmap$clk: minimum period 11.724 ns (85.3 MHz)
Placed 271 sites in 0.3 s (estimated critical path 10.9 ns)
Routed 632 nets (4217 PIPs, 14 passes) in 0.7 s
All signals are completely routed.
<span class="ok">All constraints were met.</span></div></div></div>`;
}
function implSteps() {
  const st = [['Synthesize - Yosys', '3.6 s', 0], ['Implement Design', '1.1 s', 0], ['Translate', '', 1], ['Map', '0.1 s', 1], ['Place & Route', '1.0 s', 1], ['Static Timing', '', 1], ['Generate Programming File', '', 0]];
  return `<ul class="steps">${st.map(([n, t, sub]) => `<li class="${sub ? 'sub' : ''}"><span class="ok">${I('check')}</span><span>${T(n)}</span><span class="t">${t}</span></li>`).join('')}</ul>
    <div class="pad" style="padding-top:4px"><button class="btn primary" style="width:100%;justify-content:center">${I('play')}${T('Run all steps')}</button></div>
    <div class="ph">${T('Constraints')}</div><ul class="tree"><li>${I('pin')}<span>top.ucf</span><span class="badge">UCF</span></li><li>${I('grid')}<span>${T('I/O Pin Planning')}</span></li></ul>`;
}
function programView(compact) {
  return `<div class="pad" style="display:grid;gap:14px;max-width:820px;margin:0 auto">
    <div class="card"><h4>${T('Board')}</h4><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><span class="dot ok"></span><b>Digilent Basys2</b><span class="muted">USB · WebUSB</span><span class="spacer"></span><span class="ok">${T('Connected')}</span></div></div>
    <div class="card"><h4>${T('Chain')}</h4><div class="chain"><div><div class="chip-ic"><span><small>XILINX</small>XCF02S</span></div><div class="chiplbl">pong_prom.bit · PROM</div></div><div class="wire"></div><div><div class="chip-ic sel"><span><small>XILINX</small>XC3S250E</span></div><div class="chiplbl">pong.bit · FPGA</div></div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn">${T('Initialize Chain (Scan)')}</button></div></div>
    <div class="card"><h4>${T('Configuration file')}</h4><div class="mono">build/pong.bit · 165 KB</div><div class="ok">${I('check')} ${T('up to date')} — ${T('Generate Programming File')}</div></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px">
      <div class="card"><button class="btn primary" style="justify-content:center">${I('prog')}${T('Program FPGA')}</button><span class="muted">${T('Loads the FPGA directly (volatile: lost at power-off).')}</span></div>
      <div class="card"><button class="btn" style="justify-content:center">${I('chip')}${T('Program PROM')}</button><span class="muted">${T('Stores the design in the flash: it starts at power-up (mode jumper on ROM, JP3).')}</span></div>
    </div></div>`;
}
function logLines(filter) {
  filter ??= TASK_SRC[S.task];
  return MSGS.filter(([s]) => filter === 'all' || s === filter).map(([s, l, txt]) => `<div><span class="src">${T(SRC[s])}</span><span class="${l === 'ok' ? 'ok' : l === 'cmd' ? 'cmd' : ''}">${esc(txt)}</span></div>`).join('');
}
function filters() {
  return `<div class="filters">${['all', 'check', 'sim', 'emu', 'synth', 'impl', 'prog'].map(f => `<button class="filt" data-act="filter:${f}" aria-pressed="${(S.filter ?? TASK_SRC[S.task]) === f}">${T(f === 'all' ? 'All' : SRC[f])}</button>`).join('')}</div>`;
}
function counts() { return `<span class="chip" title="${T('Errors')} / ${T('Warnings')}"><span class="dot ok"></span>0 ${T('Errors')} · 0 ${T('Warnings')}</span>`; }

// ------------------------------------------------------------------ direction A: task workspaces
function dirA(c) {
  const t = S.task, tab = c.tablet, u = ui(c.size);
  const defLeft = { edit: !tab, sim: c.size === 'desk' || c.size === 'laptop', emu: false, impl: !tab || c.size === 'tabl', prog: false }[t];
  const defRight = t === 'emu' && !tab;
  const left = u.left ?? defLeft, right = u.right ?? defRight, mc = u.mc ?? (c.size === 'desk' && (t === 'sim' || t === 'edit')), max = !!u.max;
  const overlay = tab && t !== 'impl' || c.size === 'tabp';
  const leftHas = t !== 'prog';
  const leftBody = { edit: `<div class="ph">${T('Design')}<span class="spacer"></span><button class="ibtn" title="${T('New Source…')}">${I('plus')}</button></div><div class="pbody">${hierarchy()}</div>`,
    sim: `<div class="pbody">${objectsList()}</div>`, emu: `<div class="ph">${T('Design')}</div><div class="pbody">${hierarchy()}</div>`,
    impl: `<div class="ph">${T('Steps')}</div><div class="pbody">${implSteps()}</div>` }[t] || '';
  const head = { edit: `${editorTabs()}<span class="spacer"></span><button class="btn">${I('check')}${T('Check')}</button>`,
    sim: `${simBar(c.size === 'tabp')}<span class="spacer"></span>`, emu: `${emuBar(tab)}<span class="spacer"></span>`,
    impl: `<div class="crumb"><b>${T(u.place === 'timing' ? 'Timing report' : 'Design Summary')}</b>${u.place === 'timing' ? `<button class="btn" data-act="place:">${T('Design Summary')}</button>` : ''}</div><span class="spacer"></span><button class="btn primary">${I('play')}${T('Implement')}</button>`,
    prog: `<div class="crumb"><b>iMPACT</b><span>— Digilent Basys2</span></div><span class="spacer"></span>` }[t];
  const body = { edit: editorView(), sim: wavesView(), emu: c.size === 'tabp' ? stacked() : `<div class="boardwrap">${boardSvg()}</div>`, impl: u.place === 'timing' ? timingView() : summaryView(c.size === 'tabp'), prog: programView() }[t];
  const tasks = TASKS.map(k => `<button data-act="task:${k}" aria-current="${t === k}">${I(TASK_ICON[k])}<span>${T(TASK_LABEL[k])}</span>${k === 'prog' ? '' : '<span class="dot ok"></span>'}</button>`).join('');
  const [lv, lt] = LAST[t];
  const showLeft = leftHas && left && !max;
  return `
  <header class="topbar"><span class="logo">S</span>${c.size === 'tabp' ? '' : '<span class="brand">Silinx</span>'}<span class="chip">pong</span>
    <span class="spacer"></span><nav class="tasks" aria-label="Tasks">${tasks}</nav><span class="spacer"></span>
    ${tab ? `<button class="ibtn" title="${T('Search commands and files…')}">${I('search')}</button>` : `<span class="search">${I('search')}<span>${T('Search commands and files…')}</span><kbd>Ctrl K</kbd></span>`}
  </header>
  <div class="body">
    ${leftHas && !max ? (showLeft ? '' : `<div class="rail"><button class="ibtn" data-act="toggle:left" title="${T('Show or hide the panel')}">${I(t === 'sim' ? 'list' : t === 'impl' ? 'impl' : 'panel')}</button></div>`) : '<div></div>'}
    ${showLeft && !overlay ? `<aside class="side">${leftBody}</aside>` : ''}
    <section class="main" style="grid-column:2">
      <div class="mainhead">${showLeft && !overlay ? `<button class="ibtn on" data-act="toggle:left" title="${T('Show or hide the panel')}">${I('panel')}</button>` : ''}${head}
        <button class="ibtn ${max ? 'on' : ''}" data-act="toggle:max" title="${T('Maximize')}">${I('max')}</button>
        ${t === 'emu' ? `<button class="ibtn ${right ? 'on' : ''}" data-act="toggle:right" title="${T('Show or hide the panel')}">${I('rpanel')}</button>` : ''}</div>
      <div class="mainbody">${body}</div>
    </section>
    ${t === 'emu' && right && !max ? `<aside class="side right ${tab ? 'overlay' : ''}">${watchPanel()}</aside>` : '<div></div>'}
    ${showLeft && overlay ? `<div class="scrim" data-act="toggle:left"></div><aside class="side overlay">${leftBody}</aside>` : ''}
  </div>
  <footer class="mc">
    <div class="mcbar"><button class="ibtn ${mc ? 'on' : ''}" data-act="toggle:mc" title="${T('Messages')}">${I('msg')}</button>
      ${mc ? filters() : `<span class="mclast"><span class="${lv === 'ok' ? 'ok' : ''}">${lv === 'ok' ? '✓' : '›'}</span> <span class="muted">${T(SRC[TASK_SRC[t]])}:</span> ${esc(lt)}</span>`}
      <span class="spacer"></span>${counts()}</div>
    ${mc ? `<div class="mclog">${logLines(S.filter)}</div><div class="cmdline"><span class="caret">›</span>${t === 'sim' ? 'ISim&gt; ' : ''}<span>${T('Type a command, a file or an ISim command')}</span></div>` : ''}
  </footer>
  <nav class="bottomtabs" aria-label="Tasks">${TASKS.map(k => `<button data-act="task:${k}" aria-current="${t === k}">${I(TASK_ICON[k])}<span>${T(TASK_LABEL[k])}</span></button>`).join('')}</nav>`;
}

// ------------------------------------------------------------------ direction B: the flow
const FLOW = [
  { task: 'edit', name: 'Design', st: 'ok', sub: 'pong.v · debounce.v · sevenseg.v', res: [['', 'Sources'], ['rtl', 'RTL schematic']], time: '' },
  { task: 'sim', name: 'Simulate', st: 'ok', sub: 'tb_pong.v · 8 us', res: [['', 'Waves'], ['tb', 'Test bench'], ['log', 'Log']], time: '' },
  { task: 'emu', name: 'Emulate', st: 'ok', sub: 'Basys2 · RTL', res: [['', 'Board (RTL)'], ['log', 'Log']], time: '' },
  { task: 'impl', name: 'Implement', st: 'ok', sub: 'top.ucf · xc3s250e-4-cp132', res: [['', 'Design Summary'], ['timing', 'Timing met'], ['log', 'Log']], time: '4.7 s' },
  { task: 'prog', name: 'Program', st: '', sub: 'pong.bit · 165 KB', res: [['', 'Chain'], ['log', 'Log']], time: '' },
];
function dirB(c) {
  const t = S.task, tab = c.tablet, u = ui(c.size), cur = FLOW.find(f => f.task === t);
  const defRail = c.size === 'desk' || (c.size === 'laptop' && (t === 'edit' || t === 'impl'));
  const rail = u.left ?? defRail, max = !!u.max, mc = u.mc ?? false;
  const place = u['place_' + t] || '';
  const stepRow = (f, i) => `<div class="step ${f.task === t ? 'sel' : ''}" data-act="task:${f.task}">
      <div class="stephead"><span class="num ${f.st}">${f.st === 'ok' ? '✓' : i + 1}</span><b>${T(f.name)}</b><span class="muted">${f.st === 'ok' ? T('done') : T('not run yet')}</span><span class="spacer"></span>${f.time ? `<span class="muted mono">${f.time}</span>` : ''}<button class="ibtn run" title="${T('Run')}">${I('play')}</button></div>
      <div class="muted" style="padding-left:28px">${f.sub}</div>
      <div class="res" style="padding-left:28px">${f.res.map(([k, n]) => `<span class="rchip ${f.task === t && place === k ? 'sel' : ''}" data-act="place:${f.task}:${k}">${T(n)}</span>`).join('')}</div>
      ${f.task === 'edit' && f.task === t ? `<div style="margin:4px -12px -10px">${hierarchy()}</div>` : ''}
      ${f.task === 'impl' && f.task === t ? `<div style="margin:4px -12px -10px">${implSteps()}</div>` : ''}
    </div>`;
  const railFull = `<aside class="side flow"><div class="ph">${S.lang === 'pt' ? 'Fluxo de projeto' : 'Design flow'}<span class="spacer"></span><button class="ibtn" data-act="toggle:left" title="${T('Show or hide the panel')}">${I('panel')}</button></div><div class="pbody" style="padding:0">${FLOW.map(stepRow).join('')}</div></aside>`;
  const railMini = `<div class="rail minirail"><button class="ibtn" data-act="toggle:left" title="${T('Show or hide the panel')}">${I('panel')}</button>${FLOW.map((f, i) => `${i ? '<span class="line"></span>' : ''}<button class="mstep ${f.st} ${f.task === t ? 'sel' : ''}" data-act="task:${f.task}" title="${T(f.name)}">${f.st === 'ok' && f.task !== t ? '✓' : i + 1}</button>`).join('')}</div>`;
  let view, tools = '';
  if (place === 'log') view = `<div class="mclog" style="height:auto;border:0">${logLines(TASK_SRC[t] === 'impl' ? 'impl' : TASK_SRC[t])}</div>`;
  else if (t === 'edit') { view = place === 'rtl' ? `<div class="pad muted">${T('RTL schematic')} — pong (dbR, dbL, db1, db2, display)</div>` : editorView(); tools = place === 'rtl' ? '' : `${editorTabs()}<span class="spacer"></span><button class="btn">${I('check')}${T('Check')}</button>`; }
  else if (t === 'sim') { view = place === 'tb' ? (S.file = 'tb_pong.v', editorView()) : wavesView(); tools = place === 'tb' ? '' : simBar(c.size === 'tabp'); }
  else if (t === 'emu') { view = `<div class="boardwrap">${boardSvg()}</div>`; tools = emuBar(tab); }
  else if (t === 'impl') view = place === 'timing' ? timingView() : summaryView(c.size === 'tabp');
  else view = programView();
  const placeName = cur.res.find(([k]) => k === place)?.[1] || cur.res[0][1];
  const flowtop = `<nav class="flowtop">${FLOW.map((f, i) => `<button data-act="task:${f.task}" aria-current="${f.task === t}"><span class="dot ${f.st}"></span>${i + 1} ${T(f.name)}</button>`).join('')}</nav>`;
  const watch = t === 'emu' && c.size === 'desk' && !max ? `<aside class="side right">${watchPanel()}</aside>` : '<div></div>';
  return `
  <header class="topbar"><span class="logo">S</span>${c.size === 'tabp' ? '' : '<span class="brand">Silinx</span>'}<span class="chip">pong</span>
    <div class="crumb" style="margin-left:6px">${I(TASK_ICON[t])}<b>${T(cur.name)}</b><span>▸</span><span>${T(placeName)}</span></div><span class="spacer"></span>
    ${tab ? `<button class="ibtn">${I('search')}</button>` : `<span class="search">${I('search')}<span>${T('Search commands and files…')}</span><kbd>Ctrl K</kbd></span>`}
  </header>
  ${c.size === 'tabp' ? flowtop : ''}
  <div class="body">
    ${c.size === 'tabp' || max ? '<div></div>' : rail ? '' : railMini}
    ${c.size !== 'tabp' && rail && !max ? (tab ? `<div></div><div class="scrim" data-act="toggle:left"></div>${railFull.replace('side flow', 'side flow overlay')}` : railFull) : ''}
    <section class="main" style="grid-column:2">
      <div class="mainhead"><div class="res" style="grid-column:auto;flex:none">${cur.res.map(([k, n]) => `<span class="rchip ${place === k ? 'sel' : ''}" data-act="place:${t}:${k}">${T(n)}</span>`).join('')}</div><span class="sep"></span>${tools}<span class="spacer"></span>
        <button class="ibtn ${max ? 'on' : ''}" data-act="toggle:max" title="${T('Maximize')}">${I('max')}</button></div>
      <div class="mainbody">${view}</div>
    </section>
    ${watch}
  </div>
  <footer class="mc">
    <div class="mcbar"><button class="ibtn ${mc ? 'on' : ''}" data-act="toggle:mc" title="${T('Messages')}">${I('msg')}</button>${mc ? filters() : `<span class="mclast"><span class="ok">✓</span> ${esc(LAST[t][1])}</span>`}<span class="spacer"></span>${counts()}</div>
    ${mc ? `<div class="mclog">${logLines(S.filter)}</div><div class="cmdline"><span class="caret">›</span>${T('Type a command, a file or an ISim command')}</div>` : ''}
  </footer>`;
}

// ------------------------------------------------------------------ direction C: stage and dock
function dirC(c) {
  const t = S.task, tab = c.tablet, u = ui(c.size);
  const defTab = { edit: 'design', sim: 'signals', emu: 'watch', impl: 'reports', prog: 'messages' }[t];
  const dtab = u.dock ?? defTab, max = !!u.max;
  const dockOpen = u.right ?? (!tab || c.size === 'tabl' && t === 'edit' || c.size === 'tabp' && (t === 'emu' || t === 'sim'));
  const ctxTab = t === 'sim' ? ['signals', 'Signals'] : t === 'emu' ? ['watch', 'Watch'] : null;
  const tabs = [['design', 'Design'], ...(ctxTab ? [ctxTab] : []), ['reports', 'Reports'], ['messages', 'Messages']];
  const dockBody = { design: `<div class="pbody">${hierarchy()}</div>`, signals: objectsList(), watch: watchPanel(), reports: `<div class="pbody">${implSteps()}</div>`,
    messages: `<div style="padding:6px 8px;border-bottom:1px solid var(--m-border)">${filters()}</div><div class="mclog">${logLines(S.filter)}</div>` }[dtab] || '';
  const docs = { edit: [['pong.v', 'file'], ['tb_pong.v', 'file']], sim: [['ISim (tb_pong)', 'sim'], ['pong.v', 'file']], emu: [['Board Emulator (pong)', 'emu'], ['pong.v', 'file']], impl: [['Design Summary', 'impl'], ['pong.v', 'file']], prog: [['iMPACT', 'prog'], ['Design Summary', 'impl']] }[t];
  const view = { edit: editorView(), sim: wavesView(), emu: `<div class="boardwrap">${boardSvg()}</div>`, impl: u.place === 'timing' ? timingView() : summaryView(c.size === 'tabp'), prog: programView() }[t];
  const tools = { edit: `<button class="btn">${I('check')}${T('Check')}</button>`, sim: simBar(c.size === 'tabp'), emu: emuBar(tab), impl: '', prog: '' }[t];
  const quick = TASKS.filter(k => k !== 'edit').map(k => `<button class="${t === k ? 'btn primary' : 'btn'}" data-act="task:${k}" title="${T(TASK_LABEL[k])}">${I(TASK_ICON[k])}${c.size === 'desk' || c.size === 'laptop' ? T(TASK_LABEL[k]) : ''}</button>`).join('');
  const dockTabs = `<div class="docktabs">${tabs.map(([k, n]) => `<button data-act="dock:${k}" aria-current="${dtab === k}">${T(n)}${k === 'messages' ? ` <span class="count">${MSGS.length}</span>` : ''}</button>`).join('')}</div>`;
  const sheet = c.size === 'tabp';
  const toast = t === 'impl' || t === 'prog' ? `<div class="toast"><span class="ok">${I('check')}</span><span>${esc(LAST[t][1])}</span><button class="ibtn" data-act="dock:messages">${T('Log')}</button></div>` : '';
  return `
  <header class="topbar"><span class="logo">S</span>${c.size === 'tabp' ? '' : '<span class="brand">Silinx</span>'}<span class="chip">pong</span><span class="spacer"></span>
    <label class="cmdbar"><span class="caret">›</span><span>${t === 'sim' ? 'run 8 us' : T('Type a command, a file or an ISim command')}</span>${tab ? '' : '<span class="spacer"></span><kbd>Ctrl K</kbd>'}</label><span class="spacer"></span>
    ${c.size === 'tabp' ? '' : quick}
    <button class="ibtn ${dockOpen && !max ? 'on' : ''}" data-act="toggle:right" title="${T('Show or hide the panel')}">${I('rpanel')}</button>
  </header>
  <div class="body">
    <div></div>
    <section class="main" style="grid-column:2">
      <div class="mainhead"><div class="doctabs">${docs.map(([n, k], i) => `<button class="doctab" aria-current="${i === 0}">${I(k)}${n}</button>`).join('')}</div><span class="sep"></span>${tools}<span class="spacer"></span>
        ${c.size === 'desk' || c.size === 'laptop' ? `<button class="ibtn" title="${T('Open in a window')}">${I('pop')}</button>` : ''}<button class="ibtn ${max ? 'on' : ''}" data-act="toggle:max" title="${T('Maximize')}">${I('max')}</button></div>
      <div class="mainbody">${view}${toast}</div>
    </section>
    ${dockOpen && !max && !sheet ? (tab && t !== 'edit' ? `<div class="scrim" data-act="toggle:right"></div><aside class="dock side right overlay">${dockTabs}<div class="dockbody">${dockBody}</div></aside>` : `<aside class="dock">${dockTabs}<div class="dockbody">${dockBody}</div></aside>`) : '<div></div>'}
    ${sheet && !max ? (dockOpen ? `<aside class="sheet"><div class="grab" data-act="toggle:right"></div>${dockTabs}<div class="dockbody">${dockBody}</div></aside>` : '') : ''}
  </div>
  ${sheet && !max && !dockOpen ? `<footer class="mc"><div class="mcbar" data-act="toggle:right" style="cursor:pointer"><span class="grab" style="margin:0 8px 0 0;width:28px"></span>${tabs.map(([k, n]) => `<button class="filt" data-act="dock:${k}">${T(n)}</button>`).join('')}<span class="spacer"></span>${counts()}</div></footer>`
    : `<div class="status"><span>${T('Ready')}</span><span class="spacer"></span><span>xc3s250e-4-cp132 · basys2</span></div>`}
  ${c.size === 'tabp' ? `<nav class="bottomtabs" style="display:flex;justify-content:space-around;border-top:1px solid var(--m-border);background:var(--m-surface);padding:4px 0 6px">${TASKS.map(k => `<button data-act="task:${k}" aria-current="${t === k}">${I(TASK_ICON[k])}<span>${T(TASK_LABEL[k])}</span></button>`).join('')}</nav>` : ''}`;
}

// ------------------------------------------------------------------ the viewer
const $ = s => document.querySelector(s);
function frame(size) {
  const z = SIZES[size], c = { size, tablet: z.tablet };
  const saveFile = S.file;
  const inner = { a: dirA, b: dirB, c: dirC }[S.dir](c);
  S.file = saveFile;
  const rows = S.dir === 'c' && size === 'tabp' ? 'grid-template-rows:auto minmax(0,1fr) auto auto' : '';
  return `<figure class="v-shot" data-shot="${size}"><div class="fit" data-w="${z.w}" data-h="${z.h}" data-b="${z.tablet ? 16 : 10}">
    <div class="device ${z.tablet ? 'tablet' : ''}" style="width:${z.w}px;height:${z.h}px"><div class="app s-${size} dir-${S.dir} task-${S.task}" data-size="${size}" style="${rows}">${inner}</div></div></div>
    <figcaption>${S.lang === 'pt' ? z.pt : z.label} · ${z.w} × ${z.h}${z.tablet ? (S.lang === 'pt' ? ' · toque' : ' · touch') : ''}</figcaption></figure>`;
}
function seg(id, items, cur) {
  return `<div class="v-seg" role="group" id="${id}">${items.map(([k, label, small]) => `<button type="button" data-v="${id}:${k}" aria-pressed="${cur === k}">${label}${small ? `<small>${small}</small>` : ''}</button>`).join('')}</div>`;
}
function render() {
  const pt = S.lang === 'pt';
  $('#v-controls').innerHTML = `
    <div class="v-group"><span class="v-label">${pt ? 'Direção' : 'Direction'}</span>${seg('dir', Object.entries(DIRS).map(([k, d]) => [k, `${k.toUpperCase()} · ${pt ? d.pt : d.name}`]), S.dir)}</div>
    <div class="v-group"><span class="v-label">${pt ? 'Tarefa' : 'Task'}</span>${seg('task', TASKS.map(k => [k, T(TASK_LABEL[k])]), S.task)}</div>
    <div class="v-group"><span class="v-label">${pt ? 'Ecrã' : 'Screen'}</span>${seg('size', [...Object.entries(SIZES).map(([k, z]) => [k, pt ? z.pt : z.label, `${z.w}×${z.h}`]), ['all', pt ? 'Os quatro' : 'All four']], S.size)}</div>
    <div class="v-group"><span class="v-label">${pt ? 'Língua' : 'Language'}</span>${seg('lang', [['en', 'English'], ['pt', 'Português']], S.lang)}</div>
    ${S.size === 'all' ? '' : `<div class="v-group">${seg('actual', [['fit', pt ? 'Ajustar' : 'Fit'], ['actual', '100%']], S.actual ? 'actual' : 'fit')}</div>`}`;
  const d = DIRS[S.dir];
  $('#v-note').innerHTML = `<p><strong>${S.dir.toUpperCase()} · ${pt ? d.pt : d.name}.</strong> ${d.note}</p><p class="v-hint">${pt
    ? 'Clique nos botões da maqueta: tarefas, painéis (mostrar, esconder, maximizar), filtros das mensagens, os botões e interruptores da placa, o cursor das ondas. As legendas em português mostram onde o texto cresce.'
    : 'Click inside the mock-up: the tasks, the panels (show, hide, maximize), the message filters, the board\'s buttons and switches, the wave cursor. Português shows where the labels grow.'}</p>`;
  const desk = $('#v-desk');
  desk.className = 'v-desk' + (S.size === 'all' ? ' all' : '') + (S.actual && S.size !== 'all' ? ' actual' : '');
  desk.innerHTML = S.size === 'all' ? Object.keys(SIZES).map(frame).join('') : frame(S.size);
  fit();
  document.querySelectorAll('.wplot').forEach(drawWaves);
  document.querySelectorAll('.mclog').forEach(l => { l.scrollTop = l.scrollHeight; });
  paintBoards();
  try { history.replaceState(null, '', `#${S.dir}-${S.task}-${S.size}${S.lang === 'pt' ? '-pt' : ''}`); } catch (e) {}
}
function fit() {
  const desk = $('#v-desk'), dw = desk.clientWidth - 4, cols = S.size === 'all' && dw >= 900 ? 2 : 1;
  desk.querySelectorAll('.fit').forEach(f => {
    const w = +f.dataset.w, h = +f.dataset.h, b = +f.dataset.b, W = w + 2 * b, H = h + 2 * b;
    let s = 1;
    if (S.size === 'all') s = Math.min(1, (dw - (cols - 1) * 22) / cols / W, (h > w ? 900 : 640) / H);
    else if (!S.actual) s = Math.min(1, dw / W, Math.max(420, window.innerHeight - 40) / H);
    f.style.width = W * s + 'px'; f.style.height = H * s + 'px';
    f.querySelector('.device').style.transform = `scale(${s})`;
  });
}

function act(a, el, ev) {
  const [k, v, w] = a.split(':'), size = el.closest('.app')?.dataset.size, u = size && ui(size);
  if (k === 'task') { S.task = v; S.filter = null; if (S.dir === 'b' && v !== 'edit') S.file = 'pong.v'; }
  else if (k === 'toggle') {
    const app = el.closest('.app');
    if (v === 'left') u.left = !(app.querySelector('aside.side:not(.right), aside.flow'));
    else if (v === 'right') u.right = !(app.querySelector('aside.side.right, aside.dock, aside.sheet'));
    else if (v === 'mc') u.mc = !app.querySelector('footer.mc .mclog');
    else if (v === 'max') u.max = !u.max;
  }
  else if (k === 'filter') S.filter = v;
  else if (k === 'dock') { u.dock = v; u.right = true; }
  else if (k === 'file') { if (!v) return; S.file = v; S.task = 'edit'; }
  else if (k === 'place') { if (w !== undefined) { u['place_' + v] = w; S.task = v; } else if (S.dir === 'b') u['place_' + S.task] = v; else u.place = v; }
  else if (k === 'btn') { emuPress(+v); paintBoards(); return; }
  else if (k === 'sw') { E.sw[+v] ^= 1; paintBoards(); return; }
  else if (k === 'emu') { if (v === 'run') E.running = !E.running; if (v === 'step') { const r = E.running; E.running = true; emuTick(); E.running = r; return; } if (v === 'power') Object.assign(E, { state: 'SERVE', server: 0, pos: 0, sL: 0, sR: 0, paused: false, cycles: 0 }); }
  else if (k === 'cursor') { const r = el.getBoundingClientRect(); S.cursor = Math.max(0, Math.min(SPAN, Math.round((ev.clientX - r.left) / r.width * SPAN / 20) * 20)); }
  render();
}
document.addEventListener('click', ev => {
  const v = ev.target.closest('[data-v]');
  if (v) {
    const [g, k] = v.dataset.v.split(':');
    if (g === 'dir') { S.dir = k; reset(); } else if (g === 'task') { S.task = k; S.filter = null; } else if (g === 'size') S.size = k; else if (g === 'lang') S.lang = k; else if (g === 'actual') S.actual = k === 'actual';
    document.documentElement.lang = S.lang;
    return render();
  }
  const a = ev.target.closest('.app [data-act]');
  if (a && a.dataset.act) act(a.dataset.act, a, ev);
});
document.addEventListener('dblclick', ev => { if (ev.target.closest('.board-btn, .board-sw, button')) return; const m = ev.target.closest('.app .mainbody'); if (m) act('toggle:max', m, ev); });
let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(render, 120); });
// a view's link: #<direction>-<task>-<screen>[-pt], e.g. #b-sim-tabp
function fromHash() {
  const m = /^#([abc])-(edit|sim|emu|impl|prog)-(desk|laptop|tabl|tabp|all)(-pt)?$/.exec(location.hash || '');
  if (!m) return false;
  if (m[1] !== S.dir) reset();
  S.dir = m[1]; S.task = m[2]; S.size = m[3]; S.lang = m[4] ? 'pt' : 'en';
  return true;
}
window.addEventListener('hashchange', () => { if (fromHash()) render(); });
fromHash();
render();
setInterval(emuTick, 320);
