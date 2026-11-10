// Portuguese strings of a design's link (#2826): Copy Link… (web/js/link-copy.js) and the opening of a link
// (web/js/link-open.js); merged into the dictionary of i18n.js.
export const LINK_PT = {
  'Copy Link to Project…': 'Copiar Ligação para o Projeto…', 'Copy Link to This Module…': 'Copiar Ligação para Este Módulo…',
  'Copy Link': 'Copiar Ligação', 'Open from a Link': 'Abrir a partir de uma Ligação',
  // Copy Link's short link (#3223)
  'Link:': 'Ligação:',
  'The full link: the project inside it (needs nothing, but long)': 'A ligação completa: o projeto dentro dela (não precisa de nada, mas é longa)',
  'A short link: the project encrypted in a secret gist of your GitHub account': 'Uma ligação curta: o projeto cifrado num gist secreto da sua conta do GitHub',
  'A short link, about 140 characters: the project encrypted in this browser and saved as a secret gist of your GitHub account when you copy it; only the link opens it. Your links are your gists, which you list and delete on GitHub.':
    'Uma ligação curta, com cerca de 140 carateres: o projeto cifrado neste navegador e guardado num gist secreto da sua conta do GitHub quando a copia; só a ligação o abre. As suas ligações são os seus gists, que lista e apaga no GitHub.',
  'A short link needs your GitHub sign-in: sign in, or choose the full link.': 'Uma ligação curta precisa da sua sessão no GitHub: inicie-a, ou escolha a ligação completa.',
  'A short link needs a GitHub token on the Silinx server (GH_TOKEN): choose the full link, or start the server with one.': 'Uma ligação curta precisa de um token do GitHub no servidor do Silinx (GH_TOKEN): escolha a ligação completa, ou inicie o servidor com um.',
  'Open in:': 'Abrir em:', 'Open the project only': 'Abrir só o projeto', 'Try it': 'Experimentar', 'Try it (a drawing\'s simulation)': 'Experimentar (a simulação de um desenho)', 'Simulation': 'Simulação', 'Board Emulator': 'Emulador da Placa',
  'Keep Mine': 'Manter o Meu', 'Open': 'Abrir',
  'Include the current view: the open tabs, the split, the panels': 'Incluir a vista atual: os separadores abertos, a divisão, os painéis',
  'Lab:': 'Laboratório:', 'No lab': 'Nenhum laboratório',
};

export const LINK_PT_PATTERNS = [
  [/^A link that opens '(.+)' in Silinx, for slides or a message: the whole project is inside the link \(no file to host\)\. Anyone with the link has every file of the project, its comments too\.$/,
    'Uma ligação que abre \'$1\' no Silinx, para diapositivos ou uma mensagem: o projeto inteiro vai dentro da ligação (sem ficheiro para alojar). Quem tiver a ligação tem todos os ficheiros do projeto, também os comentários.'],
  [/^(\d+) characters\.$/, '$1 caracteres.'],
  [/^(\d+) characters: some slide tools cut a link longer than (\d+) \(export the project as a \.zip, host it, and link to it with #open=\)\.$/,
    '$1 caracteres: algumas ferramentas de diapositivos cortam uma ligação com mais de $2 (exporte o projeto como .zip, aloje-o e ligue para ele com #open=).'],
  [/^This link opens a project from another site:\n\n(.+)\n\nOpen it\? Its files are copied into a new project of your workspace; nothing runs until you run it\.$/,
    'Esta ligação abre um projeto de outro sítio:\n\n$1\n\nAbri-lo? Os ficheiros são copiados para um novo projeto da sua área de trabalho; nada corre até o mandar correr.'],
  [/^A project named '(.+)' already exists, with changes of its own\.\n\nReplace it with the link's design\? The existing project will be deleted from this browser\. Or open the link's design as a new project, '(.+)', yours kept as it is\.$/,
    'Já existe um projeto chamado \'$1\', com alterações próprias.\n\nSubstituí-lo pelo circuito da ligação? O projeto existente será apagado deste browser. Ou abrir o circuito da ligação num projeto novo, \'$2\', mantendo o seu como está.'],
  [/^A project named '(.+)' already exists, with changes of its own\.\n\nReplace it with the link's design\? The existing project is moved to the workspace \.trash folder\. Or open the link's design as a new project, '(.+)', yours kept as it is\.$/,
    'Já existe um projeto chamado \'$1\', com alterações próprias.\n\nSubstituí-lo pelo circuito da ligação? O projeto existente é movido para a pasta .trash da área de trabalho. Ou abrir o circuito da ligação num projeto novo, \'$2\', mantendo o seu como está.'],
  [/^Open as (.+)$/, 'Abrir como $1'],
  [/^(\S+) \(the project's\)$/, '$1 (o do projeto)'],   // (a test bench in Copy Link's Module list, #2878)
  [/^'(.+)' is not a test bench of the design\.$/, '\'$1\' não é um test bench do circuito.'],
  [/^'(.+)' is a test bench: a link opens it in the simulation\.$/, '\'$1\' é um test bench: uma ligação abre-o na simulação.'],
  [/^Try it: the design has no top module \(give top\)\.$/, 'Experimentar: o circuito não tem módulo de topo.'],
  [/^Try it: '(.+)' is not a schematic, a state diagram, a Petri net or an ASM chart\.$/, 'Experimentar: \'$1\' não é um esquemático, um diagrama de estados, uma rede de Petri nem um fluxograma ASM.'],
  [/^The design has no module '(.+)'\.$/, 'O circuito não tem o módulo \'$1\'.'],
  [/^The design has no test bench to simulate\.$/, 'O circuito não tem test bench para simular.'],
  [/^The design has no board to emulate it on\.$/, 'O circuito não tem placa onde o emular.'],
  [/^The design has no top module to emulate\.$/, 'O circuito não tem módulo de topo para emular.'],
  [/^The board emulator emulates the top module, '(.+)', not '(.+)'\.$/, 'O emulador da placa emula o módulo de topo, \'$1\', não \'$2\'.'],
  [/^the design is too large for a link \((\d+) characters, at most (\d+)\): export it as a \.zip \(Export Silinx Project\) and link to that$/,
    'o circuito é grande demais para uma ligação ($1 caracteres, no máximo $2): exporte-o como .zip (Exportar Projeto Silinx) e ligue para esse'],
];
