// Portuguese texts of the schematic editor (web/js/sch-editor.js) and of its read-only views, the RTL
// and Technology Schematics (#130): the symbol palette and its tooltips (the descriptions of
// core/schdoc.js SYMBOLS), the properties panel, the status bar; merged into web/js/i18n.js.
export const SCH_PT = {
  // Rename… of the right-click menu (#1546)
  'Rename Instance': 'Mudar o Nome da Instância', 'Rename I/O Marker': 'Mudar o Nome do Marcador de E/S', 'Rename Net Name': 'Mudar o Nome da Rede',
  'Type a name.': 'Escreva um nome.', 'Duplicate': 'Duplicar',
  // a module's symbol out of date (#1183)
  'Update Symbol': 'Atualizar Símbolo',
  // palette
  'Symbols': 'Símbolos', 'Categories': 'Categorias', '<--All Symbols-->': '<--Todos os Símbolos-->',
  'No other modules in the project': 'Nenhum outro módulo no projeto',
  // the descriptions of the symbols (palette tooltips); gates in SCH_PT_PATTERNS
  'Inverter': 'Inversor',
  '2:1 multiplexer (O = S0 ? D1 : D0)': 'Multiplexador 2:1 (O = S0 ? D1 : D0)',
  'Adder S = A + B (+ CI), optional carry out': 'Somador S = A + B (+ CI), transporte de saída opcional',
  'Comparator O = A <op> B': 'Comparador O = A <op> B',
  'Comparator O = A <op> B, or several comparisons at once (EQ, NE, LT, LE, GT, GE)': 'Comparador O = A <op> B, ou várias comparações ao mesmo tempo (EQ, NE, LT, LE, GT, GE)',
  // a COMP's comparisons, a tick box each (#1555)
  'Comparisons': 'Comparações', 'At least one comparison stays ticked': 'Pelo menos uma comparação fica marcada',
  'Remove connected outputs': 'Remover saídas ligadas', 'Remove the outputs and their wires': 'Remover as saídas e os seus fios',
  'Constant value (decimal, 0x.. hex or 0b.. binary)': 'Valor constante (decimal, 0x.. hexadecimal ou 0b.. binário)',
  'Logic 1 (all bits)': '1 lógico (todos os bits)', 'Logic 0 (all bits)': '0 lógico (todos os bits)',
  'N-bit register': 'Registo de N bits', 'N-bit binary counter': 'Contador binário de N bits',
  'Select bits I(msb downto lsb) of a bus': 'Seleciona os bits I(msb downto lsb) de um barramento',
  'Concatenate inputs (I0 is the most significant part)': 'Concatena as entradas (I0 é a parte mais significativa)',
  'Instance of a project module/entity': 'Instância de um módulo/entidade do projeto',
  'Box with explicit pins carrying HDL statements emitted verbatim': 'Caixa com pinos explícitos e instruções HDL copiadas tal e qual',
  // parameters of the symbols (as in the Symbol Info datasheets, core/symdocs.js) and their options
  'for a Width of 2 or more': 'para uma Largura de 2 ou mais',   // (Pins per bit at Width 1, #2076)
  'Pins per bit (I0_0.., O0..)': 'Um pino por bit (I0_0.., O0..)',   // (a gate a bit, #2079)
  'Pins per bit (A0.., B0.., S0..)': 'Um pino por bit (A0.., B0.., S0..)', 'Pins per bit (A0.., B0..)': 'Um pino por bit (A0.., B0..)', 'Pins per bit (Q0..)': 'Um pino por bit (Q0..)', 'Pins per bit (A0.., B0.., D0..)': 'Um pino por bit (A0.., B0.., D0..)', 'Borrow in (BI)': 'Empréstimo de entrada (BI)', 'Borrow out (BO)': 'Empréstimo de saída (BO)',
  'Subtractor D = A - B (- BI), optional borrow out': 'Subtrator D = A - B (- BI), empréstimo de saída opcional',
  'Carry in': 'Transporte de entrada (carry in)', 'Carry out': 'Transporte de saída (carry out)', 'Operation': 'Operação', 'Signed': 'Com sinal',
  'Clock enable': 'Habilitação do relógio', 'Reset/INIT value': 'Valor de reset/INIT', 'MSB index': 'Índice do MSB', 'LSB index': 'Índice do LSB',
  'Input widths (MSB first)': 'Larguras das entradas (MSB primeiro)',
  'none': 'nenhum', 'async': 'assíncrono', 'sync': 'síncrono', 'up': 'crescente', 'down': 'decrescente',
  // properties panel
  'Properties': 'Propriedades', 'Parameters': 'Parâmetros', 'empty = module default': 'vazio = valor por omissão do módulo',
  'Names': 'Nomes', 'Clock enable (CE)': 'Habilitação do relógio (CE)', 'Asynchronous clear (CLR)': 'Limpeza assíncrona (CLR)', 'Asynchronous preset (PRE)': 'Preset assíncrono (PRE)', 'Synchronous reset (R)': 'Reset síncrono (R)', 'Synchronous set (S)': 'Set síncrono (S)', 'not with the other inputs chosen (no such Xilinx flip-flop)': 'não com as outras entradas escolhidas (não há esse flip-flop Xilinx)', 'Show the name of every instance and every net (the automatic ones too)': 'Mostrar o nome de todas as instâncias e de todas as redes (também os automáticos)',
  // a net name another net has (#689)
  'Hop-overs': 'Saltos', 'Draw a small arc where two wires cross without connecting': 'Desenhar um pequeno arco onde dois fios se cruzam sem se ligarem',
  // Rearrange Wires / Rearrange Schematic (#1481's Beautify, #1506, #1730)
  'Rearrange Wires': 'Reorganizar fios', 'Rearrange Schematic': 'Reorganizar esquemático',
  'Rearrange Wires: draw the wires again with few bends and crossings, the symbols, I/O markers and net names where they are; with a selection, only its wires. The connections stay the same':
    'Reorganizar fios: desenhar de novo os fios com poucas dobras e cruzamentos, os símbolos, marcadores de E/S e nomes de rede onde estão; com uma seleção, só os seus fios. As ligações ficam iguais',
  'Rearrange Schematic: lay the whole schematic out again, easier to read (the inputs on the left, the outputs on the right, the symbols moved in the order of the signals, the wires with few bends and crossings). The connections stay the same':
    'Reorganizar esquemático: dispor de novo todo o esquemático, mais fácil de ler (as entradas à esquerda, as saídas à direita, os símbolos deslocados pela ordem dos sinais, os fios com poucas dobras e cruzamentos). As ligações ficam iguais',
  'Rearrange Schematic: the schematic laid out again': 'Reorganizar esquemático: esquemático disposto de novo',
  'Rearrange Schematic: the schematic is already laid out this way': 'Reorganizar esquemático: o esquemático já está disposto assim',
  'Rearrange Wires: no wire in the selection': 'Reorganizar fios: nenhum fio na seleção',
  'Rearrange Wires: the wires are already as clear as they can be': 'Reorganizar fios: os fios já estão tão claros quanto possível',
  'Rearrange Schematic: the symbols kept where they were; the wires are already as clear as they can be': 'Reorganizar esquemático: os símbolos ficaram onde estavam; os fios já estão tão claros quanto possível',
  // curved wires (#1144)
  'Curved wires': 'Fios curvos',
  'Draw the wires as smooth curves of any shape instead of the technical drawing\'s square corners (the connections, the nets and the HDL the same)': 'Desenhar os fios como curvas suaves de qualquer forma em vez dos cantos retos do desenho técnico (as ligações, as redes e o HDL iguais)',
  'Curved wires: click a wire, then drag the wire or its handles to reshape it (double-click a handle to remove it). Drag a symbol to move it, its wires following.':
    'Fios curvos: clique num fio e arraste o fio ou as suas pegas para lhe mudar a forma (duplo clique numa pega remove-a). Arraste um símbolo para o mover, os seus fios acompanham-no.',
  'Add Wire (curved): click to start, click to add points the curve passes through, click on a pin/wire or double-click to finish; or draw a stroke of any shape from a pin/wire to another.':
    'Adicionar Fio (curvo): clique para começar, clique para juntar pontos por onde a curva passa, clique num pino/fio ou faça duplo clique para terminar; ou desenhe um traço de qualquer forma de um pino/fio até outro.',
  'Reset curve': 'Repor curva', 'Drop this wire\'s own curve: drawn again from its rectilinear path': 'Descartar a curva própria deste fio: desenhado de novo a partir do seu percurso retilíneo',
  'Net name already used': 'Nome de rede já usado', 'Connect by name': 'Ligar pelo nome',
  'Connect this net to it by name? They become one net, without a wire drawn between them.': 'Ligar esta rede a ela pelo nome? Passam a ser uma só rede, sem um fio desenhado entre elas.',
  'Rotate': 'Rodar', 'Mirror': 'Espelhar', 'Wire': 'Fio', 'I/O Marker': 'Marcador de E/S', 'Net Name': 'Nome de Rede',
  'Bidirectional': 'Bidirecional',
  // several objects selected: a property whose value differs between them (#1471)
  '(mixed)': '(vários)',
  // the Add I/O Marker tool: on a wire, a pin or empty space (#680)
  'Add I/O Marker: click a wire end, a pin or empty space to add a port marker (a wire to its tip connects it later).':
    'Adicionar Marcador de E/S: clique na ponta de um fio, num pino ou num espaço vazio para adicionar um marcador de porto (um fio até à sua ponta liga-o depois).',
  'Input port name': 'Nome do porto de entrada', 'Output port name': 'Nome do porto de saída', 'Bidirectional port name': 'Nome do porto bidirecional',
  'optional, overrides the type derived from the width': 'opcional, substitui o tipo derivado da largura',
  'one per line: name[width] (add "clock" for a clock pin)': 'um por linha: nome[largura] (acrescente "clock" para um pino de relógio)',
  'name[width], add "reg" if assigned in always/initial': 'nome[largura], acrescente "reg" se atribuído em always/initial',
  'name[width]': 'nome[largura]',
  'No errors or warnings found.': 'Nenhum erro ou aviso encontrado.',
  // the device primitives (#791, core/primitives.js): their descriptions and parameters (their attributes: the
  // UNISIM names, the same in Portuguese)
  'Block RAM 16 Kbit + parity, single port (RAMB16_S1 … RAMB16_S36)': 'RAM de bloco de 16 Kbit + paridade, um porto (RAMB16_S1 … RAMB16_S36)',
  'Block RAM 16 Kbit + parity, dual port (RAMB16_S1_S1 … RAMB16_S36_S36)': 'RAM de bloco de 16 Kbit + paridade, duplo porto (RAMB16_S1_S1 … RAMB16_S36_S36)',
  '18 × 18 signed multiplier with optional input and output registers': 'Multiplicador de 18 × 18 com sinal, com registos opcionais nas entradas e na saída',
  'Digital clock manager: clocks of the input\'s frequency, its double, a division and a synthesized frequency': 'Gestor digital de relógio: relógios com a frequência da entrada, o seu dobro, uma divisão e uma frequência sintetizada',
  'Global clock buffer: a clock onto the global clock network': 'Buffer global de relógio: um relógio na rede global de relógio',
  'Global clock buffer that chooses between two clocks': 'Buffer global de relógio que escolhe entre dois relógios',
  'Input buffer of a global clock pin': 'Buffer de entrada de um pino de relógio global',
  'Block RAM 9 Kbit (half of an 18 Kbit block), true or simple dual port': 'RAM de bloco de 9 Kbit (metade de um bloco de 18 Kbit), duplo porto verdadeiro ou simples',
  'Block RAM 18 Kbit, true dual port': 'RAM de bloco de 18 Kbit, duplo porto verdadeiro',
  'DSP slice: pre-adder, 18 × 18 multiplier and 48-bit post-adder / accumulator': 'Slice DSP: pré-somador, multiplicador de 18 × 18 e pós-somador / acumulador de 48 bits',
  'Phase-locked loop: up to six clocks of the VCO\'s frequency divided': 'Anel de captura de fase (PLL): até seis relógios com a frequência do VCO dividida',
  'I/O clock buffer: a clock pin\'s clock to the I/O and to a PLL / DCM, optionally divided': 'Buffer de relógio de E/S: o relógio de um pino de relógio para as E/S e para uma PLL / um DCM, dividido ou não',
  'Port width': 'Largura do porto', 'Port A width': 'Largura do porto A', 'Port B width': 'Largura do porto B',
  'Contents (hex words from address 0)': 'Conteúdo (palavras hexadecimais a partir do endereço 0)',
  'No device primitives for this device\'s family': 'Nenhuma primitiva para a família deste dispositivo',
};

