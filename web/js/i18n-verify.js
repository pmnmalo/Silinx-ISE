// Portuguese strings of Verify Equivalence, Verify Assertions (#3177, web/js/verify.js) and Verify Property (web/js/verify-props.js); merged into the dictionary of i18n.js.
export const VERIFY_PT = {
  'Verify Equivalence…': 'Verificar Equivalência…', 'Verify Equivalence': 'Verificar Equivalência', 'Verify': 'Verificar',
  'Reference module:': 'Módulo de referência:', 'Depth (clock cycles):': 'Profundidade (ciclos de relógio):',
  'Proves that the module gives the outputs of the reference module for every input sequence, or shows the first clock cycle where they differ.':
    'Prova que o módulo dá as saídas do módulo de referência para qualquer sequência de entradas, ou mostra o primeiro ciclo de relógio em que diferem.',
  'The project has no other module to be the reference: add the reference module first': 'O projeto não tem outro módulo que sirva de referência: acrescente primeiro o módulo de referência',
  'Verify Assertions…': 'Verificar Asserções…', 'Verify Assertions': 'Verificar Asserções',
  'Verify Property…': 'Verificar Propriedade…', 'Verify Property': 'Verificar Propriedade',
  'Prove a property of the state machine: a state never reached, a state reached, outputs never 1 together':
    'Provar uma propriedade da máquina de estados: um estado nunca alcançado, um estado alcançado, saídas nunca a 1 em simultâneo',
  'Prove a property of the chart\'s state machine: a state never reached, a state reached, outputs never 1 together':
    'Provar uma propriedade da máquina de estados do fluxograma: um estado nunca alcançado, um estado alcançado, saídas nunca a 1 em simultâneo',
  'Proves a property of the state machine for every input sequence, or shows the first clock cycle where it fails.':
    'Prova uma propriedade da máquina de estados para qualquer sequência de entradas, ou mostra o primeiro ciclo de relógio em que falha.',
  'Property:': 'Propriedade:', 'State:': 'Estado:', 'Outputs (1 bit):': 'Saídas (1 bit):',
  'Never reaches a state': 'Nunca alcança um estado', 'Reaches a state': 'Alcança um estado', 'Outputs never 1 together': 'Saídas nunca a 1 em simultâneo',
  'Proves that the module\'s assertions hold for every input sequence, or shows the first clock cycle where one fails.':
    'Prova que as asserções do módulo se verificam para qualquer sequência de entradas, ou mostra o primeiro ciclo de relógio em que uma falha.',
};

export const VERIFY_PT_PATTERNS = [
  [/^The depth is a number of clock cycles from 1 to (\d+)$/, 'A profundidade é um número de ciclos de relógio de 1 a $1'],
];
