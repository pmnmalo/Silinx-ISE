// Portuguese strings of the FSM, ASM and UCF wizards of New Source (#2082, web/js/chart-wizards.js,
// web/js/ucf-wizard.js; merged into the dictionary of i18n.js).
export const WIZARDS_PT = {
  'Wizard >': 'Assistente >',   // New Source's button (#958, #2082)
  // the FSM and ASM wizards
  'FSM Wizard': 'Assistente de FSM', 'ASM Wizard': 'Assistente de ASM',
  'State machine (module) name:': 'Nome da máquina de estados (módulo):', 'ASM chart (module) name:': 'Nome do diagrama ASM (módulo):',
  'The wizard creates a state diagram with its inputs, outputs, states and transitions, ready for you to set the outputs of its states; its HDL is generated from it.':
    'O assistente cria um diagrama de estados com as entradas, as saídas, os estados e as transições, pronto para definir as saídas dos estados; o HDL é gerado a partir dele.',
  'The wizard creates an ASM chart with its inputs, outputs and state boxes, ready for you to add the decisions and the outputs; its HDL is generated from it.':
    'O assistente cria um diagrama ASM com as entradas, as saídas e as caixas de estado, pronto para acrescentar as decisões e as saídas; o HDL é gerado a partir dele.',
  'Reset (asynchronous, to the initial state):': 'Reset (assíncrono, para o estado inicial):',
  'Machine type:': 'Tipo de máquina:', 'Moore (the outputs depend on the state)': 'Moore (as saídas dependem do estado)',
  'Mealy (the outputs depend on the state and the inputs)': 'Mealy (as saídas dependem do estado e das entradas)',
  'States and Transitions': 'Estados e Transições', 'States': 'Estados', '(initial)': '(inicial)',
  'Add State': 'Acrescentar Estado', 'Add Transition': 'Acrescentar Transição', 'Empty: always': 'Vazia: sempre', 'always': 'sempre',
  'No transitions yet: use Add Transition, or draw them in the editor.': 'Ainda sem transições: use Acrescentar Transição, ou desenhe-as no editor.',
  'The states (the first one is the initial state, after the reset), then the transitions between them: a condition over the inputs (e.g. x, !x, a && b, n == 3), empty for always; the first true one of a state is taken.':
    'Os estados (o primeiro é o estado inicial, depois do reset), e depois as transições entre eles: uma condição sobre as entradas (p. ex. x, !x, a && b, n == 3), vazia para sempre; é tomada a primeira verdadeira de cada estado.',
  'One state box per state, top to bottom: the first one is the initial state (after the reset); each one goes to the next, the last one back to the first. Add the decision boxes and the outputs in the editor.':
    'Uma caixa de estado por estado, de cima para baixo: a primeira é o estado inicial (depois do reset); cada uma vai para a seguinte, a última volta à primeira. Acrescente as caixas de decisão e as saídas no editor.',
  'Add at least one state.': 'Acrescente pelo menos um estado.',
  'A transition starts or ends at a state that is not in the list.': 'Uma transição começa ou acaba num estado que não está na lista.',
  // the Boolean Algebra Wizard (#2140, web/js/tt-wizard.js)
  'Boolean Algebra Wizard': 'Assistente de Álgebra Booleana', 'Outputs: at least one.': 'Saídas: pelo menos uma.',
  // the UCF Wizard
  'UCF Wizard': 'Assistente de UCF', 'Ports and Pins': 'Portos e Pinos', 'Signal': 'Sinal', 'Pin': 'Pino', 'Module:': 'Módulo:',
  'Assign from Board': 'Atribuir pela Placa', 'e.g. P4': 'p. ex. P4', 'The project has no design module.': 'O projeto não tem módulos de desenho.',
  'No board selected (Project ▸ Design Properties): type the package pin of each bit of the module\'s ports.':
    'Nenhuma placa escolhida (Projeto ▸ Propriedades do Desenho): escreva o pino do encapsulamento de cada bit dos portos do módulo.',
};

export const WIZARDS_PT_PATTERNS = [
  [/^The names of the inputs \(1 to (\d+)\) and of the outputs, separated by commas; or an expression, whose variables are the inputs and whose name \(else f\) the output, its column filled in\.$/,
    'Os nomes das entradas (1 a $1) e das saídas, separados por vírgulas; ou uma expressão, cujas variáveis são as entradas e cujo nome (senão f) é a saída, com a coluna preenchida.'],
  [/^Inputs: 1 to (\d+) \(there are (\d+)\)\.$/, 'Entradas: 1 a $1 (há $2).'], [/^'(.*)' is not a valid name\.$/, "'$1' não é um nome válido."],
  [/^'(.*)' is used twice\.$/, "'$1' é usado duas vezes."],
  [/^State '(.*)': (.*)\.$/, "Estado '$1': $2."], [/^Two states are named '(.*)'\.$/, "Há dois estados com o nome '$1'."],
  [/^Each bit of the module's ports on a pin of the (.*): assigned from the board by their names \(clk, led, sw, btn…\) and directions; change them at will\.$/,
    'Cada bit dos portos do módulo num pino da $1: atribuído pela placa pelos nomes (clk, led, sw, btn…) e pelas direções; mude-os à vontade.'],
  [/^'(.*)' is used twice \((the clock|the reset|input|output) and (the clock|the reset|input|output)\)$/, (m, n, a, b) => {
    const W = { 'the clock': 'o relógio', 'the reset': 'o reset', input: 'entrada', output: 'saída' };
    return `'${n}' é usado duas vezes (${W[a]} e ${W[b]})`;
  }],
  [/^Not assigned: (.*)\.$/, 'Por atribuir: $1.'], [/^The pin (\S+) is given to (\S+) and (\S+)\.$/, 'O pino $1 está dado a $2 e a $3.'],
  [/^The wizard will create (\S+), the project's constraints file:$/, 'O assistente vai criar $1, o ficheiro de restrições do projeto:'],
  [/^The wizard will create (\S+):$/, 'O assistente vai criar $1:'],
];
