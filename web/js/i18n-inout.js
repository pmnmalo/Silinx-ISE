// Portuguese strings of the bidirectional (inout, tri-state) ports of the Module / Schematic Wizards,
// the Test Bench Wizard and the live schematic simulation (merged into the dictionary of i18n.js).
export const IO_PT = {
  // Module Wizard / Schematic Wizard (web/js/modwizard.js)
  'Quick add (bidirectional):': 'Adicionar (bidirecionais):',
  'bidirectional': 'bidirecional',
  'bidirectional = inout: a tri-state port the module can drive or release (Z), and read':
    'bidirecional = inout: um porto tri-state que o módulo pode atuar ou libertar (Z), e ler',
  'One row per input, output or bidirectional (inout) port. Width 1 is a single bit (std_logic / wire); a width N makes a bus of N bits, numbered N-1 downto 0.':
    'Uma linha por entrada, saída ou porto bidirecional (inout). Largura 1 é um só bit (std_logic / wire); uma largura N faz um barramento de N bits, numerados de N-1 a 0.',
  // Test Bench Wizard (web/js/tbwizard.js)
  'bidirectional: the value the bench drives on the bus; Z or empty = released (the design drives it)':
    'bidirecional: o valor que a bancada impõe no barramento; Z ou vazio = libertado (o projeto atua-o)',
  'bidirectional: the value expected on the bus': 'bidirecional: o valor esperado no barramento',
  'Bidirectional ports: the drive column is the value the bench puts on the bus (it drives it like an input); Z or empty releases the bus, so that the design can drive it. The expected column is the value read on the bus, checked like an output.':
    'Portos bidirecionais: a coluna "valor imposto" é o valor que a bancada põe no barramento (atua-o como uma entrada); Z ou vazio liberta o barramento, para que o projeto o possa atuar. A coluna "esperado" é o valor lido no barramento, verificado como uma saída.',
  // live schematic simulation (web/js/sch-live.js)
  'released (Z): click to drive the bus': 'libertado (Z): clique para atuar o barramento',
  'driven from outside: click to change or release (Z)': 'atuado do exterior: clique para mudar ou libertar (Z)',
  'Release the bus (Z): the circuit drives it': 'Libertar o barramento (Z): o circuito atua-o',
  'Bidirectional (inout) markers show the value on the bus. Click one to drive the bus from outside (1-bit: Z, 0, 1 in turn; a bus opens the value editor, Z releases it); released (Z), the circuit drives it.':
    'Os marcadores bidirecionais (inout) mostram o valor no barramento. Clique num para o atuar do exterior (1 bit: Z, 0, 1 alternadamente; um barramento abre o editor de valor, Z liberta-o); libertado (Z), é o circuito que o atua.',
};

export const IO_PT_PATTERNS = [
  [/^Port '(.*)': the direction must be input, output or bidirectional \(inout\)\.$/, "Porto '$1': a direção tem de ser entrada, saída ou bidirecional (inout)."],
  [/^(\w+) \(drive\)$/, '$1 (valor imposto)'],
  [/^(\w+) \(expected\)$/, '$1 (esperado)'],
  [/^(\w+): released \(Z\): click to drive the bus$/, '$1: libertado (Z): clique para atuar o barramento'],
  [/^(\w+): driven from outside: click to change or release \(Z\)$/, '$1: atuado do exterior: clique para mudar ou libertar (Z)'],
  [/^Bidirectional ports \((.*)\): the generated vectors come in pairs: the bench first drives the port like an input, then releases it \(Z\) with the same inputs, so that the design can drive the bus; the value on the bus is checked in both\. You can change any row on the next page\.$/,
    'Portos bidirecionais ($1): os vetores gerados vêm aos pares: a bancada primeiro impõe o valor do porto como numa entrada, depois liberta-o (Z) com as mesmas entradas, para que o projeto possa atuar o barramento; o valor no barramento é verificado em ambos. Pode alterar qualquer linha na página seguinte.'],
];
