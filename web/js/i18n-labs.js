// Portuguese strings of the guided labs (#3179, web/js/lab-view.js: Project ▸ Guided Labs…, the Lab document; a lab's
// own texts are its file's, in its languages; the console's lines stay in English, as every process's), merged into the
// dictionary of i18n.js.
export const LABS_PT = {
  'Guided Labs…': 'Laboratórios Guiados…',
  'Guided Labs': 'Laboratórios Guiados',
  'Guided Lab': 'Laboratório Guiado',   // (New Source's type)
  'Teaching': 'Ensino',   // (the Design pane's Teaching tab, #3533)
  'Labs and Exercises': 'Laboratórios e Exercícios', 'Links and Sharing': 'Ligações e Partilha',
  'A guided lab is in the labs folder: Location labs.': 'Um laboratório guiado fica na pasta labs: Localização labs.',
  'This project has no lab.': 'Este projeto não tem laboratórios.',
  'Check Step': 'Verificar Passo',
  'Check this step on the project': 'Verificar este passo no projeto',
  '◀ Previous': '◀ Anterior',
  'The previous step': 'O passo anterior',
  'Next ▶': 'Seguinte ▶',
  'The next step': 'O passo seguinte',
  'Steps': 'Passos',
  '☰ Steps': '☰ Passos',
  'Show / hide the steps panel': 'Mostrar / esconder o painel dos passos',
  'Collapse the Steps panel': 'Recolher o painel dos passos',
  'Expand the Steps panel': 'Expandir o painel dos passos',
  'Restart the Lab': 'Recomeçar o Laboratório',
  'Clear the steps done: the lab from its first step': 'Apagar os passos feitos: o laboratório desde o primeiro passo',
  'The lab': 'O laboratório',
  'Hint': 'Sugestão',
  'Done': 'Feito',
  'This step is done': 'Este passo está feito',
  'Not done yet': 'Ainda não está feito',
};

export const LABS_PT_PATTERNS = [
  [/^Lab: (.+)$/, 'Laboratório: $1'],
  [/^Step (\d+) of (\d+)$/, 'Passo $1 de $2'],
  [/^(\d+) done$/, '$1 feitos'],
  [/^(\d+) of (\d+) steps done$/, '$1 de $2 passos feitos'],
  [/^Silinx's, for the (\S+) example$/, 'Do Silinx, para o exemplo $1'],
];
