// The guided labs shipped with Silinx (#3179, core/labs.js), each on its example: a lab file's contents (the format of
// core/labs.js), here as modules so that the browser's build has them without a server. In the order they are listed.
// Every shipped lab is run step by step by test/ui/labs.test.js (the right action ticks a step, a wrong one does not).

const GATES_FIRST_STEPS = {
  silinxLab: 1,
  id: 'gates-first-steps',
  example: 'gates',
  title: { en: 'First steps', pt: 'Primeiros passos' },
  intro: {
    en: 'The gates example is a prime-number detector drawn as a schematic: the four switches are a number from 0 to 15, and the LEDs LD0 and LD1 light when it is prime. In this lab you check the design, simulate it, add an output and give it a pin of the board. Press Check Step when a step is done.',
    pt: 'O exemplo gates é um detetor de números primos desenhado como esquema: os quatro interruptores são um número de 0 a 15, e os LEDs LD0 e LD1 acendem quando é primo. Neste laboratório verifica o projeto, simula-o, acrescenta uma saída e dá-lhe um pino da placa. Carregue em Verificar Passo quando acabar um passo.',
  },
  steps: [
    {
      id: 'project',
      title: { en: 'The project', pt: 'O projeto' },
      text: {
        en: 'The Design pane lists the module `gates` (its schematic, `[Schematic]`, and the VHDL made from it, `[VHDL]`) and its test bench `tb_gates` in the Simulation view. Open the schematic: the NOT, AND and OR gates on the left make LD0, the NAND gates on the right LD1.',
        pt: 'O painel Design mostra o módulo `gates` (o seu esquema, `[Schematic]`, e o VHDL gerado a partir dele, `[VHDL]`) e a sua bancada de teste `tb_gates` na vista de simulação. Abra o esquema: as portas NOT, AND e OR à esquerda fazem o LD0, as portas NAND à direita o LD1.',
      },
      hint: { en: 'Open the gates example (File ▸ New Project, the gates example), with gates as its top module.', pt: 'Abra o exemplo gates (File ▸ New Project, o exemplo gates), com gates como módulo de topo.' },
      checks: [{ check: 'project', top: 'gates', simTop: 'tb_gates' }, { check: 'file', path: 'src/gates.sch.json' }],
    },
    {
      id: 'syntax',
      title: { en: 'Check Syntax', pt: 'Verificar a sintaxe' },
      text: {
        en: 'Select `gates` in the Design pane and run **Check Syntax** (in the Processes pane, under Synthesize). It must end with no errors and no warnings: the console says so.',
        pt: 'Selecione `gates` no painel Design e execute **Check Syntax** (no painel Processes, em Synthesize). Tem de acabar sem erros nem avisos: a consola di-lo.',
      },
      hint: { en: 'Read the console\'s Errors and Warnings tabs: a click on a message goes to its place in the design.', pt: 'Leia os separadores Errors e Warnings da consola: um clique numa mensagem leva ao seu lugar no projeto.' },
      checks: [{ check: 'syntax', warnings: [] }],
    },
    {
      id: 'simulate',
      title: { en: 'Simulate', pt: 'Simular' },
      text: {
        en: 'Go to the Simulation view, select `tb_gates` and run **Simulate Behavioral Model**. The test bench counts from 0 to 15, 10 ns each: at 25 ns the switches are 0010 (2, a prime) and both LEDs are on. The console ends with "Simulation finished OK".',
        pt: 'Passe à vista de simulação, selecione `tb_gates` e execute **Simulate Behavioral Model**. A bancada de teste conta de 0 a 15, 10 ns cada: aos 25 ns os interruptores estão a 0010 (2, um primo) e os dois LEDs acesos. A consola acaba com "Simulation finished OK".',
      },
      hint: { en: 'In the waveform, put the cursor at 25 ns: sw is 0010 and led is 11. An ERROR in the console says which output is wrong.', pt: 'Na forma de onda, ponha o cursor nos 25 ns: sw vale 0010 e led vale 11. Um ERROR na consola diz qual saída está errada.' },
      checks: [{ check: 'simulate', time_ns: 200, values: [{ signal: 'sw', at_ns: 25, value: '0010' }, { signal: 'led', at_ns: 25, value: '11' }], messages: ['Simulation finished OK'] }],
    },
    {
      id: 'even',
      title: { en: 'Add an output', pt: 'Acrescentar uma saída' },
      text: {
        en: 'Now the design also says when the number is even. In the schematic, add an output I/O marker named `even`, and a NOT gate (INV) from the net `d` (sw(0), the number\'s last bit) to it. Save: the VHDL is made again. At 5 ns (the number 0) `even` is 1, at 15 ns (1) it is 0.',
        pt: 'Agora o projeto diz também quando o número é par. No esquema, acrescente um marcador de saída (I/O marker) chamado `even`, e uma porta NOT (INV) da rede `d` (sw(0), o último bit do número) até ele. Guarde: o VHDL é gerado de novo. Aos 5 ns (o número 0) `even` vale 1, aos 15 ns (1) vale 0.',
      },
      hint: { en: 'A number is even when its last bit, d, is 0: even = NOT d. The output must be called even, one bit, an output.', pt: 'Um número é par quando o último bit, d, é 0: even = NOT d. A saída tem de se chamar even, de um bit, uma saída.' },
      checks: [
        { check: 'module', name: 'gates', ports: [{ name: 'sw', dir: 'in', width: 4 }, { name: 'led', dir: 'out', width: 2 }, { name: 'even', dir: 'out', width: 1 }] },
        { check: 'simulate', time_ns: 200, values: [{ signal: 'uut/even', at_ns: 5, value: '1' }, { signal: 'uut/even', at_ns: 15, value: '0' }, { signal: 'uut/even', at_ns: 25, value: '1' }, { signal: 'uut/even', at_ns: 115, value: '0' }] },
      ],
    },
    {
      id: 'pin',
      title: { en: 'A pin of the board', pt: 'Um pino da placa' },
      text: {
        en: 'On the Basys2, `even` lights the LED LD2, pin P7. Open I/O Pin Planning (Tools menu) and give `even` the pin P7, or add the line `NET "even" LOC = "P7" ;` to constraints/gates.ucf. Then Check Syntax again: still no warnings.',
        pt: 'Na Basys2, `even` acende o LED LD2, pino P7. Abra o I/O Pin Planning (menu Tools) e dê a `even` o pino P7, ou acrescente a linha `NET "even" LOC = "P7" ;` a constraints/gates.ucf. Depois verifique de novo a sintaxe: continua sem avisos.',
      },
      hint: { en: 'The constraints file must have a line NET "even" LOC = "P7" ; (LD2 of the Basys2).', pt: 'O ficheiro de restrições tem de ter uma linha NET "even" LOC = "P7" ; (o LD2 da Basys2).' },
      checks: [{ check: 'file', path: 'constraints/gates.ucf', contains: ['/NET\\s+"?even"?\\s+LOC\\s*=\\s*"?P7"?/i'] }, { check: 'syntax', warnings: [] }],
    },
  ],
};

