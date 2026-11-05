// Portuguese strings of a design's link (#2826): Copy Link… (web/js/link-copy.js) and the opening of a link
// (web/js/link-open.js); merged into the dictionary of i18n.js.
export const LINK_PT = {
  'Copy Link to Project…': 'Copiar Ligação para o Projeto…', 'Copy Link to This Module…': 'Copiar Ligação para Este Módulo…',
  'Copy Link': 'Copiar Ligação', 'Open from a Link': 'Abrir a partir de uma Ligação',
  'Open in:': 'Abrir em:', 'Open the project only': 'Abrir só o projeto', 'Try it': 'Experimentar', 'Simulation': 'Simulação', 'Board Emulator': 'Emulador da Placa',
  'Keep Mine': 'Manter o Meu', 'Open': 'Abrir',
};

export const LINK_PT_PATTERNS = [
  [/^A link that opens '(.+)' in Silinx, for slides or a message: the whole project is inside the link \(no file to host\)\. Anyone with the link has every file of the project, its comments too\.$/,
    'Uma ligação que abre \'$1\' no Silinx, para diapositivos ou uma mensagem: o projeto inteiro vai dentro da ligação (sem ficheiro para alojar). Quem tiver a ligação tem todos os ficheiros do projeto, também os comentários.'],
  [/^(\d+) characters\.$/, '$1 caracteres.'],
  [/^(\d+) characters: some slide tools cut a link longer than (\d+) \(export the project as a \.zip, host it, and link to it with #open=\)\.$/,
    '$1 caracteres: algumas ferramentas de diapositivos cortam uma ligação com mais de $2 (exporte o projeto como .zip, aloje-o e ligue para ele com #open=).'],
  [/^This link opens a project from another site:\n\n(.+)\n\nOpen it\? Its files are copied into a new project of your workspace; nothing runs until you run it\.$/,
    'Esta ligação abre um projeto de outro sítio:\n\n$1\n\nAbri-lo? Os ficheiros são copiados para um novo projeto da sua área de trabalho; nada corre até o mandar correr.'],
  [/^A project named '(.+)' already exists, with changes of its own\.\n\nReplace it with the link's design\? The existing project will be deleted from this browser\.$/,
    'Já existe um projeto chamado \'$1\', com alterações próprias.\n\nSubstituí-lo pelo circuito da ligação? O projeto existente será apagado deste browser.'],
  [/^A project named '(.+)' already exists, with changes of its own\.\n\nReplace it with the link's design\? The existing project is moved to the workspace \.trash folder\.$/,
    'Já existe um projeto chamado \'$1\', com alterações próprias.\n\nSubstituí-lo pelo circuito da ligação? O projeto existente é movido para a pasta .trash da área de trabalho.'],
  [/^Try it: the design has no top module \(give top\)\.$/, 'Experimentar: o circuito não tem módulo de topo.'],
  [/^Try it: '(.+)' is not a schematic \(Try it is a schematic's\)\.$/, 'Experimentar: \'$1\' não é um esquemático (Experimentar é dos esquemáticos).'],
  [/^The design has no module '(.+)'\.$/, 'O circuito não tem o módulo \'$1\'.'],
  [/^The design has no test bench to simulate\.$/, 'O circuito não tem test bench para simular.'],
  [/^The design has no board to emulate it on\.$/, 'O circuito não tem placa onde o emular.'],
  [/^The design has no top module to emulate\.$/, 'O circuito não tem módulo de topo para emular.'],
  [/^the design is too large for a link \((\d+) characters, at most (\d+)\): export it as a \.zip \(Export Silinx ISE Project\) and link to that$/,
    'o circuito é grande demais para uma ligação ($1 caracteres, no máximo $2): exporte-o como .zip (Exportar Projeto Silinx ISE) e ligue para esse'],
];
