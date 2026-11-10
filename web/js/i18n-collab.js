// Portuguese strings of a shared project (#3181): Share Project… (web/js/collab-share.js), following one
// (web/js/collab-follow.js), who is in it (web/js/collab-presence.js), the follower's notice (web/js/collab-state.js);
// merged into the dictionary of i18n.js. (The console's lines are not translated, as every tool's output.)
export const COLLAB_PT = {
  'Share Project…': 'Partilhar Projeto…', 'Share Project': 'Partilhar Projeto', 'Share': 'Partilhar',
  'Follow a Shared Project': 'Seguir um Projeto Partilhado', 'Follow': 'Seguir',
  'Stop Sharing': 'Parar de Partilhar', 'Stop Following': 'Deixar de Seguir', 'Sharing': 'A partilhar',
  'Not shared any more': 'Já não partilhado', 'Shared project': 'Projeto partilhado',
  'Shared project: who is in it, and its commands': 'Projeto partilhado: quem está nele, e os seus comandos',
  'Your name, as they see it:': 'O seu nome, como o veem:', 'you': 'você', 'owner': 'dono', 'follower': 'seguidor',
  'Others follow this project live with its link, read only: its files and drawings as they change, the editor you have open and your cursor. Its builds are not shared.':
    'Outros seguem este projeto em direto com a sua ligação, só de leitura: os ficheiros e os desenhos à medida que mudam, o editor que tem aberto e o seu cursor. As compilações não são partilhadas.',
  'This link follows a project someone shares: you see its files and drawings as they change, read only, and where its owner is.':
    'Esta ligação segue um projeto que alguém partilha: vê os ficheiros e os desenhos à medida que mudam, só de leitura, e onde está o seu dono.',
};

export const COLLAB_PT_PATTERNS = [
  [/^Read-only, following (.+)'s project$/, 'Só de leitura, a seguir o projeto de $1'],
  [/^Sharing \((\d+)\)$/, 'A partilhar ($1)'],
  [/^Anyone with this link follows "(.+)" live, read only, as long as you share it\.$/, 'Quem tiver esta ligação segue "$1" em direto, só de leitura, enquanto o partilhar.'],
  // (the presence's button: the owner's name)
  [/^Following ([^."():]+)$/, 'A seguir $1'],
  [/^Follow ([^."():]+)$/, 'Seguir $1'],
];
