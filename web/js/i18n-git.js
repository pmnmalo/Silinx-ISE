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
  'Committed': 'Registado', 'History…': 'Histórico…', 'History': 'Histórico', 'No commit yet.': 'Ainda sem commits.',
  'GitHub Checks': 'Verificações do GitHub (Checks)',   // (#3194)
  // the browser edition (#3196: GitHub's API, its own sign-in)
  'Commit and Push…': 'Registar e Enviar (Commit e Push)…', 'Commit and Push': 'Registar e Enviar (Commit e Push)',
  'Sign in with GitHub…': 'Iniciar sessão no GitHub…', 'Sign in with GitHub': 'Iniciar sessão no GitHub', 'Sign out of GitHub': 'Terminar sessão no GitHub',
  'Open this page of GitHub, sign in there and enter the code:': 'Abra esta página do GitHub, inicie lá a sessão e introduza o código:',
  'Asking GitHub for a code…': 'A pedir um código ao GitHub…',
  'Waiting for GitHub: enter the code there and authorize Silinx.': 'À espera do GitHub: introduza lá o código e autorize o Silinx.',
  'A public repository opens as it is; a private one (a Classroom assignment\'s) after Sign in with GitHub… with your private repositories included.':
    'Um repositório público abre-se tal como está; um privado (o de um trabalho do Classroom) depois de Iniciar sessão no GitHub… com os seus repositórios privados incluídos.',
  // (#3356: the scope asked for, where the sign-in is kept)
  'The sign-in is sent only to GitHub, and kept in this browser unless you untick Remember me (then in this tab until it is closed).':
    'A sessão é enviada só ao GitHub, e fica guardada neste navegador a menos que desmarque Lembrar-me (então neste separador até ser fechado).',
  'Remember me in this browser (kept after this tab closes, where every page of this site\'s address can read it)':
    'Lembrar-me neste navegador (guardada depois de fechar este separador, onde todas as páginas do endereço deste sítio a podem ler)',
  // (#3530: the single file opened from the disk keeps the sign-in in its tab only)
  'The sign-in is sent only to GitHub, and kept in this tab until it is closed (a Silinx opened from a file does not remember it).':
    'A sessão é enviada só ao GitHub, e fica guardada neste separador até ser fechado (um Silinx aberto de um ficheiro não a lembra).',
  'A Silinx opened from a file keeps the sign-in in this tab only: every page opened from the disk can read what this browser keeps for files.':
    'Um Silinx aberto de um ficheiro guarda a sessão só neste separador: todas as páginas abertas do disco podem ler o que este navegador guarda para ficheiros.',
  'Silinx asks GitHub for your public repositories and your gists.': 'O Silinx pede ao GitHub os seus repositórios públicos e os seus gists.',
  'Include my private repositories (a Classroom assignment\'s): GitHub then gives Silinx all of them':
    'Incluir os meus repositórios privados (o de um trabalho do Classroom): o GitHub dá então ao Silinx todos eles',
  'Get a Code': 'Obter um Código',
  'GitHub repository (an empty one: where the commits go):': 'Repositório do GitHub (um vazio: para onde vão os commits):',
  // the drawings' diffs and conflicts (#3197)
  'Compare': 'Comparar', 'Resolve Conflicts': 'Resolver Conflitos', 'Mine': 'O meu', 'Theirs': 'O deles',
  'Not there yet.': 'Ainda não existia.', 'Deleted.': 'Apagado.', 'Read-only': 'Só de leitura',
  'as it is now': 'como está agora', 'before the first commit': 'antes do primeiro commit',
  // the sign-in with a token (#3196)
  'Sign in with a fine-grained personal access token of your GitHub account:': 'Inicie sessão com um token de acesso pessoal de granularidade fina da sua conta do GitHub:',
  'Open GitHub\'s page for a new token:': 'Abra a página do GitHub para um novo token:',
  'Repository access: Only select repositories (the ones to open in Silinx).': 'Acesso aos repositórios: Only select repositories (os que vai abrir no Silinx).',
  'Repository permissions: Contents, Read and write (Metadata, Read-only, comes with it).': 'Permissões dos repositórios: Contents, Read and write (Metadata, Read-only, vem com ela).',
  'Generate the token, copy it and paste it here.': 'Gere o token, copie-o e cole-o aqui.',
  'Account permissions: Gists, Read and write (for Share Project\'s short links).': 'Permissões da conta: Gists, Read and write (para as ligações curtas de Partilhar Projeto).',
  'Sign In': 'Iniciar Sessão',
};

export const GIT_PT_PATTERNS = [
  [/^(\d+) commit\(s\), the newest first: a file opens as it was then, read only\.$/, '$1 commit(s), o mais recente primeiro: um ficheiro abre-se como era então, só de leitura.'],
  [/^Read-only, as it was in the commit ([0-9a-f]{7})( \(.+\))?$/, 'Só de leitura, como era no commit $1$2'],
  [/^Read-only, as it is now$/, 'Só de leitura, como está agora'], [/^Read-only, before the first commit$/, 'Só de leitura, antes do primeiro commit'],
  [/^(\d+) added$/, '$1 acrescentado(s)'], [/^(\d+) removed$/, '$1 removido(s)'], [/^(\d+) moved or changed$/, '$1 movido(s) ou alterado(s)'],
  [/^(\d+) line\(s\) changed$/, '$1 linha(s) alterada(s)'],
  [/^(\d+) object\(s\) changed both here and on GitHub: choose whose version each one keeps\. The rest of each drawing is merged by itself\.$/, '$1 objeto(s) alterado(s) aqui e no GitHub: escolha a versão que cada um mantém. O resto de cada desenho junta-se por si.'],
  [/^Choose Mine or Theirs for (\d+) object\(s\) more\.$/, 'Escolha O meu ou O deles para mais $1 objeto(s).'],
  [/^(\d+) change\(s\) on (.+):$/, '$1 alteração(ões) em $2:'],
  [/^not a GitHub repository's address: (.*)$/, 'não é o endereço de um repositório do GitHub: $1'],
  [/^a GitHub Classroom invitation, not a repository$/, 'um convite do GitHub Classroom, não um repositório'],
];
