// Portuguese strings of a shared project (#3181): Share Project… (web/js/collab-share.js), following one
// (web/js/collab-follow.js), who is in it (web/js/collab-presence.js), the follower's notice (web/js/collab-state.js),
// a room the owner's page hosts (web/js/collab-host.js) and its meeting point (web/js/collab-meet.js);
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
  // (a room the owner's page hosts, #3227: web/js/collab-host.js)
  'Add a Follower…': 'Adicionar um Seguidor…', 'Add a Follower': 'Adicionar um Seguidor', 'Connect': 'Ligar',
  'Connect to the Owner': 'Ligar ao Dono', 'Copy Code': 'Copiar Código', 'Your code:': 'O seu código:', 'The owner\'s code:': 'O código do dono:',
  'A follower gets a code when they open the link: paste it here.': 'Um seguidor recebe um código ao abrir a ligação: cole-o aqui.',
  'Send this code back to the follower: they paste it to connect.': 'Envie este código de volta ao seguidor: ele cola-o para se ligar.',
  'The owner\'s page shares this project itself. Send them your code (Add a Follower…, in their toolbar), then paste the code they send back.':
    'A página do dono partilha este projeto ela própria. Envie-lhe o seu código (Adicionar um Seguidor…, na barra de ferramentas dele) e cole depois o código que ele lhe enviar.',
  'This page hosts it: its followers find it when they open the link, or send you a code, which Add a Follower… takes.':
    'Esta página aloja-o: os seguidores encontram-na ao abrir a ligação, ou enviam-lhe um código, que Adicionar um Seguidor… recebe.',
  // (the meeting point, #3227: web/js/collab-meet.js)
  'Exchange Codes Instead': 'Trocar Códigos em Vez Disso',
  'Looking for the owner at the meeting point…': 'A procurar o dono no ponto de encontro…',
  'If they cannot be found there, you exchange codes with them instead.': 'Se não for encontrado aí, troca códigos com ele em vez disso.',
};

export const COLLAB_PT_PATTERNS = [
  [/^Read-only, following (.+)'s project$/, 'Só de leitura, a seguir o projeto de $1'],
  [/^Sharing \((\d+)\)$/, 'A partilhar ($1)'],
  [/^Anyone with this link follows "(.+)" live, read only, as long as you share it\.$/, 'Quem tiver esta ligação segue "$1" em direto, só de leitura, enquanto o partilhar.'],
  // (the presence's button: the owner's name)
  [/^Following ([^."():]+)$/, 'A seguir $1'],
  [/^Follow ([^."():]+)$/, 'Seguir $1'],
];