const TRAFFIC_STATE_MACHINE = {
  silinxLab: 1,
  id: 'traffic-state-machine',
  example: 'traffic',
  title: { en: 'A state machine', pt: 'Uma máquina de estados' },
  intro: {
    en: 'The traffic example is a pedestrian crossing: a state machine, drawn as a state diagram, goes through the phases of the lights, a timer says when a phase has lasted its time, and a truth table lights the lamps. In this lab you read the diagram, simulate it, give it a new output and synthesize it. Press Check Step when a step is done.',
    pt: 'O exemplo traffic é uma passadeira: uma máquina de estados, desenhada como diagrama de estados, percorre as fases dos semáforos, um temporizador diz quando uma fase durou o seu tempo, e uma tabela de verdade acende as luzes. Neste laboratório lê o diagrama, simula-o, dá-lhe uma nova saída e sintetiza-o. Carregue em Verificar Passo quando acabar um passo.',
  },
  steps: [
    {
      id: 'diagram',
      title: { en: 'The state diagram', pt: 'O diagrama de estados' },
      text: {
        en: 'In the Design pane, open `traffic` (`[FSM]`): seven states, one per phase of the lights, from CARS (the cars\' green, the state after reset) to WALK (the pedestrians\' green) and back. A transition is taken on the clock\'s edge when its condition is true: `done` from the timer, `req` a pedestrian waiting, `night` the switch SW1. Each state sets the output `phase`, a Moore output.',
        pt: 'No painel Design, abra `traffic` (`[FSM]`): sete estados, um por fase dos semáforos, de CARS (o verde dos carros, o estado depois do reset) a WALK (o verde dos peões) e de volta. Uma transição é feita no flanco do relógio quando a sua condição é verdadeira: `done` vem do temporizador, `req` é um peão à espera, `night` o interruptor SW1. Cada estado dá um valor à saída `phase`, uma saída de Moore.',
      },
      hint: { en: 'Open the traffic example (File ▸ New Project, the traffic example), with top as its top module.', pt: 'Abra o exemplo traffic (File ▸ New Project, o exemplo traffic), com top como módulo de topo.' },
      checks: [{ check: 'project', top: 'top', simTop: 'tb_traffic' }, { check: 'file', path: 'src/traffic.fsm.json' }, { check: 'module', name: 'traffic', ports: [{ name: 'phase', dir: 'out', width: 3 }] }],
    },
    {
      id: 'simulate',
      title: { en: 'Simulate', pt: 'Simular' },
      text: {
        en: 'In the Simulation view, select `tb_traffic` and run **Simulate Behavioral Model** for 12 µs. The test bench runs the timer fast (8 clock cycles a second) and checks the lamps on every clock cycle: a pedestrian\'s press, the crossing, night mode. The console ends with "Simulation finished OK".',
        pt: 'Na vista de simulação, selecione `tb_traffic` e execute **Simulate Behavioral Model** durante 12 µs. A bancada de teste põe o temporizador rápido (8 ciclos de relógio por segundo) e verifica as luzes em cada ciclo: um peão que carrega no botão, a travessia, o modo noturno. A consola acaba com "Simulation finished OK".',
      },
      hint: { en: 'An ERROR in the console says which lamp was wrong and when: compare it with the state diagram.', pt: 'Um ERROR na consola diz que luz estava errada e quando: compare-o com o diagrama de estados.' },
      checks: [{ check: 'simulate', time_ns: 12000, values: [{ signal: 'uut/u_fsm/phase', at_ns: 3500, value: '001' }, { signal: 'uut/u_fsm/phase', at_ns: 4000, value: '011' }], messages: ['Simulation finished OK'] }],
    },
    {
      id: 'output',
      title: { en: 'A new output', pt: 'Uma nova saída' },
      text: {
        en: 'Give the state machine an output `walking`, 1 while the pedestrians may cross (the states WALK and WALK_END), 0 in the others. In the diagram\'s Properties panel (nothing selected), **+ Output** under Outputs: name it `walking`, one bit, default 0. Then select WALK and set its `walking` to 1, and the same in WALK_END. Save: the VHDL of `traffic` is made again from the diagram.',
        pt: 'Dê à máquina de estados uma saída `walking`, a 1 enquanto os peões podem atravessar (os estados WALK e WALK_END), a 0 nos outros. No painel Properties do diagrama (sem nada selecionado), **+ Output** em Outputs: chame-lhe `walking`, um bit, por omissão 0. Depois selecione WALK e ponha o seu `walking` a 1, e o mesmo em WALK_END. Guarde: o VHDL de `traffic` é gerado de novo a partir do diagrama.',
      },
      hint: { en: 'A Moore output takes its default in every state that does not set it: walking must be 1 in both WALK and WALK_END (at 5 µs the machine is in WALK_END).', pt: 'Uma saída de Moore toma o valor por omissão em cada estado que não lhe dá outro: walking tem de estar a 1 em WALK e em WALK_END (aos 5 µs a máquina está em WALK_END).' },
      checks: [
        { check: 'file', path: 'src/traffic.fsm.json', contains: ['"walking"'] },
        { check: 'drawing', path: 'src/traffic.fsm.json' },
        { check: 'module', name: 'traffic', ports: [{ name: 'phase', dir: 'out', width: 3 }, { name: 'walking', dir: 'out', width: 1 }] },
        { check: 'simulate', time_ns: 12000, values: [{ signal: 'uut/u_fsm/walking', at_ns: 3800, value: '0' }, { signal: 'uut/u_fsm/walking', at_ns: 4000, value: '1' }, { signal: 'uut/u_fsm/walking', at_ns: 5000, value: '1' }, { signal: 'uut/u_fsm/walking', at_ns: 5200, value: '0' }], messages: ['Simulation finished OK'] },
      ],
    },
    {
      id: 'synthesize',
      title: { en: 'Synthesize', pt: 'Sintetizar' },
      text: {
        en: 'Back in the Implementation view, select `top` and run **Synthesize** (the Processes pane). The synthesis makes gates and flip-flops of the design: the state register is three flip-flops. It must end with no warnings; the Design Summary shows what it used.',
        pt: 'De volta à vista de implementação, selecione `top` e execute **Synthesize** (o painel Processes). A síntese faz portas e flip-flops a partir do projeto: o registo de estado são três flip-flops. Tem de acabar sem avisos; o Design Summary mostra o que usou.',
      },
      hint: { en: 'Run Synthesize after the last change: a process older than the sources is marked out of date (its icon) and the step is checked on its last run.', pt: 'Execute Synthesize depois da última alteração: um processo mais antigo do que as fontes fica marcado desatualizado (o seu ícone) e o passo é verificado na última execução.' },
      checks: [{ check: 'process', process: 'synthesize', warnings: 0 }],
    },
  ],
};

