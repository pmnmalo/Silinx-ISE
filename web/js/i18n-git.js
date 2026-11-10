// Portuguese strings of git (#3195, web/js/git.js): File ▸ Open from Repository…, File ▸ Git ▸, their dialogs and the
// Design pane's marks; merged into the dictionary of i18n.js.
export const GIT_PT = {
  'Open from Repository…': 'Abrir do Repositório…', 'Open from Repository': 'Abrir do Repositório',
  'Git': 'Git (controlo de versões)',
  'Commit…': 'Registar (Commit)…', 'Commit': 'Registar (Commit)', 'Push to GitHub': 'Enviar para o GitHub (Push)', 'Pull from GitHub': 'Receber do GitHub (Pull)',
  'Initialize Repository…': 'Inicializar Repositório…', 'Initialize Repository': 'Inicializar Repositório', 'Initialize': 'Inicializar',
  'GitHub repository (a Classroom assignment\'s too):': 'Repositório do GitHub (também o de um trabalho do Classroom):',
  'GitHub repository (optional: where Push sends the commits):': 'Repositório do GitHub (opcional: para onde o Push envia os commits):',
  'Message:': 'Mensagem:', 'https://github.com/owner/repository': 'https://github.com/dono/repositório',
  'No change since the last commit.': 'Nenhuma alteração desde o último commit.',
  'Say in a few words what changed.': 'Diga em poucas palavras o que mudou.',
  'git signs in to GitHub with its own credentials (GitHub\'s command line, Git Credential Manager or an SSH key): Silinx never asks for a password or a token.':
    'O git autentica-se no GitHub com as suas próprias credenciais (a linha de comandos do GitHub, o Git Credential Manager ou uma chave SSH): o Silinx nunca pede uma palavra-passe nem um token.',
  'A .gitignore leaves build/ and the tools\' outputs out of the commits.': 'Um .gitignore deixa build/ e os resultados das ferramentas fora dos commits.',
  'In conflict': 'Em conflito', 'New: not committed yet': 'Novo: ainda sem commit', 'Changed since the last commit': 'Alterado desde o último commit',
  'Committed': 'Registado',
};

export const GIT_PT_PATTERNS = [
  [/^(\d+) change\(s\) on (.+):$/, '$1 alteração(ões) em $2:'],
  [/^not a GitHub repository's address: (.*)$/, 'não é o endereço de um repositório do GitHub: $1'],
  [/^a GitHub Classroom invitation, not a repository$/, 'um convite do GitHub Classroom, não um repositório'],
];
