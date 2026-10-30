// Portuguese strings of the FSM, ASM, Petri net, UCF and Boolean Algebra wizards of New Source (#2082, #2140, #2149:
// web/js/chart-wizards.js, template-page.js, ucf-wizard.js, tt-wizard.js, core/chart-templates.js; merged into the
// dictionary of i18n.js).
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
  // the templates of the FSM, ASM and Petri net wizards (#2149, web/js/template-page.js, core/chart-templates.js)
  'Template': 'Modelo', 'Template:': 'Modelo:', 'Start from a template: it fills in the next pages, where you can still change everything.':
    'Comece por um modelo: ele preenche as páginas seguintes, onde ainda pode mudar tudo.',
  'Empty': 'Vazio', 'Counter': 'Contador', 'Up/down counter': 'Contador crescente/decrescente', 'Counter with enable': 'Contador com enable',
  'Ring counter': 'Contador em anel', 'Johnson counter': 'Contador Johnson', 'Sequence detector': 'Detetor de sequência', 'Traffic light': 'Semáforo de trânsito',
  'Start/done controller': 'Controlador start/done', 'Request/acknowledge handshake': 'Handshake pedido/confirmação',
  'Cycle of N places': 'Ciclo de N lugares', 'Producer/consumer': 'Produtor/consumidor', 'Mutual exclusion': 'Exclusão mútua', 'Fork/join': 'Fork/join',
  'Semaphore': 'Semáforo',
  'Number of states (N):': 'Número de estados (N):', 'Number of states (N, even):': 'Número de estados (N, par):', 'Number of places (N):': 'Número de lugares (N):',
  'Buffer size (N):': 'Tamanho do buffer (N):', 'Resources (N):': 'Recursos (N):', 'Users (M):': 'Utilizadores (M):', 'Pattern (bits):': 'Padrão (bits):',
  'Overlapping matches:': 'Ocorrências sobrepostas:', 'yes (1011011: two)': 'sim (1011011: duas)', 'no (1011011: one)': 'não (1011011: uma)',
  'Moore (the output on a state)': 'Moore (a saída num estado)', 'Mealy (the output on a transition)': 'Mealy (a saída numa transição)',
  'No inputs or outputs, two states: type in your own.': 'Sem entradas nem saídas, dois estados: escreva os seus.',
  'N states in a cycle, one at each clock edge; the output q is the count (0 to N-1).': 'N estados em ciclo, um a cada flanco do relógio; a saída q é a contagem (0 a N-1).',
  'N states in a cycle: up = 1 counts up, up = 0 counts down; the output q is the count.': 'N estados em ciclo: up = 1 conta para cima, up = 0 para baixo; a saída q é a contagem.',
  'N states in a cycle: it counts while en = 1 and stays while en = 0; the output q is the count.': 'N estados em ciclo: conta enquanto en = 1 e fica enquanto en = 0; a saída q é a contagem.',
  'N states in a cycle, the output q one-hot: one bit set, moving one place at each clock edge.': 'N estados em ciclo, a saída q one-hot: um bit a 1, que avança uma posição a cada flanco do relógio.',
  'N states (an even number) in a cycle, the output q of N/2 bits a twisted ring: 000, 001, 011, 111, 110, 100…': 'N estados (um número par) em ciclo, a saída q de N/2 bits um anel torcido: 000, 001, 011, 111, 110, 100…',
  'The input x read one bit at each clock edge; the output z is 1 when the last bits read are the pattern.': 'A entrada x lida um bit a cada flanco do relógio; a saída z é 1 quando os últimos bits lidos são o padrão.',
  'Green, yellow, red in turn, each until the input t (its time is up) is 1; the outputs green, yellow and red light the lamps.': 'Verde, amarelo, vermelho à vez, cada um até a entrada t (o seu tempo acabou) ser 1; as saídas green, yellow e red acendem as lâmpadas.',
  'No inputs or outputs, two state boxes chained: add your own.': 'Sem entradas nem saídas, duas caixas de estado encadeadas: acrescente as suas.',
  'N state boxes chained in a cycle, each one setting the output q to its count.': 'N caixas de estado encadeadas em ciclo, cada uma a pôr na saída q a sua contagem.',
  'N state boxes in a cycle, a decision on up after each: up = 1 to the next, up = 0 to the previous; q is the count.': 'N caixas de estado em ciclo, uma decisão sobre up depois de cada uma: up = 1 para a seguinte, up = 0 para a anterior; q é a contagem.',
  'IDLE (ready) waits for start, RUN (busy) waits for done, FINISH (ready) goes back to IDLE.': 'IDLE (ready) espera por start, RUN (busy) espera por done, FINISH (ready) volta a IDLE.',
  'IDLE waits for req; ACK sets ack while req stays 1, then back to IDLE.': 'IDLE espera por req; ACK põe ack a 1 enquanto req fica a 1, depois volta a IDLE.',
  'No places yet: draw your own.': 'Ainda sem lugares: desenhe os seus.',
  'N places in a ring, one token going round: a transition fires while go = 1; the output q is the number of the marked place.': 'N lugares em anel, uma marca a dar a volta: uma transição dispara enquanto go = 1; a saída q é o número do lugar marcado.',
  'A buffer of N items: produce (put = 1) takes a free slot, consume (get = 1) gives it back; can_put and has_data say whether there is room and data.': 'Um buffer de N itens: produce (put = 1) ocupa uma posição livre, consume (get = 1) devolve-a; can_put e has_data dizem se há espaço e dados.',
  'Two processes share one token: req1 / req2 ask for it, grant1 / grant2 say who has it; never both.': 'Dois processos partilham uma marca: req1 / req2 pedem-na, grant1 / grant2 dizem quem a tem; nunca os dois.',
  'go splits the token into two branches, each going on with its input (a, b); they join again when both are done.': 'go divide a marca em dois ramos, cada um a avançar com a sua entrada (a, b); voltam a juntar-se quando ambos acabam.',
  'M users share N resources: req takes one (if any is free), rel gives one back; active while some user has one.': 'M utilizadores partilham N recursos: req toma um (se houver livre), rel devolve um; active enquanto algum utilizador tiver um.',
  'Pattern: 1 to 16 bits, 0 and 1 only.': 'Padrão: 1 a 16 bits, só 0 e 1.', 'A Johnson counter has an even number of states.': 'Um contador Johnson tem um número par de estados.',
  "The template's state boxes, the first one the initial state (after the reset): rename them here; change the chart in the editor.":
    'As caixas de estado do modelo, a primeira o estado inicial (depois do reset): mude-lhes o nome aqui; mude o diagrama no editor.',
  // the UCF Wizard
  'UCF Wizard': 'Assistente de UCF', 'Ports and Pins': 'Portos e Pinos', 'Signal': 'Sinal', 'Pin': 'Pino', 'Module:': 'Módulo:',
  'Assign from Board': 'Atribuir pela Placa', 'e.g. P4': 'p. ex. P4', 'The project has no design module.': 'O projeto não tem módulos de desenho.',
  'No board selected (Project ▸ Design Properties): type the package pin of each bit of the module\'s ports.':
    'Nenhuma placa escolhida (Projeto ▸ Propriedades do Desenho): escreva o pino do encapsulamento de cada bit dos portos do módulo.',
};

// a parameter's label in a message (its field's, without the colon)
const label = what => (WIZARDS_PT[`${what}:`] || `${what}:`).replace(/:$/, '');

export const WIZARDS_PT_PATTERNS = [
  [/^(.*): a whole number from (-?\d+) to (-?\d+)\.$/, (m, what, lo, hi) => `${label(what)}: um número inteiro de ${lo} a ${hi}.`],
  [/^(.*): choose one\.$/, (m, what) => `${label(what)}: escolha um.`],
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
