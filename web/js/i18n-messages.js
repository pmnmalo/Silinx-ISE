// Portuguese strings of the texts the label scan of test/web-i18n.test.js did not reach before #3539: toasts, dialogs'
// titles and messages, the errors a dialog returns, plain elements' texts (div, p, span, option) and texts set through
// textContent (merged into the dictionary of i18n.js).
export const MESSAGES_PT = {
  // toasts (web/js/app.js, viewers.js)
  'Use Ctrl+V to paste': 'Use Ctrl+V para colar',
  'Select the top module first': 'Selecione primeiro o módulo de topo',
  // dialogs' titles (app.js, drawings.js, menus.js, wizards.js)
  'Undo / Redo': 'Anular / Refazer', 'Convert to State Machine': 'Converter para Máquina de Estados',
  'Open Project Bundle': 'Abrir Pacote do Projeto', 'Replace Project': 'Substituir Projeto',
  // dialogs' messages (app.js, implement.js, project.js, tbwizard.js, viewers.js, wizards.js)
  'Select a top-level module first.': 'Selecione primeiro um módulo de topo.',
  'Enter a folder path inside the project.': 'Escreva um caminho de pasta dentro do projeto.',
  'A folder cannot be moved into itself.': 'Uma pasta não pode ser movida para dentro de si mesma.',
  'In the browser edition, choose Silinx as the synthesis tool (Project > Design Properties): Synthesize then runs Yosys in the browser, and so does Implement Design.':
    'Na edição para o navegador, escolha o Silinx como ferramenta de síntese (Projeto > Propriedades do Projeto): Sintetizar corre então o Yosys no navegador, e o mesmo faz Implementar o Projeto.',
  'An implementation is running: stop it (or wait for it to finish) first.': 'Está uma implementação em curso: pare-a (ou espere que termine) primeiro.',
  'The project has no design modules to test.': 'O projeto não tem módulos de projeto para testar.',
  'The project has no board. Choose one in Project ▸ Design Properties (e.g. Digilent Basys2).':
    'O projeto não tem placa. Escolha uma em Projeto ▸ Propriedades do Projeto (p. ex. Digilent Basys2).',
  'Select the .zip of the Silinx project.': 'Selecione o .zip do projeto Silinx.',
  // the errors a dialog returns (rename.js, tbwizard.js, tbwizard-vectors.js)
  'Enter a file path inside the project.': 'Escreva um caminho de ficheiro dentro do projeto.',
  'The module name must start with a letter and contain only letters, digits and _.': 'O nome do módulo tem de começar por uma letra e ter só letras, algarismos e _.',
  'Add at least one vector.': 'Acrescente pelo menos um vetor.',
  'Enter a valid test bench name (a letter, then letters, digits and _).': 'Escreva um nome de bancada de teste válido (uma letra, depois letras, algarismos e _).',
  'The clock and the reset must be different ports.': 'O relógio e o reset têm de ser portos diferentes.',
  'The clock period must be at least 2 ns.': 'O período do relógio tem de ser pelo menos 2 ns.',
  'The settling time must be at least 1 ns.': 'O tempo de estabilização tem de ser pelo menos 1 ns.',
  // plain elements' texts and textContent (asm-inspector.js, console.js, impact.js, pinplanner.js, tbwizard*.js)
  'Drag to move them together, or delete them.': 'Arraste para os mover juntos, ou apague-os.',
  'asynchronous': 'assíncrono', 'synchronous': 'síncrono', 'default': 'predefinido', 'No messages.': 'Sem mensagens.',
  '(no board / generic JTAG)': '(sem placa / JTAG genérico)',
  'The wizard writes a self-checking test bench: it applies input vectors to the module and compares its outputs with the expected values, reporting each mismatch and TEST PASSED / TEST FAILED at the end.':
    'O assistente escreve uma bancada de teste que se verifica a si mesma: aplica vetores de entrada ao módulo e compara as suas saídas com os valores esperados, assinalando cada diferença e TEST PASSED / TEST FAILED no fim.',
  'One row per test vector: the inputs to apply and the outputs expected. Fill the expected values in by hand (what the design should do), or take them from a simulation of the current design (it then becomes a regression test: check them).':
    'Uma linha por vetor de teste: as entradas a aplicar e as saídas esperadas. Preencha os valores esperados à mão (o que o projeto deve fazer), ou tire-os de uma simulação do projeto atual (passa então a ser um teste de regressão: verifique-os).',
  'Simulating the current design…': 'A simular o projeto atual…',
  'Expected values filled in from the current design: check them!': 'Valores esperados preenchidos a partir do projeto atual: verifique-os!',
};
