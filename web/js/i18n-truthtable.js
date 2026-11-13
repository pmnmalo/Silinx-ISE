// Portuguese strings of the Boolean Algebra / Karnaugh Map tool (merged into the dictionary of i18n.js).
export const TT_PT = {
  // menus, processes, New Source
  'Boolean Algebra / Karnaugh Map…': 'Álgebra Booleana / Mapa de Karnaugh…', 'Boolean Algebra / Karnaugh Map': 'Álgebra Booleana / Mapa de Karnaugh',
  'Boolean Algebra': 'Álgebra Booleana', 'View/Edit Boolean Algebra': 'Ver/Editar Álgebra Booleana',
  'Open Boolean Algebra': 'Abrir Álgebra Booleana',
  'Algebra from Module': 'Álgebra de um Módulo',
  'Combinational module (at most 8 input bits): its truth table is computed by simulating every input combination.':
    'Módulo combinatório (no máximo 8 bits de entrada): a tabela de verdade é calculada simulando todas as combinações das entradas.',
  'The project has no design modules.': 'O projeto não tem módulos de projeto.',
  // editor toolbar
  'Inputs:': 'Entradas:', 'Outputs:': 'Saídas:',
  'Input names (1 to 6), separated by commas or spaces; the first is the most significant bit of a row': 'Nomes das entradas (1 a 6), separados por vírgulas ou espaços; a primeira é o bit mais significativo de cada linha',
  'Output names (1 or more), separated by commas or spaces': 'Nomes das saídas (1 ou mais), separados por vírgulas ou espaços',
  'The HDL logic of this output: its module and its schematic in this form': 'A lógica do HDL desta saída: o seu módulo e o seu esquemático nesta forma',
  'Minimal SOP': 'SdP mínima', 'Minimal POS': 'PdS mínimo',
  'Least number of gates': 'Menor número de portas', 'Least delay': 'Menor atraso',
  // the maps in 3D (#1407)
  'Reset view': 'Repor a vista', 'Drag (or the arrow keys) to turn the maps': 'Arraste (ou use as setas) para rodar os mapas',
  'The maps stacked in depth: a group across maps seen as one box': 'Os mapas empilhados em profundidade: um grupo que atravessa mapas visto como uma só caixa',
  // the maps of 3 and 4 variables on a cylinder and a torus (#2925)
  'The map rolled into a cylinder: the cells across its edges joined': 'O mapa enrolado num cilindro: as células de um lado e do outro das margens juntas',
  'The map on a torus: both pairs of its edges joined': 'O mapa num toro: os dois pares de margens juntos',
  'Drag (or the arrow keys) to turn the map': 'Arraste (ou use as setas) para rodar o mapa',
  'The form with the fewest gates, each symbol one gate whatever its number of inputs': 'A forma com menos portas, cada símbolo uma porta qualquer que seja o seu número de entradas',
  'The form with the fewest gates on its longest path, every gate the same delay': 'A forma com menos portas no caminho mais longo, todas as portas com o mesmo atraso',
  'Algebra from Module…': 'Álgebra de um Módulo…', 'Fill the table': 'Preencher a tabela',
  'Fill the table with the truth table of a combinational module of the project (exhaustive simulation)': 'Preencher a tabela com a tabela de verdade de um módulo combinatório do projeto (simulação exaustiva)',
  'Not in sync with': 'Não sincronizado com',
  // editor body
  'Truth table': 'Tabela de verdade', 'Notes': 'Notas', 'Notes (saved with the table)': 'Notas (guardadas com a tabela)',
  'Click an output cell to change it: 0 → 1 → X (don\'t care).': 'Clique numa célula de saída para a mudar: 0 → 1 → X (indiferente).',
  'Select this output': 'Selecionar esta saída', 'Expression': 'Expressão', 'Fill Table': 'Preencher Tabela',
  'Fill the column of this output from the expression': 'Preencher a coluna desta saída a partir da expressão',
  'Karnaugh map': 'Mapa de Karnaugh', 'SOP groups (1s)': 'Grupos SdP (1s)', 'POS groups (0s)': 'Grupos PdS (0s)',
  // the variables' order on the map (#2924)
  'Order:': 'Ordem:', 'Order of the variables on the map, from the most significant to the least': 'Ordem das variáveis no mapa, da mais significativa para a menos',
  'MSB → LSB by columns, then rows': 'MSB → LSB pelas colunas, depois linhas', 'MSB → LSB by rows, then columns': 'MSB → LSB pelas linhas, depois colunas',
  'Results': 'Resultados', 'e.g. /a.b + c': 'p.ex. /a.b + c',
  "Operators: / ' ~ (NOT), . · * (AND), ⊕ ^ or xor (XOR), xnor, + (OR)": "Operadores: / ' ~ (NOT), . · * (AND), ⊕ ^ ou xor (XOR), xnor, + (OR)",
  'XOR form': 'Forma XOR',
  'Shown when it has fewer literals than the minimal SOP and POS, or as many and fewer operators': 'Mostrada quando tem menos literais do que a SdP e o PdS mínimos, ou tantos e menos operadores',
  'The search was cut short: a simpler XOR form may exist.': 'A procura foi interrompida: pode existir uma forma XOR mais simples.',
  // the NAND and NOR forms, the schematic of a table (#694)
  'NAND form': 'Forma NAND', 'NOR form': 'Forma NOR',
  'The minimal SOP with NAND gates only (double negation); an inverter is a NAND with its inputs tied, /(a·a)': 'A SdP mínima só com portas NAND (dupla negação); um inversor é uma NAND com as entradas ligadas, /(a·a)',
  'The minimal POS with NOR gates only (double negation); an inverter is a NOR with its inputs tied, /(a + a)': 'O PdS mínimo só com portas NOR (dupla negação); um inversor é uma NOR com as entradas ligadas, /(a + a)',
  'Generated from the Boolean algebra, in its HDL logic form': 'Gerado a partir da álgebra booleana, na sua forma da lógica do HDL',
  'Notation:': 'Notação:', 'Notation of the expressions': 'Notação das expressões', 'Canonical SOP': 'Forma canónica SdP', 'Canonical POS': 'Forma canónica PdS',
  'The sum of the minterms: every input in every term, the don\'t cares left out': 'A soma dos mintermos: todas as entradas em todos os termos, sem as indiferenças',
  'The product of the maxterms: every input in every term, the don\'t cares left out': 'O produto dos maxtermos: todas as entradas em todos os termos, sem as indiferenças',
  'No 1s: no groups (the output is always 0).': 'Sem 1s: sem grupos (a saída é sempre 0).',
  'No 0s: no groups (the output is always 1).': 'Sem 0s: sem grupos (a saída é sempre 1).',
  'The exact search was cut short: this solution may not be minimal.': 'A procura exata foi interrompida: esta solução pode não ser mínima.',
  'No Karnaugh map for more than 6 inputs.': 'Sem mapa de Karnaugh para mais de 6 entradas.',
  '1 to 6 inputs': '1 a 6 entradas', 'At least 1 output': 'Pelo menos 1 saída',
  'Many minimal solutions exist; the first 64 can be browsed.': 'Existem muitas soluções mínimas; podem ver-se as primeiras 64.',
  'Previous solution': 'Solução anterior', 'Next solution': 'Solução seguinte',
};

