// Portuguese strings of the Truth Table / Karnaugh Map tool (merged into the dictionary of i18n.js).
export const TT_PT = {
  // menus, processes, New Source
  'Truth Table / Karnaugh Map…': 'Tabela de Verdade / Mapa de Karnaugh…', 'Truth Table / Karnaugh Map': 'Tabela de Verdade / Mapa de Karnaugh',
  'Truth Table': 'Tabela de Verdade', 'View/Edit Truth Table': 'Ver/Editar Tabela de Verdade',
  'Open Truth Table': 'Abrir Tabela de Verdade',
  'Truth Table from Module': 'Tabela de Verdade de um Módulo', 'Generate Schematic': 'Gerar Esquemático',
  'Combinational module (at most 8 input bits): its truth table is computed by simulating every input combination.':
    'Módulo combinatório (no máximo 8 bits de entrada): a tabela de verdade é calculada simulando todas as combinações das entradas.',
  'The project has no design modules.': 'O projeto não tem módulos de projeto.',
  // editor toolbar
  'Inputs:': 'Entradas:', 'Outputs:': 'Saídas:', 'Apply': 'Aplicar', 'Apply the input and output names': 'Aplicar os nomes das entradas e das saídas',
  'Input names (1 to 6), separated by commas or spaces; the first is the most significant bit of a row': 'Nomes das entradas (1 a 6), separados por vírgulas ou espaços; a primeira é o bit mais significativo de cada linha',
  'Output names (1 or more), separated by commas or spaces': 'Nomes das saídas (1 ou mais), separados por vírgulas ou espaços',
  'HDL logic:': 'Lógica do HDL:', 'Form of the logic in the generated HDL module': 'Forma da lógica no módulo HDL gerado',
  'Minimal SOP': 'SOP mínima', 'Minimal POS': 'POS mínima', 'XOR form (when simpler)': 'Forma XOR (quando mais simples)',
  'Draw the minimal circuit of each output as a schematic (gates, inputs and outputs) and add it to the project': 'Desenhar o circuito mínimo de cada saída num esquemático (portas, entradas e saídas) e acrescentá-lo ao projeto',
  'Use only NAND gates in the generated schematic': 'Usar só portas NAND no esquemático gerado', 'NAND gates only': 'Só portas NAND',
  'Truth Table from Module…': 'Tabela de Verdade de um Módulo…',
  'Fill the table with the truth table of a combinational module of the project (exhaustive simulation)': 'Preencher a tabela com a tabela de verdade de um módulo combinatório do projeto (simulação exaustiva)',
  'Not in sync with': 'Não sincronizado com', '— generated from the table': '— gerado a partir da tabela',
  // editor body
  'Truth table': 'Tabela de verdade', 'Notes': 'Notas', 'Notes (saved with the table)': 'Notas (guardadas com a tabela)',
  'Click an output cell to change it: 0 → 1 → X (don\'t care).': 'Clique numa célula de saída para a mudar: 0 → 1 → X (indiferente).',
  'Select this output': 'Selecionar esta saída', 'Expression': 'Expressão', 'Fill Table': 'Preencher Tabela',
  'Fill the column of this output from the expression': 'Preencher a coluna desta saída a partir da expressão',
  'Karnaugh map': 'Mapa de Karnaugh', 'SOP groups (1s)': 'Grupos SOP (1s)', 'POS groups (0s)': 'Grupos POS (0s)',
  'Results': 'Resultados', 'Check my answer': 'Verificar a minha resposta', 'My expression:': 'A minha expressão:',
  'type your answer, e.g. /a·c + b': 'escreva a sua resposta, p.ex. /a·c + b', 'e.g. /a·b + c': 'p.ex. /a·b + c',
  "Operators: / ' ~ (NOT), · . * (AND), ⊕ ^ or xor (XOR), xnor, + (OR)": "Operadores: / ' ~ (NOT), · . * (AND), ⊕ ^ ou xor (XOR), xnor, + (OR)",
  'XOR form': 'Forma XOR',
  'Shown when it has fewer literals than the minimal SOP and POS, or as many and fewer operators': 'Mostrada quando tem menos literais do que a SOP e a POS mínimas, ou tantos e menos operadores',
  'The search was cut short: a simpler XOR form may exist.': 'A procura foi interrompida: pode existir uma forma XOR mais simples.',
  'Notation:': 'Notação:', 'Notation of the expressions': 'Notação das expressões', 'Canonical forms': 'Formas canónicas',
  'Essential prime implicants (SOP)': 'Implicantes primos essenciais (SOP)', 'essential': 'essencial',
  'No 1s: no groups (the output is always 0).': 'Sem 1s: sem grupos (a saída é sempre 0).',
  'No 0s: no groups (the output is always 1).': 'Sem 0s: sem grupos (a saída é sempre 1).',
  'The exact search was cut short: this solution may not be minimal.': 'A procura exata foi interrompida: esta solução pode não ser mínima.',
  'No Karnaugh map for more than 6 inputs.': 'Sem mapa de Karnaugh para mais de 6 entradas.',
  '1 to 6 inputs': '1 a 6 entradas', 'At least 1 output': 'Pelo menos 1 saída',
};

export const TT_PT_PATTERNS = [
  [/^(\d+) term\(s\), (\d+) literal\(s\); gates: (\d+) AND, (\d+) OR, (\d+) NOT \((\d+) gate inputs\)$/, '$1 termo(s), $2 literal(is); portas: $3 AND, $4 OR, $5 NOT ($6 entradas de portas)'],
  [/^(\d+) literal\(s\), (\d+) two-input operator\(s\): (\d+) XOR \/ XNOR, (\d+) AND, (\d+) OR$/, '$1 literal(is), $2 operador(es) de duas entradas: $3 XOR / XNOR, $4 AND, $5 OR'],
  [/^(\d+|many) minimal solutions exist; one is shown\.$/, (m, k) => `${k === 'many' ? 'Muitas' : k} soluções mínimas; é mostrada uma.`],
  [/^\((\d+) prime implicant\(s\)\)$/, '($1 implicante(s) primo(s))'],
  [/^✔ Equal to the table \(output (.+)\)\.$/, '✔ Igual à tabela (saída $1).'],
  [/^✘ Different from the table in (\d+) row\(s\):$/, '✘ Diferente da tabela em $1 linha(s):'],
  [/^— (.+) has errors$/, '— $1 tem erros'],
];