const BLINKY_CLOCK_BOARD = {
  silinxLab: 1,
  id: 'blinky-clock-board',
  example: 'blinky',
  title: { en: 'The clock and the board', pt: 'O relógio e a placa' },
  intro: {
    en: 'The blinky example runs a knight-rider light on the LEDs of the Basys2, and counts its steps on the display. Everything in it runs on the board\'s 50 MHz clock, divided down to a few steps a second. In this lab you find the board and its clock, change the speed, and make the bitstream that goes into the FPGA. Press Check Step when a step is done.',
    pt: 'O exemplo blinky faz uma luz de "knight rider" nos LEDs da Basys2, e conta os seus passos no mostrador. Tudo nele funciona com o relógio de 50 MHz da placa, dividido até uns poucos passos por segundo. Neste laboratório encontra a placa e o seu relógio, muda a velocidade, e faz o bitstream que vai para a FPGA. Carregue em Verificar Passo quando acabar um passo.',
  },
  steps: [
    {
      id: 'board',
      title: { en: 'The board', pt: 'A placa' },
      text: {
        en: 'Open **Design Properties** (Project menu): the board is the Digilent Basys2, its FPGA a Spartan-3E XC3S250E in a CP132 package. The board fixes the pins: each switch, button and LED is wired to one pin of the FPGA.',
        pt: 'Abra **Design Properties** (menu Project): a placa é a Digilent Basys2, a sua FPGA uma Spartan-3E XC3S250E num encapsulamento CP132. A placa fixa os pinos: cada interruptor, botão e LED está ligado a um pino da FPGA.',
      },
      hint: { en: 'Open the blinky example (File ▸ New Project, the blinky example): its board is the Basys2.', pt: 'Abra o exemplo blinky (File ▸ New Project, o exemplo blinky): a sua placa é a Basys2.' },
      checks: [{ check: 'project', top: 'top', board: 'basys2', part: 'xc3s250e' }],
    },
    {
      id: 'clock',
      title: { en: 'The clock', pt: 'O relógio' },
      text: {
        en: 'Open the constraints, constraints/top.ucf: the port `clk` is on the pin B8, the board\'s 50 MHz oscillator, and its PERIOD constraint says 20 ns. The implementation uses it to check that every path between two flip-flops is faster than one clock period.',
        pt: 'Abra as restrições, constraints/top.ucf: o porto `clk` está no pino B8, o oscilador de 50 MHz da placa, e a sua restrição PERIOD diz 20 ns. A implementação usa-a para verificar que cada caminho entre dois flip-flops é mais rápido do que um período do relógio.',
      },
      hint: { en: 'The constraints file must keep NET "clk" LOC = "B8" and the PERIOD of 20 ns (TIMESPEC "TS_clk").', pt: 'O ficheiro de restrições tem de manter NET "clk" LOC = "B8" e o PERIOD de 20 ns (TIMESPEC "TS_clk").' },
      checks: [{ check: 'file', path: 'constraints/top.ucf', contains: ['/NET\\s+"?clk"?\\s+LOC\\s*=\\s*"?B8"?/i', '/PERIOD\\s+"?clk"?\\s+20\\s*ns/i'] }],
    },
    {
      id: 'simulate',
      title: { en: 'Simulate', pt: 'Simular' },
      text: {
        en: 'At 50 MHz, a second is 50 000 000 clock cycles: too many to simulate. The test bench `tb_top` gives the design small dividers instead (its generic map: DIV => 2). In the Simulation view, run **Simulate Behavioral Model** to the test\'s end, about 500 µs: the console ends with "Simulation finished OK".',
        pt: 'A 50 MHz, um segundo são 50 000 000 ciclos de relógio: demasiados para simular. A bancada de teste `tb_top` dá ao projeto divisores pequenos (o seu generic map: DIV => 2). Na vista de simulação, execute **Simulate Behavioral Model** até ao fim do teste, cerca de 500 µs: a consola acaba com "Simulation finished OK".',
      },
      hint: { en: 'An error in the console says which part of the test failed: the knight rider, the display, the pause or the invert.', pt: 'Um erro na consola diz que parte do teste falhou: o knight rider, o mostrador, a pausa ou a inversão.' },
      checks: [{ check: 'simulate', time_ns: 500000, messages: ['Simulation finished OK'] }],
    },
    {
      id: 'speed',
      title: { en: 'Twice as fast', pt: 'Duas vezes mais rápido' },
      text: {
        en: 'In src/top.vhd, the generic `DIV` divides the clock: its default, 0, takes CLK_HZ / 80 cycles for the base tick, 625 000 at the Basys2\'s 50 MHz, 80 ticks a second. Make the light run twice as fast: `DIV` 312 500 (`312_500`), 160 ticks a second. Save, and Check Syntax: no warnings.',
        pt: 'Em src/top.vhd, o genérico `DIV` divide o relógio: o seu valor por omissão, 0, toma CLK_HZ / 80 ciclos para o tique de base, 625 000 aos 50 MHz da Basys2, 80 tiques por segundo. Ponha a luz a andar duas vezes mais depressa: `DIV` 312 500 (`312_500`), 160 tiques por segundo. Guarde, e verifique a sintaxe: sem avisos.',
      },
      hint: { en: 'Twice as fast is half the cycles per tick: 625 000 / 2 = 312 500, the default value of DIV (0 now) in the entity top.', pt: 'Duas vezes mais rápido é metade dos ciclos por tique: 625 000 / 2 = 312 500, o valor por omissão de DIV (agora 0) na entidade top.' },
      checks: [{ check: 'file', path: 'src/top.vhd', contains: ['/\\bDIV\\s*:\\s*integer\\s*:=\\s*312_?500\\b/i'] }, { check: 'syntax', warnings: [] }],
    },
    {
      id: 'implement',
      title: { en: 'Implement Design', pt: 'Implementar o projeto' },
      text: {
        en: 'Select `top` and run **Implement Design** (the Processes pane): the design is synthesized, its cells placed on the FPGA and the wires routed between them, then the static timing analysis checks the 20 ns of the clock. It must end with no warnings and the timing met: the Design Summary says how fast the design could run.',
        pt: 'Selecione `top` e execute **Implement Design** (o painel Processes): o projeto é sintetizado, as suas células colocadas na FPGA e as ligações encaminhadas entre elas, e a análise temporal estática verifica os 20 ns do relógio. Tem de acabar sem avisos e com a temporização cumprida: o Design Summary diz quão rápido o projeto poderia funcionar.',
      },
      hint: { en: 'Run Implement Design after the last change of the sources: a process older than them is marked out of date.', pt: 'Execute Implement Design depois da última alteração das fontes: um processo mais antigo do que elas fica marcado desatualizado.' },
      checks: [{ check: 'process', process: 'implement', warnings: 0, timing_met: true }],
    },
    {
      id: 'bitstream',
      title: { en: 'The bitstream', pt: 'O bitstream' },
      text: {
        en: 'Run **Generate Programming File**: build/top.bit is the configuration of the FPGA. With the board on USB, **Configure Target Device** loads it (it is lost at power-off; the PROM keeps it). The LEDs run at the new speed.',
        pt: 'Execute **Generate Programming File**: build/top.bit é a configuração da FPGA. Com a placa ligada por USB, **Configure Target Device** carrega-a (perde-se ao desligar; a PROM guarda-a). Os LEDs andam à nova velocidade.',
      },
      hint: { en: 'Generate Programming File runs the implementation first when it is out of date: run it after the last change.', pt: 'Generate Programming File corre primeiro a implementação quando ela está desatualizada: execute-o depois da última alteração.' },
      checks: [{ check: 'process', process: 'bitstream', warnings: 0 }],
    },
  ],
};