export const TT_PT_PATTERNS = [
  [/^As a circuit: (\d+) gate\(s\), delay (\d+)$/, 'Como circuito: $1 porta(s), atraso $2'],   // (#1427)
  [/^(\d+) term\(s\), (\d+) literal\(s\); gates: (\d+) AND, (\d+) OR, (\d+) NOT \((\d+) gate inputs\)$/, '$1 termo(s), $2 literal(is); portas: $3 AND, $4 OR, $5 NOT ($6 entradas de portas)'],
  [/^(\d+) literal\(s\), (\d+) two-input operator\(s\): (\d+) XOR \/ XNOR, (\d+) AND, (\d+) OR$/, '$1 literal(is), $2 operador(es) de duas entradas: $3 XOR / XNOR, $4 AND, $5 OR'],
  [/^(\d+) minimal solutions exist\.$/, (m, k) => `Existem ${k} soluções mínimas.`],
  [/^Solution (\d+) of (\d+)$/, (m, i, k) => `Solução ${i} de ${k}`],
  [/^\((\d+) prime implicant\(s\)\)$/, '($1 implicante(s) primo(s))'],
  [/^(\d+) gate\(s\), (\d+) of them inverter\(s\)$/, '$1 porta(s), $2 delas inversora(s)'],
  [/^— the truth table has errors: (.+)$/, '— a tabela de verdade tem erros: $1'],
  [/^— (.+) has errors$/, '— $1 tem erros'],
  // the status line (#2763)
  [/^(\d+) inputs? · (\d+) outputs? · (\d+) rows$/, (m, i, o, r) => `${i} entrada${i === '1' ? '' : 's'} · ${o} saída${o === '1' ? '' : 's'} · ${r} linhas`],
];
