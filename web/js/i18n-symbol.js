// Portuguese strings of the Symbol Editor (web/js/symbol-editor.js, symbol-side.js, symbol-doc.js, #3755; merged into the
// dictionary of i18n.js).
export const SYMBOL_PT = {
  'Edit Symbol': 'Editar Símbolo',
  // toolbar
  '◀ Earlier': '◀ Antes', 'Later ▶': 'Depois ▶',
  'Move the selected pin one place earlier on its side (up, or left)': 'Mover o pino selecionado um lugar para trás no seu lado (para cima, ou para a esquerda)',
  'Move the selected pin one place later on its side (down, or right)': 'Mover o pino selecionado um lugar para a frente no seu lado (para baixo, ou para a direita)',
  'Reset to Default': 'Repor o Predefinido',
  'The symbol as Silinx draws it by default: the inputs on the left, the outputs on the right, in the module\'s order':
    'O símbolo como o Silinx o desenha por omissão: as entradas à esquerda, as saídas à direita, pela ordem do módulo',
  // Properties
  'Side': 'Lado', 'Symbol': 'Símbolo', 'Pin spacing': 'Espaçamento dos pinos', 'Height': 'Altura', 'Module name': 'Nome do módulo',
  'Left': 'Esquerda', 'Right': 'Direita', 'Bottom': 'Base', 'Center': 'Centro',
};
export const SYMBOL_PT_PATTERNS = [
  [/^(\d+) pin\(s\)$/, '$1 pino(s)'],
  [/^(Input|Output|Bidirectional), (\d+) bits$/, (m, d, n) => `${{ Input: 'Entrada', Output: 'Saída', Bidirectional: 'Bidirecional' }[d]}, ${n} bits`],
  [/^(Input|Output|Bidirectional), 1 bit$/, (m, d) => `${{ Input: 'Entrada', Output: 'Saída', Bidirectional: 'Bidirecional' }[d]}, 1 bit`],
  // a module's instance out of date: its module's symbol changed (Symbol Editor)
  [/^The symbol is out of date: module '(.+)' has a new symbol\.$/, "O símbolo está desatualizado: o módulo '$1' tem um símbolo novo."],
];