const STOPWATCH_EMULATOR = {
  silinxLab: 1,
  id: 'stopwatch-emulator',
  example: 'stopwatch',
  title: { en: 'The emulator', pt: 'O emulador' },
  intro: {
    en: 'The stopwatch example counts seconds and hundredths on the Basys2\'s display, and keeps the laps in a block RAM. Before a design goes into the FPGA, the Board Emulator runs it on a drawing of the board: its switches and buttons are clicked, its LEDs and display light as the board\'s would. In this lab you try the stopwatch in the emulator, test it, and move its reset to another switch. Press Check Step when a step is done.',
    pt: 'O exemplo stopwatch conta segundos e centésimos no mostrador da Basys2, e guarda as voltas numa block RAM. Antes de um projeto ir para a FPGA, o Board Emulator corre-o num desenho da placa: clica-se nos seus interruptores e botões, e os LEDs e o mostrador acendem como os da placa. Neste laboratório experimenta o cronómetro no emulador, testa-o, e passa o seu reset para outro interruptor. Carregue em Verificar Passo quando acabar um passo.',
  },
  steps: [
    {
      id: 'project',
      title: { en: 'The project', pt: 'O projeto' },
      text: {
        en: 'The top module `stopwatch` has the board\'s 50 MHz clock, the switch SW0 (`sw`, its reset), the four buttons (`btn`), the eight LEDs (`led`) and the display (`seg`, `dp`, `an`). Its constraints, constraints/top.ucf, put each of them on its pin of the Basys2.',
        pt: 'O módulo de topo `stopwatch` tem o relógio de 50 MHz da placa, o interruptor SW0 (`sw`, o seu reset), os quatro botões (`btn`), os oito LEDs (`led`) e o mostrador (`seg`, `dp`, `an`). As suas restrições, constraints/top.ucf, põem cada um no seu pino da Basys2.',
      },
      hint: { en: 'Open the stopwatch example (File ▸ New Project, the stopwatch example): its board is the Basys2.', pt: 'Abra o exemplo stopwatch (File ▸ New Project, o exemplo stopwatch): a sua placa é a Basys2.' },
      checks: [{ check: 'project', top: 'stopwatch', simTop: 'tb_stopwatch', board: 'basys2' }, { check: 'pins', pins: [{ port: 'sw<0>', loc: 'P11' }, { port: 'btn<0>', loc: 'G12' }] }],
    },
    {
      id: 'emulate',
      title: { en: 'The Board Emulator', pt: 'O emulador da placa' },
      text: {
        en: 'Open **Tools ▸ Board Emulator**. Press BTN0: the display counts the time; BTN1 stores a lap (the LEDs count the laps); BTN0 again stops it, and BTN2 then clears it; BTN3 shows the laps one after the other. SW0 up holds it in reset. Then press Check Step: this step only asks you to try it.',
        pt: 'Abra **Tools ▸ Board Emulator**. Carregue em BTN0: o mostrador conta o tempo; BTN1 guarda uma volta (os LEDs contam as voltas); BTN0 de novo para-o, e BTN2 depois limpa-o; BTN3 mostra as voltas uma a uma. SW0 para cima mantém-no em reset. Depois carregue em Verificar Passo: este passo só lhe pede que o experimente.',
      },
      hint: { en: 'The emulator runs the design as it is saved: Check Syntax first if it does not start.', pt: 'O emulador corre o projeto tal como está guardado: verifique a sintaxe primeiro se ele não arrancar.' },
    },
    {
      id: 'simulate',
      title: { en: 'The test bench', pt: 'A bancada de teste' },
      text: {
        en: 'The emulator shows what the board would do; the test bench checks it. In the Simulation view, run **Simulate Behavioral Model** on `tb_stopwatch` to its end, about 70 µs (it gives the design a fast hundredth, 2 clock cycles): it presses the buttons and checks the display and the LEDs. The console ends with "Simulation finished OK".',
        pt: 'O emulador mostra o que a placa faria; a bancada de teste verifica-o. Na vista de simulação, execute **Simulate Behavioral Model** em `tb_stopwatch` até ao fim, cerca de 70 µs (dá ao projeto um centésimo rápido, 2 ciclos de relógio): carrega nos botões e verifica o mostrador e os LEDs. A consola acaba com "Simulation finished OK".',
      },
      hint: { en: 'An error in the console says what the test bench expected and what the design did.', pt: 'Um erro na consola diz o que a bancada de teste esperava e o que o projeto fez.' },
      checks: [{ check: 'simulate', time_ns: 70000, messages: ['Simulation finished OK'] }],
    },
    {
      id: 'pin',
      title: { en: 'The reset on SW7', pt: 'O reset no SW7' },
      text: {
        en: 'Move the reset from SW0 to SW7, the switch at the other end: open **Tools ▸ I/O Pin Planning** and give `sw<0>` the pin N3 (SW7) instead of P11 (SW0), or change its line in constraints/top.ucf. Save, and Check Syntax: no warnings.',
        pt: 'Passe o reset de SW0 para SW7, o interruptor na outra ponta: abra **Tools ▸ I/O Pin Planning** e dê a `sw<0>` o pino N3 (SW7) em vez de P11 (SW0), ou mude a sua linha em constraints/top.ucf. Guarde, e verifique a sintaxe: sem avisos.',
      },
      hint: { en: 'On the Basys2, SW7 is the pin N3: the constraints must say NET "sw<0>" LOC = "N3".', pt: 'Na Basys2, o SW7 é o pino N3: as restrições têm de dizer NET "sw<0>" LOC = "N3".' },
      checks: [{ check: 'pins', pins: [{ port: 'sw<0>', loc: 'N3' }] }, { check: 'syntax', warnings: [] }],
    },
    {
      id: 'try',
      title: { en: 'Try it again', pt: 'Experimentar de novo' },
      text: {
        en: 'Open the Board Emulator again: SW7 now resets the stopwatch, and SW0 does nothing. The design did not change, only where its port is on the board.',
        pt: 'Abra de novo o Board Emulator: agora é o SW7 que faz o reset do cronómetro, e o SW0 não faz nada. O projeto não mudou, só o lugar do seu porto na placa.',
      },
      hint: { en: 'The emulator reads the constraints when it opens: close it and open it again.', pt: 'O emulador lê as restrições quando abre: feche-o e abra-o de novo.' },
      checks: [{ check: 'pins', pins: [{ port: 'sw<0>', loc: 'N3' }] }],
    },
  ],
};

export const LABS = [GATES_FIRST_STEPS, TRAFFIC_STATE_MACHINE, BLINKY_CLOCK_BOARD, STOPWATCH_EMULATOR];
