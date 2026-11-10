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

export const LABS = [GATES_FIRST_STEPS];