export const SCH_PT_PATTERNS = [
  // a COMP's connected output unticked (#1555)
  [/^Unticking (\w+) removes the output \1 of (.+) and the wires connected to it\.$/, 'Desmarcar $1 remove a saída $1 de $2 e os fios ligados a ela.'],
  // a name refused by Rename… (core/schname.js, #1546)
  [/^'(.*)' is not a valid name: use a letter, then letters, digits and single _ \(not at the end\)\.$/, "'$1' não é um nome válido: use uma letra, seguida de letras, dígitos e _ simples (não no fim)."],
  [/^'(.*)' is already the name of (another instance|an instance|another I\/O marker|an I\/O marker): choose another name\.$/, (m, n, w) =>
    `'${n}' já é o nome de ${{ 'another instance': 'outra instância', 'an instance': 'uma instância', 'another I/O marker': 'outro marcador de E/S', 'an I/O marker': 'um marcador de E/S' }[w]}: escolha outro nome.`],
  // a net connected by name renamed as a whole (#734)
  [/^Renamed to '(.+)' with the net: (.+)$/, (m, n, parts) => `Mudado para '${n}' com a rede: ${parts.split(' and ').map(p => {
    let k;
    if ((k = /^(\d+) other net names?$/.exec(p))) return +k[1] > 1 ? `${k[1]} outros nomes de rede` : 'outro nome de rede';
    if ((k = /^the I\/O marker '(.+)' \(a port of the module\)$/.exec(p))) return `o marcador de E/S '${k[1]}' (um porto do módulo)`;
    return p;
  }).join(' e ')}`],
  [/^Another net is already named '(.*)'\.$/, "Já há outra rede chamada '$1'."],
  // a bus tap's MSB below its LSB refused (#1815)
  [/^A bus tap takes the bits MSB downto LSB: its MSB \((\d+)\) cannot be below its LSB \((\d+)\)$/, 'Um bus tap tira os bits MSB downto LSB: o seu MSB ($1) não pode ser menor que o seu LSB ($2)'],
  [/^A bus tap takes the bits MSB downto LSB: its LSB \((\d+)\) cannot be above its MSB \((\d+)\)$/, 'Um bus tap tira os bits MSB downto LSB: o seu LSB ($1) não pode ser maior que o seu MSB ($2)'],
  [/^Rearrange Wires: (\d+) wires? drawn again$/, (m, n) => `Reorganizar fios: ${n} fio${n === '1' ? '' : 's'} desenhado${n === '1' ? '' : 's'} de novo`],
  [/^Rearrange Schematic: the symbols kept where they were; (\d+) wires? drawn again$/, (m, n) => `Reorganizar esquemático: os símbolos ficaram onde estavam; ${n} fio${n === '1' ? '' : 's'} desenhado${n === '1' ? '' : 's'} de novo`],
  // a wire, a move or a paste between two named nets refused, as in ISE (#754, #806)
  [/^(The wire|The move|Pasting|Duplicating) would short net '(.+)' and net '(.+)': two named nets cannot be joined\. Rename one of them first \(the same name connects them\)\.$/,
    (m, what, a, b) => `${{ 'The wire': 'O fio', 'The move': 'A deslocação', Pasting: 'Colar', Duplicating: 'Duplicar' }[what]} poria em curto a rede '${a}' e a rede '${b}': duas redes com nome não podem ser unidas. Mude primeiro o nome de uma delas (o mesmo nome liga-as).`],
  // the multiplexers and demultiplexers, with and without the enable E (#301)
  [/^(\d+):1 multiplexer \(select ([S\d ]+)\)$/, 'Multiplexador $1:1 (seleção $2)'],
  [/^(\d+):1 multiplexer with enable \(Xilinx (\w+)\): O = (.+) when E = 1, 0 when E = 0$/, 'Multiplexador $1:1 com habilitação (Xilinx $2): O = $3 quando E = 1, 0 quando E = 0'],
  [/^1:(\d+) demultiplexer( with enable)? \(select ([S\d ]+)\): O<S> = D( when E = 1)?, the other outputs 0( \(all 0 when E = 0\))? \(bitwise when Width > 1\)$/,
    (m, n, en, sel, w, all) => `Desmultiplexador 1:${n}${en ? ' com habilitação' : ''} (seleção ${sel}): O<S> = D${w ? ' quando E = 1' : ''}, as outras saídas a 0${all ? ' (todas a 0 quando E = 0)' : ''} (bit a bit quando Largura > 1)`],
  [/^(\d)-input (AND|OR|NAND|NOR|XOR|XNOR) gate \(bitwise when Width > 1\)$/, 'Porta $2 de $1 entradas (bit a bit quando Largura > 1)'],
  [/^(\d+) ports( · .*)?$/, (m, n, rest) => `${n} porto${n === '1' ? '' : 's'}${rest || ''}`],
  [/^(\d+) objects selected$/, '$1 objetos selecionados'],
  // a device primitive's hexadecimal attribute (#791)
  [/^(\d+) bits, hexadecimal$/, '$1 bits, hexadecimal'],
  [/^Module (\S+)$/, 'Módulo $1'],
  [/^Pins \((\d+)\)$/, 'Pinos ($1)'],
  [/^Wire · net (.+)$/, 'Fio · rede $1'],
  [/^Net '(.*)', (\d+) (bits?)$/s, "Rede '$1', $2 $3"],
  [/^(VHDL|VERILOG) statements \(emitted verbatim\)$/, 'Instruções $1 (copiadas tal e qual)'],
  [/^(\d+) symbols?, (\d+) nets(?: · (\d+) error\(s\), (\d+) warning\(s\))?$/,
    (m, n, k, e, w) => `${n} símbolo${n === '1' ? '' : 's'}, ${k} redes${e ? ` · ${e} erro(s), ${w} aviso(s)` : ''}`],
  [/^Check Schematic: (\d+) error\(s\), (\d+) warning\(s\)$/, 'Verificar Esquemático: $1 erro(s), $2 aviso(s)'],
  // a module's symbol out of date (#1183): what changed, Update All, what Update Symbol did
  [/^The symbol is out of date: module '(.+)' changed its ports \((.+)\)\.$/, (m, mod, what) => `O símbolo está desatualizado: o módulo '${mod}' mudou os seus portos (${what
    .replace(/\badded\b/g, 'acrescentados').replace(/\bremoved\b/g, 'removidos').replace(/\bdirection changed\b/g, 'direção mudada')}).`],
  [/^Update All \((\d+)\)$/, 'Atualizar Todos ($1)'],
  [/^Symbol updated; not connected any more: (.+)$/, 'Símbolo atualizado; já não ligados: $1'],
  [/^Symbol updated \((.+)\), its connections kept$/, 'Símbolo atualizado ($1), as suas ligações mantidas'],
  // the bar of the RTL / Technology Schematic (web/js/app.js): the source of the module, the status bar
  [/^Open ([\w.-]+\.(?:vhdl?|v|sv))$/, 'Abrir $1'],
  [/^Drawing (RTL|Technology) schematic of (.+)…$/, (m, k, mod) => `A desenhar o esquemático ${k === 'RTL' ? 'RTL' : 'tecnológico'} de ${mod}…`],
];
