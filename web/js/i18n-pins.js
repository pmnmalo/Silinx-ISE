// Portuguese strings of I/O Pin Planning's Board view (#2694, web/js/pinplanner-board.js; what a drop says,
// core/pin-board.js), merged into the dictionary of i18n.js.
export const PINS_PT = {
  'The assignments as a table': 'As atribuições numa tabela',
  'Drag the ports onto the parts of the board': 'Arraste as portas para as peças da placa',
  'Drag a port onto a part of the board': 'Arraste uma porta para uma peça da placa',
  'Drag it onto a part of the board': 'Arraste-a para uma peça da placa',
  'Ports': 'Portas',
  'Other resources of the board': 'Outros recursos da placa',
};

export const PINS_PT_PATTERNS = [
  [/^(\S+) taken from (\S+)$/, '$1 tirado a $2'],
  [/^⚠ (\S+) is an output: (\S+) is an input of the board$/, '⚠ $1 é uma saída: $2 é uma entrada da placa'],
  [/^⚠ (\S+) is an input: (\S+) is an output of the board$/, '⚠ $1 é uma entrada: $2 é uma saída da placa'],
  [/^⚠ (\S+) has (\d+) bits, (\S+) (\d+): (.+) not placed$/, '⚠ $1 tem $2 bits, $3 $4: $5 por colocar'],
];
