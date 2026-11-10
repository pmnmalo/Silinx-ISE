// Portuguese strings of Verify Equivalence (#3177, web/js/verify.js); merged into the dictionary of i18n.js.
export const VERIFY_PT = {
  'Verify Equivalence…': 'Verificar Equivalência…', 'Verify Equivalence': 'Verificar Equivalência', 'Verify': 'Verificar',
  'Reference module:': 'Módulo de referência:', 'Depth (clock cycles):': 'Profundidade (ciclos de relógio):',
  'Proves that the module gives the outputs of the reference module for every input sequence, or shows the first clock cycle where they differ.':
    'Prova que o módulo dá as saídas do módulo de referência para qualquer sequência de entradas, ou mostra o primeiro ciclo de relógio em que diferem.',
  'The project has no other module to be the reference: add the reference module first': 'O projeto não tem outro módulo que sirva de referência: acrescente primeiro o módulo de referência',
};

export const VERIFY_PT_PATTERNS = [
  [/^The depth is a number of clock cycles from 1 to (\d+)$/, 'A profundidade é um número de ciclos de relógio de 1 a $1'],
];
