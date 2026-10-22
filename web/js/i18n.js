// Interface internationalisation.
//
// The UI is written in English; this module translates the visible text of the page (text nodes,
// title/placeholder/aria-label attributes, option labels) from per-language dictionaries, and keeps
// translating whatever the app adds later (dialogs, menus, ISim, editors) through a MutationObserver.
// User content is never translated: code editors, the console (tool output), the design hierarchy,
// schematic/waveform drawings and anything inside [data-no-i18n].
//
// Add a language: add an entry to LOCALES ({ name, strings: { "English text": "translation" },
// patterns: [[/regex/, "replacement with $1"]] }). Strings missing from a dictionary stay in English.
// Code can also call t('English text') directly.

import { TT_PT, TT_PT_PATTERNS } from './i18n-truthtable.js';
import { IO_PT, IO_PT_PATTERNS } from './i18n-inout.js';
import { LINT_PT } from './i18n-lint.js';
import { EDITOR_PT, EDITOR_PT_PATTERNS } from './i18n-editor.js';
import { FSM_PT, FSM_PT_PATTERNS } from './i18n-fsm.js';
import { PETRI_PT, PETRI_PT_PATTERNS } from './i18n-petri.js';
import { FPGA_PT, FPGA_PT_PATTERNS } from './i18n-fpga.js';
import { SCH_PT, SCH_PT_PATTERNS } from './i18n-schematic.js';
import { CLOCKING_PT, CLOCKING_PT_PATTERNS } from './i18n-clocking.js';
import { MEMORY_PT, MEMORY_PT_PATTERNS } from './i18n-memory.js';
import { RESOURCES_PT, RESOURCES_PT_PATTERNS } from './i18n-resources.js';

const PT = {
  // the Development menu of a development build (#707)
  'Development': 'Desenvolvimento', 'Features': 'Funcionalidades', 'Bug fixes': 'Correções', 'Other changes': 'Outras alterações',
  'All Changes since the Last Release…': 'Todas as Alterações desde a Última Versão…', 'Changes since the last release': 'Alterações desde a última versão',
  // menus
  'File': 'Ficheiro', 'Edit': 'Editar', 'View': 'Ver', 'Project': 'Projeto', 'Process': 'Processo', 'Tools': 'Ferramentas',
  'Window': 'Janela', 'Help': 'Ajuda', 'Language': 'Idioma',
  'New Project…': 'Novo Projeto…', 'Open Project…': 'Abrir Projeto…', 'Close Project': 'Fechar Projeto',
  'Import Xilinx ISE Project (.zip)…': 'Importar Projeto Xilinx ISE (.zip)…', 'Export Xilinx ISE Project (.zip)…': 'Exportar Projeto Xilinx ISE (.zip)…',
  'Import Silinx ISE Project (.zip)…': 'Importar Projeto Silinx ISE (.zip)…', 'Export Silinx ISE Project (.zip)…': 'Exportar Projeto Silinx ISE (.zip)…',
  'Download Project Bundle…': 'Descarregar Pacote do Projeto…', 'Open Project Bundle…': 'Abrir Pacote do Projeto…',
  // the browser edition: where the projects are kept (in the browser storage, or in a folder on the disk)
  'Open Workspace Folder…': 'Abrir Pasta de Trabalho…', 'Open Workspace Folder': 'Abrir Pasta de Trabalho',
  'Copy Browser Projects to the Folder': 'Copiar os Projetos do Navegador para a Pasta', 'Use Browser Storage': 'Usar o Armazenamento do Navegador',
  'Where Projects Are Kept': 'Onde Ficam os Projetos', 'In this browser\'s storage.': 'No armazenamento deste navegador.',
  'A folder on the disk needs Chrome or Edge.': 'Uma pasta no disco precisa do Chrome ou do Edge.', 'Storage: this browser': 'Armazenamento: este navegador',
  'Projects are kept in a folder on the disk (File > Use Browser Storage to go back)': 'Os projetos ficam numa pasta no disco (Ficheiro > Usar o Armazenamento do Navegador para voltar)',
  'Projects are kept in the browser\'s storage (File > Open Workspace Folder… keeps them in a folder on the disk)': 'Os projetos ficam no armazenamento do navegador (Ficheiro > Abrir Pasta de Trabalho… guarda-os numa pasta no disco)',
  'This browser cannot give a page a folder on the disk (File System Access API: Chrome or Edge); the projects are kept in the browser\'s storage': 'Este navegador não dá a uma página acesso a uma pasta no disco (File System Access API: Chrome ou Edge); os projetos ficam no armazenamento do navegador',
  'New Source…': 'Nova Fonte…', 'Save': 'Guardar', 'Save All': 'Guardar Tudo', 'Recent Projects': 'Projetos Recentes',
  'Undo': 'Anular', 'Redo': 'Refazer', 'Replace…': 'Substituir…', 'Go to Line…': 'Ir para a Linha…',
  'Implementation': 'Implementação', 'Simulation': 'Simulação',
  'Design Summary': 'Resumo do Projeto', 'Add Source…': 'Adicionar Fonte…', 'Add Copy of Source…': 'Adicionar Cópia de Fonte…',
  'Set as Top Module': 'Definir como Módulo de Topo', 'Set as Simulation Top': 'Definir como Topo de Simulação',
  'Design Properties…': 'Propriedades do Projeto…', 'Sync with .xise': 'Sincronizar com .xise',
  'Implement Top Module': 'Implementar Módulo de Topo', 'Run': 'Executar', 'Check Syntax': 'Verificar Sintaxe',
  'Simulate Behavioral Model': 'Simular Modelo Comportamental', 'ASM State Machine Editor…': 'Editor de Máquinas de Estados ASM…',
  'I/O Pin Planning': 'Planeamento de Pinos de E/S', 'iMPACT (Configure Target Device)': 'iMPACT (Configurar Dispositivo)',
  'RTL Schematic': 'Esquemático RTL', 'Toolchain Settings (ISE / Programmers)…': 'Definições da Toolchain (ISE / Programadores)…',
  'Close All Documents': 'Fechar Todos os Documentos', 'Digital design platform for Xilinx FPGAs (Spartan-3/3A/3E/6, Virtex-4/5/6, 7-series with ISE 14.7), made for teaching: mixed VHDL/Verilog projects; schematics with live simulation; FSM and ASM state machine editors; truth tables and Karnaugh maps; module and test bench wizards; behavioural and netlist simulation with waveforms; a board emulator; synthesis, place & route and bitstreams with the Silinx toolchain (the Basys2 and Nexys2 boards) or with ISE 14.7; programming of the FPGA and its Platform Flash, also from the browser over USB.': 'Plataforma de projeto digital para FPGAs Xilinx (Spartan-3/3A/3E/6, Virtex-4/5/6, série 7 com o ISE 14.7), feita para o ensino: projetos VHDL/Verilog mistos; esquemáticos com simulação em tempo real; editores de máquinas de estados FSM e ASM; tabelas de verdade e mapas de Karnaugh; assistentes de módulos e de bancadas de teste; simulação comportamental e de netlist com formas de onda; um emulador da placa; síntese, place & route e bitstreams com a toolchain Silinx (as placas Basys2 e Nexys2) ou com o ISE 14.7; programação da FPGA e da sua Platform Flash, também a partir do browser por USB.', 'Component': 'Componente', ', with an additional permission for elkjs:': ', com uma permissão adicional para o elkjs:', 'This program comes with ABSOLUTELY NO WARRANTY. Source code:': 'Este programa NÃO TEM QUALQUER GARANTIA. Código-fonte:', 'Each keeps its own licence; the full texts are in': 'Cada um mantém a sua própria licença; os textos completos estão em', '. elkjs (EPL-2.0) source code:': '. Código-fonte do elkjs (EPL-2.0):', 'Licence': 'Licença', 'Version': 'Versão', "What's new:": 'Novidades:', 'Undo Remove from Project': 'Anular Remover do Projeto', 'Redo Remove from Project': 'Refazer Remover do Projeto', 'Not in project': 'Fora do projeto', 'Add to Project': 'Acrescentar ao Projeto', 'The example has its own sources.': 'O exemplo tem as suas próprias fontes.', 'No vectors: a test bench skeleton (clock, reset and the module); I will write the stimulus': 'Sem vetores: um esqueleto de bancada de teste (relógio, reset e o módulo); eu escrevo os estímulos', 'Test Benches:': 'Bancadas de Teste:', 'Implementation only': 'Só implementação', 'HDL Module': 'Módulo HDL', 'Test Bench (Wizard)': 'Bancada de Teste (Assistente)', 'New Test Bench (Wizard)…': 'Nova Bancada de Teste (Assistente)…', 'Create Test Bench (Wizard)…': 'Criar Bancada de Teste (Assistente)…', 'Test Bench Wizard': 'Assistente de Bancada de Teste', 'Unit Under Test': 'Unidade em Teste', 'Clock and Reset': 'Relógio e Reset', 'Input Vectors': 'Vetores de Entrada', 'Vectors and Expected Outputs': 'Vetores e Saídas Esperadas', 'Module to test:': 'Módulo a testar:', 'Test bench name:': 'Nome da bancada de teste:', 'Clock port:': 'Porto de relógio:', 'Clock period (ns):': 'Período do relógio (ns):', 'Reset port:': 'Porto de reset:', 'Reset level:': 'Nível do reset:', 'Reset for (clock cycles):': 'Reset durante (ciclos de relógio):', 'Settling time (ns):': 'Tempo de estabilização (ns):', 'Number of vectors:': 'Número de vetores:', 'Random seed:': 'Semente aleatória:', 'Fill Expected from Current Design': 'Preencher Esperados a partir do Projeto Atual', 'Clear Expected': 'Limpar Esperados', 'Add Vector': 'Adicionar Vetor', 'input': 'entrada', 'expected output': 'saída esperada', 'Delete this vector': 'Apagar este vetor', 'Every combination of the inputs (exhaustive test)': 'Todas as combinações das entradas (teste exaustivo)', 'Random vectors': 'Vetores aleatórios', 'Counting (all inputs as one number: 0, 1, 2, …)': 'Contagem (todas as entradas como um número: 0, 1, 2, …)', 'Walking ones and zeros (all 0, all 1, then one bit at a time)': 'Uns e zeros deslizantes (tudo a 0, tudo a 1, depois um bit de cada vez)', 'I will type the vectors in (starts with one empty vector)': 'Vou escrever os vetores (começa com um vetor vazio)', 'Rename Folder…': 'Mudar o Nome da Pasta…', 'Delete Folder…': 'Apagar Pasta…', 'Rename Folder': 'Mudar o Nome da Pasta', 'Delete Folder': 'Apagar Pasta', 'About Silinx ISE': 'Acerca do Silinx ISE', 'Tell Us Who You Are…': 'Diga-nos Quem É…', 'Tell Us Who You Are': 'Diga-nos Quem É', 'Tell us who you are': 'Diga-nos quem é', 'Who is using Silinx ISE? (GitHub Discussions)': 'Quem usa o Silinx ISE? (GitHub Discussions)',
  'Using Silinx in a course?': 'Usa o Silinx numa disciplina?', 'Usage counts:': 'Contagem de utilização:',
  'This page counts its visits and what is used (a new project, a simulation, a bitstream…) with': 'Esta página conta as visitas e o que é usado (um projeto novo, uma simulação, um bitstream…) com o',
  ': no cookies, no personal data, never the content of a project.': ': sem cookies, sem dados pessoais, nunca o conteúdo de um projeto.',
  'None: this copy sends nothing.': 'Nenhuma: esta cópia não envia nada.',
  // the start-up check for updates and its setting (#488)
  'Check for Updates at Start-up': 'Procurar Atualizações no Arranque', 'Update check:': 'Procura de atualizações:',
  'At start-up, the latest release is asked of GitHub (api.github.com and raw.githubusercontent.com, at most once an hour): the version only, nothing about you or your projects; the published site asks only itself. Help > Check for Updates at Start-up turns it off.':
    'No arranque, a última versão é pedida ao GitHub (api.github.com e raw.githubusercontent.com, no máximo uma vez por hora): só a versão, nada sobre si ou sobre os seus projetos; o site publicado só pergunta a si próprio. Ajuda > Procurar Atualizações no Arranque desliga-a.',
  'Off: nothing is asked at start-up. Help > Check for Updates… checks by hand; Help > Check for Updates at Start-up turns it on again.':
    'Desligada: nada é pedido no arranque. Ajuda > Procurar Atualizações… procura manualmente; Ajuda > Procurar Atualizações no Arranque volta a ligá-la.',
  'Check for updates at start-up on: the latest release is asked of GitHub when the app starts': 'Procura de atualizações no arranque ligada: a última versão é pedida ao GitHub quando a aplicação arranca',
  'Check for updates at start-up off: Help > Check for Updates… checks by hand': 'Procura de atualizações no arranque desligada: Ajuda > Procurar Atualizações… procura manualmente',
  'Only the site (pmnmalo.github.io/Silinx-ISE) counts its visits, with': 'Só o site (pmnmalo.github.io/Silinx-ISE) conta as visitas, com o',
  '(no cookies, no personal data).': '(sem cookies nem dados pessoais).',
  'Silinx ISE is free and asks for nothing. If you use it, in a course, a school or on your own, we would like to know: it helps to decide what to improve.': 'O Silinx ISE é gratuito e não pede nada. Se o usa, numa disciplina, numa escola ou por conta própria, gostávamos de saber: ajuda a decidir o que melhorar.',
  'Say hello on GitHub Discussions (a GitHub account is needed): your school or course, your role (teacher, student…), the boards you use. Only what you write there is seen.': 'Deixe uma mensagem no GitHub Discussions (é preciso uma conta GitHub): a sua escola ou disciplina, o seu papel (professor, estudante…), as placas que usa. Só se vê o que escrever lá.', 'Keyboard Shortcuts': 'Atalhos de Teclado',
  'Close': 'Fechar', 'Close Others': 'Fechar Outros', 'Close All': 'Fechar Todos', 'Open': 'Abrir', 'Remove from Project': 'Remover do Projeto',
  'Source Properties…': 'Propriedades da Fonte…', 'Rerun': 'Executar Novamente', 'Stop': 'Parar', 'Schematic': 'Esquemático', 'View/Edit Schematic': 'Ver/Editar Esquemático', '⬆ Up': '⬆ Subir', '⬇ Push into': '⬇ Entrar', 'Up to the parent module (Backspace)': 'Subir para o módulo pai (Backspace)', 'Push into the selected instance (Enter, or double-click it)': 'Entrar na instância selecionada (Enter, ou duplo clique)', 'Rename…': 'Mudar o Nome…', 'File name follows the module name': 'O nome do ficheiro acompanha o nome do módulo', 'Rename': 'Mudar o Nome', 'Entity:': 'Entidade:', 'Convert to State Machine (ASM)…': 'Converter para Máquina de Estados (ASM)…', 'Open State Machine': 'Abrir Máquina de Estados', 'Check Constraints': 'Verificar Restrições', 'Export as ISE Schematic (.sch)…': 'Exportar como Esquemático ISE (.sch)…', 'Check Syntax of this file': 'Verificar a sintaxe deste ficheiro', ' Check Syntax': ' Verificar Sintaxe', 'Toggle Comment': 'Comentar/Descomentar', 'Find…': 'Procurar…', 'Language Templates': 'Modelos de Linguagem', 'Instantiate module': 'Instanciar módulo', 'Open Schematic': 'Abrir Esquemático', 'Select All': 'Selecionar Tudo', 'RTL Schematic (read-only)': 'Esquemático RTL (só de leitura)', 'Open this instance': 'Abrir esta instância', 'Read-only view. Drag on empty space to select, double-click a module to open it, wheel to zoom.': 'Vista só de leitura. Arraste numa área vazia para selecionar, duplo-clique num módulo para o abrir, roda para zoom.', 'Convert to Schematic (editable)…': 'Converter para Esquemático (editável)…', 'An implementation is already running (use Stop to cancel it)': 'Já está uma implementação em curso (use Parar para a cancelar)', 'Stop the running process': 'Parar o processo em curso', 'No process is running': 'Nenhum processo em curso', 'Process Properties…': 'Propriedades do Processo…',
  // the Design tree: a module's views as badges (#207)
  // I/O Pin Planning without its top (#253)
  'Set the top module (a module\'s right-click menu: Set as Top Module), then open I/O Pin Planning again.': 'Defina o módulo de topo (no menu do botão direito de um módulo: Definir como Módulo de Topo) e abra de novo o Planeamento de Pinos de E/S.',
  'Correct its errors (Check Syntax), then open I/O Pin Planning again.': 'Corrija os seus erros (Verificar Sintaxe) e abra de novo o Planeamento de Pinos de E/S.',
  'Another module becomes the top with Set as Top Module (its right-click menu).': 'Outro módulo passa a ser o de topo com Definir como Módulo de Topo (no seu menu do botão direito).',
  'Table': 'Tabela', 'Base: its HDL is generated from it': 'Base: o seu HDL é gerado a partir daqui',
  'Generated from the schematic': 'Gerado a partir do esquemático', 'Generated from the state machine': 'Gerado a partir da máquina de estados',
  'Generated from the state diagram': 'Gerado a partir do diagrama de estados', 'Generated from the truth table': 'Gerado a partir da tabela de verdade',
  'Generated from the Petri net': 'Gerado a partir da rede de Petri',
  // a drawing without its HDL file, a file in the way (#230)
  'No HDL': 'Sem HDL', 'Generate HDL File…': 'Gerar Ficheiro HDL…', 'Generate HDL File': 'Gerar Ficheiro HDL',
  'Design hierarchy': 'Hierarquia do projeto',
  // toolbar / panels
  'New Project': 'Novo Projeto', 'Open Project': 'Abrir Projeto', 'Save (Ctrl+S)': 'Guardar (Ctrl+S)', 'Cut': 'Cortar', 'Copy': 'Copiar',
  'Paste': 'Colar', 'Find': 'Procurar', 'View RTL Schematic': 'Ver Esquemático RTL', 'New ASM State Diagram': 'Novo Diagrama de Estados ASM',
  'Configure Target Device (iMPACT)': 'Configurar Dispositivo (iMPACT)', 'Toolchain Settings': 'Definições da Toolchain', 'About': 'Acerca de',
  // narrow screens (#266): the drawer of the left side, the editors' panels over the canvas
  'Show / hide the side panel (Design, Files, Processes)': 'Mostrar / esconder o painel lateral (Projeto, Ficheiros, Processos)',
  '☰ Properties': '☰ Propriedades', 'Show / hide the properties panel': 'Mostrar / esconder o painel das propriedades',
  '☰ Symbols': '☰ Símbolos', 'Show / hide the symbols panel': 'Mostrar / esconder o painel dos símbolos',
  'Design': 'Projeto', 'View:': 'Vista:','Hierarchy': 'Hierarquia', 'Processes:': 'Processos:', 'Start': 'Início', 'Files': 'Ficheiros',
  'Libraries': 'Bibliotecas', 'Console': 'Consola', 'Errors': 'Erros', 'Warnings': 'Avisos', 'Ready': 'Pronto', 'Clear': 'Limpar',
  'Project Commands': 'Comandos do Projeto', 'No projects yet.': 'Ainda não há projetos.',
  'File Name': 'Nome do Ficheiro', 'Association': 'Associação', 'Behavioral': 'Comportamental',
  // processes
  'Design Summary/Reports': 'Resumo do Projeto/Relatórios', 'Design Utilities': 'Utilitários de Projeto',
  'View HDL Instantiation Template': 'Ver Modelo de Instanciação HDL', 'User Constraints': 'Restrições do Utilizador',
  'Edit Constraints (Text)': 'Editar Restrições (Texto)', 'Synthesize - XST': 'Sintetizar - XST', 'Synthesize - Yosys (open)': 'Sintetizar - Yosys (aberto)', 'Implement Design': 'Implementar Projeto',
  'Translate': 'Traduzir', 'Map': 'Mapear', 'Place & Route': 'Posicionar e Encaminhar', 'Generate Programming File': 'Gerar Ficheiro de Programação',
  'Configure Target Device': 'Configurar Dispositivo', 'Manage Configuration Project (iMPACT)': 'Gerir Projeto de Configuração (iMPACT)',
  'SSim Simulator': 'Simulador SSim', 'Behavioral Check Syntax': 'Verificar Sintaxe (Comportamental)',
  'View/Edit State Diagram (ASM)': 'Ver/Editar Diagrama de Estados (ASM)', 'No processes for the selected item': 'Sem processos para o item selecionado',
  // dialogs & wizards
  'Cancel': 'Cancelar', 'Yes': 'Sim', 'No': 'Não', 'Next >': 'Seguinte >', '< Back': '< Anterior', 'Finish': 'Concluir', 'Import': 'Importar',
  'New Project Wizard': 'Assistente de Novo Projeto', 'Create New Project': 'Criar Novo Projeto', 'Project Settings': 'Definições do Projeto',
  'Project Summary': 'Resumo do Projeto', 'Enter a name and location for the project.': 'Indique um nome e uma localização para o projeto.',
  'Name:': 'Nome:', 'Location:': 'Localização:', 'Top-level source type:': 'Tipo de fonte de topo:', 'Start from:': 'Começar a partir de:',
  'Empty project': 'Projeto vazio', "Projects are kept in this browser's storage (File ▸ Open Workspace Folder… keeps them in a folder on the disk).": 'Os projetos ficam guardados neste browser (File ▸ Open Workspace Folder… guarda-os numa pasta do disco).', "Projects are kept in this browser's storage (a folder on the disk needs Chrome or Edge).": 'Os projetos ficam guardados neste browser (uma pasta do disco precisa do Chrome ou do Edge).', 'Projects are stored in the Silinx workspace folder (default ~/Silinx-projects).': 'Os projetos são guardados na pasta de trabalho do Silinx (por omissão ~/Silinx-projects).',
  'Select the device and design flow for the project.': 'Selecione o dispositivo e o fluxo de projeto.',
  'Evaluation Development Board:': 'Placa de Desenvolvimento:', 'Product Category:': 'Categoria de Produto:', 'Family:': 'Família:',
  'Device:': 'Dispositivo:', 'Package:': 'Encapsulamento:', 'Speed:': 'Velocidade:', 'Top-Level Source Type:': 'Tipo de Fonte de Topo:',
  'Synthesis Tool:': 'Ferramenta de Síntese:', 'Silinx (VHDL/Verilog; no ISE needed)': 'Silinx (VHDL/Verilog; sem o ISE)', 'XST (VHDL/Verilog; Xilinx ISE)': 'XST (VHDL/Verilog; Xilinx ISE)', 'SSim (VHDL/Verilog; Silinx Simulator)': 'SSim (VHDL/Verilog; Simulador Silinx)', 'Simulator:': 'Simulador:', 'Preferred Language:': 'Linguagem Preferida:',
  'VHDL Source Analysis Standard:': 'Norma de Análise VHDL:', 'None Specified': 'Nenhuma', 'All': 'Todas',
  'Project name must start with a letter and contain only letters, digits and _.': 'O nome do projeto deve começar por uma letra e conter apenas letras, dígitos e _.',
  'No projects found in the workspace.': 'Não foram encontrados projetos na pasta de trabalho.',
  'Import Xilinx ISE Project': 'Importar Projeto Xilinx ISE', 'Export Xilinx ISE Project': 'Exportar Projeto Xilinx ISE',
  'Import Silinx ISE Project': 'Importar Projeto Silinx ISE', 'Export Silinx ISE Project': 'Exportar Projeto Silinx ISE', 'File(s):': 'Ficheiro(s):', 'Project name:': 'Nome do projeto:',
  'Select a .zip of the ISE project folder (the .xise and its sources — e.g. one exported with File ▸ Export Xilinx ISE Project).': 'Selecione um .zip da pasta do projeto ISE (o .xise e as suas fontes — p. ex. um exportado com Ficheiro ▸ Exportar Projeto Xilinx ISE).',
  'Select a .zip (or a .xise with its sources).': 'Selecione um .zip (ou um .xise com as suas fontes).',
  'Project folder:': 'Pasta do projeto:', 'or .zip / .xise file(s):': 'ou ficheiro(s) .zip / .xise:',
  'Select the project folder, a .zip, or a .xise with its sources.': 'Selecione a pasta do projeto, um .zip, ou um .xise com as suas fontes.',
  'ISE output files in the folder (xst, _ngo, netlists, bitstreams, logs) are not imported.': 'Os ficheiros gerados pelo ISE na pasta (xst, _ngo, netlists, bitstreams, logs) não são importados.',
  'Import an ISE project from its folder (the folder with the .xise file), or from a .zip of that folder (e.g. one exported with File ▸ Export Xilinx ISE Project).': 'Importe um projeto ISE a partir da sua pasta (a pasta com o ficheiro .xise), ou de um .zip dessa pasta (p. ex. um exportado com Ficheiro ▸ Exportar Projeto Xilinx ISE).',
  'New Source Wizard': 'Assistente de Nova Fonte', 'Select Source Type': 'Selecionar Tipo de Fonte', 'File Name and Location': 'Nome do Ficheiro e Localização', 'Source type:': 'Tipo de fonte:', 'Select the type of the new source; its name and location come next.': 'Selecione o tipo da nova fonte; o nome e a localização vêm a seguir.', 'File name:': 'Nome do ficheiro:',
  'Add to project': 'Adicionar ao projeto', 'Define Module': 'Definir Módulo', 'Entity / Module name:': 'Nome da entidade / módulo:',
  'Architecture name:': 'Nome da arquitetura:', 'Port Name': 'Nome do Porto', 'Direction': 'Direção', 'Associate Source': 'Associar Fonte',
  'Select the source (Unit Under Test) to associate with the new test bench.': 'Selecione a fonte (Unidade em Teste) a associar ao novo test bench.',
  'Summary': 'Resumo', 'Options': 'Opções', 'VHDL Module': 'Módulo VHDL', 'Verilog Module': 'Módulo Verilog', 'VHDL Test Bench': 'Test Bench VHDL',
  'Verilog Test Fixture': 'Test Fixture Verilog', 'VHDL Package': 'Pacote VHDL', 'ASM State Diagram (State Machine)': 'Diagrama de Estados ASM (Máquina de Estados)',
  'Implementation Constraints File': 'Ficheiro de Restrições de Implementação', 'Memory Initialization File (.mem)': 'Ficheiro de Inicialização de Memória (.mem)',
  'Enter a valid file name (letters, digits, _ and -).': 'Indique um nome de ficheiro válido (letras, dígitos, _ e -).', 'Invalid location.': 'Localização inválida.',
  'Invalid module name.': 'Nome de módulo inválido.', 'Duplicate port names.': 'Nomes de portos repetidos.', 'Select a module.': 'Selecione um módulo.',
  'No design modules in the project.': 'Não há módulos de projeto.', 'Add Source': 'Adicionar Fonte', 'Add Copy of Source': 'Adicionar Cópia de Fonte', 'Project:': 'Projeto:', 'Check for Updates…': 'Procurar Atualizações…', 'Emulate on Board (RTL)': 'Emular na Placa (RTL)', 'Emulate on Board': 'Emular na Placa', 'Emulate Behavioral Model (RTL)': 'Emular Modelo Comportamental (RTL)',
  'Emulate Post-Synthesis Model': 'Emular Modelo Pós-Síntese', 'Emulate Post-Translate Model': 'Emular Modelo Pós-Translate',
  'Emulate Post-Map Model': 'Emular Modelo Pós-Map', 'Emulate Post-Place & Route Model': 'Emular Modelo Pós-Place & Route',
  'View Technology Schematic': 'Ver Esquemático Tecnológico',
  'Technology Schematic (read-only): the post-synthesis netlist': 'Esquemático Tecnológico (só de leitura): a netlist pós-síntese', 'LUT function (INIT)': 'Função do LUT (INIT)',
  'Generate Post-Synthesis Simulation Model': 'Gerar Modelo de Simulação Pós-Síntese', 'Generate Post-Translate Simulation Model': 'Gerar Modelo de Simulação Pós-Translate',
  'Generate Post-Map Simulation Model': 'Gerar Modelo de Simulação Pós-Map', 'Generate Post-Place & Route Simulation Model': 'Gerar Modelo de Simulação Pós-Place & Route',
  'Generate Post-Place & Route Static Timing': 'Gerar Análise Temporal Estática Pós-Place & Route', 'Generate Text Power Report': 'Gerar Relatório de Consumo (Texto)',
  'Back-annotate Pin Locations': 'Anotar a Localização dos Pinos',
  'Simulate Post-Synthesis Model': 'Simular Modelo Pós-Síntese', 'Simulate Post-Translate Model': 'Simular Modelo Pós-Translate',
  'Simulate Post-Map Model': 'Simular Modelo Pós-Map', 'Simulate Post-Place & Route Model': 'Simular Modelo Pós-Place & Route', 'Board Emulator': 'Emulador da Placa', 'Check for Updates': 'Procurar Atualizações', 'Developers:': 'Programadores:', 'developed with Claude (Anthropic)': 'desenvolvido com Claude (Anthropic)', 'Silinx ISE was developed for educational purposes, specifically to support the teaching of Digital Systems, because AMD/Xilinx discontinued support for Xilinx ISE a long time ago.': 'O Silinx ISE foi desenvolvido para fins educativos, especificamente para apoiar o ensino de Sistemas Digitais, porque a AMD/Xilinx descontinuou o suporte ao Xilinx ISE há muito tempo.', 'Files:': 'Ficheiros:', 'Association:': 'Associação:',
  'All (Implementation + Simulation)': 'Todas (Implementação + Simulação)', 'Simulation only': 'Só simulação', 'File:': 'Ficheiro:', 'Language:': 'Linguagem:',
  'View Association:': 'Associação de Vista:', 'Design Properties': 'Propriedades do Projeto', 'Top Module (implementation):': 'Módulo de Topo (implementação):',
  'Top Module (simulation):': 'Módulo de Topo (simulação):', 'Optimization Goal:': 'Objetivo de Otimização:', 'Optimization Effort:': 'Esforço de Otimização:',
  'Silinx toolchain: Optimization Effort Normal synthesizes once, fast, and tries the mappings for speed only on a design limited by its logic depth or with wide multiplexers; High tries them on every design (a slower synthesis, a circuit about 5-10 % faster).': 'Toolchain Silinx: o Esforço de Otimização Normal sintetiza uma vez, depressa, e só experimenta os mapeamentos para velocidade num desenho limitado pela sua profundidade lógica ou com multiplexadores largos; Alto experimenta-os em todos os desenhos (uma síntese mais lenta, um circuito cerca de 5-10 % mais rápido).',
  'FPGA Start-Up Clock:': 'Relógio de Arranque da FPGA:', 'Speed': 'Velocidade', 'Area': 'Área', 'High': 'Alto', 'Normal': 'Normal',
  'JTAG Clock': 'Relógio JTAG', 'User Clock': 'Relógio do Utilizador', 'Process Properties - Synthesis / Implementation / Bitstream': 'Propriedades do Processo - Síntese / Implementação / Bitstream',
  'Execution mode:': 'Modo de execução:', 'Local (Xilinx ISE installed locally)': 'Local (Xilinx ISE instalado localmente)',
  'Docker image with Xilinx ISE': 'Imagem Docker com Xilinx ISE', 'Remote host with Xilinx ISE via SSH': 'Máquina remota com Xilinx ISE por SSH',
  'ISE settings64.sh:': 'settings64.sh do ISE:', 'Docker image:': 'Imagem Docker:', 'Host:': 'Servidor:', 'User:': 'Utilizador:', 'Port:': 'Porto:',
  'Remote build dir:': 'Pasta remota de build:', 'Remote settings64.sh:': 'settings64.sh remoto:', 'Docker image on the remote host:': 'Imagem Docker na máquina remota:', 'none: ISE installed on the host': 'nenhuma: ISE instalado na máquina', 'Programmer tool:': 'Ferramenta de programação:',
  'Cable:': 'Cabo:', 'Detecting the toolchain (Xilinx ISE, the device programmers)…': 'A detetar a toolchain (Xilinx ISE, os programadores de dispositivos)…', 'Device programmers': 'Programadores de dispositivos', 'Tool': 'Ferramenta', 'Location': 'Localização',
  'Board default': 'Predefinição da placa', 'board default': 'predefinição da placa', 'Save Changes': 'Guardar Alterações', 'Set Top Module': 'Definir Módulo de Topo',
  'Remove Source': 'Remover Fonte', 'Update Constraints': 'Atualizar Restrições', 'Constraints do not match the board': 'As restrições não correspondem à placa',
  'Version 0.1': 'Versão 0.1',
  // design summary
  'Project File:': 'Ficheiro do Projeto:', 'Module Name:': 'Nome do Módulo:', 'Target Device:': 'Dispositivo Alvo:', 'Board:': 'Placa:',
  'Product Version:': 'Versão do Produto:', 'Design Goal:': 'Objetivo do Projeto:', 'Parser Errors:': 'Erros de Análise:',
  'Implementation State:': 'Estado da Implementação:', 'Warnings:': 'Avisos:', 'Simulation Top:': 'Topo de Simulação:', 'Constraints:': 'Restrições:',
  'Sources:': 'Fontes:', 'No Errors': 'Sem Erros', 'No Warnings': 'Sem Avisos', 'New': 'Novo', 'Synthesized': 'Sintetizado', 'Mapped': 'Mapeado',
  'Placed and Routed': 'Posicionado e Encaminhado', 'Programming File Generated': 'Ficheiro de Programação Gerado',
  'Device Utilization Summary': 'Resumo da Utilização do Dispositivo', 'Logic Utilization': 'Utilização Lógica', 'Used': 'Usado',
  'Available': 'Disponível', 'Utilization': 'Utilização', 'Timing (post Place & Route)': 'Temporização (após Posicionar e Encaminhar)',
  'Timing Constraints': 'Restrições de Temporização', 'All constraints met': 'Todas as restrições cumpridas', 'Minimum period': 'Período mínimo',
  'Programming File': 'Ficheiro de Programação', 'Bitstream': 'Bitstream', 'Part': 'Componente', 'Generated': 'Gerado', 'Detailed Reports': 'Relatórios Detalhados',
  'Report Name': 'Nome do Relatório', 'Status': 'Estado', 'Synthesis Report': 'Relatório de Síntese', 'Map Report': 'Relatório de Mapeamento',
  'Place and Route Report': 'Relatório de Posicionamento e Encaminhamento', 'Post-PAR Static Timing Report': 'Relatório de Temporização Estática pós-PAR',
  'Bitgen Report': 'Relatório do Bitgen', 'Current': 'Atual', '(not set)': '(não definido)', '(none)': '(nenhum)',
  // pin planner
  'Save Constraints': 'Guardar Restrições', 'Auto-assign from Board': 'Atribuir Automaticamente pela Placa', 'Clear All': 'Limpar Tudo',
  'I/O Name': 'Nome de E/S', 'Board Resource': 'Recurso da Placa', 'Site (LOC)': 'Pino (LOC)', 'I/O Std.': 'Norma de E/S', 'Drive': 'Corrente',
  'Slew': 'Slew', 'Pull': 'Pull', 'Clock period (ns)': 'Período do relógio (ns)', 'Input': 'Entrada', 'Output': 'Saída', 'Bidir': 'Bidir.',
  'Select a board in Design Properties': 'Selecione uma placa nas Propriedades do Projeto',
  'Match port names with board resources (clk, led, sw, btn, seg, an…)': 'Associar nomes de portos aos recursos da placa (clk, led, sw, btn, seg, an…)',
  'No board selected. Choose one in Project ▸ Design Properties to see the board resources and auto-assign pins.': 'Nenhuma placa selecionada. Escolha uma em Projeto ▸ Propriedades do Projeto para ver os recursos da placa e atribuir pinos automaticamente.',
  // iMPACT
  'Programming tool:': 'Ferramenta de programação:', 'Programmer:': 'Programador:', 'Choose .bit…': 'Escolher .bit…', 'Configuration file (.bit):': 'Ficheiro de configuração (.bit):',
  'Initialize Chain (Scan)': 'Inicializar Cadeia (Scan)', 'Program FPGA': 'Programar FPGA', 'Program PROM': 'Programar PROM', 'Verify': 'Verificar',
  'Erase': 'Apagar', 'Back up PROM': 'Copiar PROM', 'Reload FPGA from PROM': 'Recarregar FPGA a partir da PROM',
  'Verify after programming': 'Verificar após programar', 'Reload the FPGA from the PROM afterwards (mode jumper on ROM)': 'Recarregar a FPGA a partir da PROM no fim (jumper de modo em ROM)',
  'Loads the FPGA directly (volatile: lost at power-off). Select the PROM in the chain to store the design in flash.': 'Carrega a FPGA diretamente (volátil: perde-se ao desligar). Selecione a PROM na cadeia para guardar o projeto na flash.',
  'Program': 'Programar', 'Erase PROM': 'Apagar PROM', 'No board selected: choose the programming tool and cable explicitly.': 'Nenhuma placa selecionada: escolha a ferramenta e o cabo de programação.',
  'Another operation is running': 'Outra operação está em curso', 'Failed — see console': 'Falhou — ver consola', 'Scan finished.': 'Scan concluído.',
  // editor
  'Templates ▾': 'Modelos ▾', 'Find (Ctrl+F)': 'Procurar (Ctrl+F)', 'Auto-complete': 'Completar automaticamente',
  'Toggle comment': 'Comentar/descomentar', 'Find / Replace': 'Procurar / Substituir', 'Go to line': 'Ir para a linha', 'Go to definition': 'Ir para a definição',
  'Fold block': 'Dobrar bloco', 'Run process': 'Executar processo', 'Push into instance': 'Entrar na instância',
  'Double-click process': 'Duplo clique num processo', 'Double-click instance (schematic)': 'Duplo clique numa instância (esquemático)',
  // ISim
  'Instances and Processes': 'Instâncias e Processos', 'Objects': 'Objetos', 'Object Name': 'Nome do Objeto', 'Value': 'Valor', 'Data Type': 'Tipo de Dados',
  'Name': 'Nome', 'Restart': 'Reiniciar', 'Run All': 'Executar Tudo', 'Break': 'Parar', 'Run for the specified time': 'Executar durante o tempo indicado',
  'Step (advance to the next scheduled event)': 'Passo (avançar para o próximo evento)', 'Zoom In': 'Ampliar', 'Zoom Out': 'Reduzir',
  'Zoom to Full View': 'Ver Tudo', 'Go to Time 0': 'Ir para o Tempo 0', 'Go to Latest Time': 'Ir para o Último Tempo',
  'Previous Transition (selected signal)': 'Transição Anterior (sinal selecionado)', 'Next Transition (selected signal)': 'Transição Seguinte (sinal selecionado)',
  'Add Marker at Cursor': 'Adicionar Marcador no Cursor', 'Add Marker at cursor': 'Adicionar marcador no cursor', 'Add Marker Here': 'Adicionar Marcador Aqui',
  'Delete Marker': 'Apagar Marcador', 'Delete All Markers': 'Apagar Todos os Marcadores', 'Radix': 'Base', 'Radix of selected signals': 'Base dos sinais selecionados',
  'Default': 'Predefinida', 'Binary': 'Binário', 'Hexadecimal': 'Hexadecimal', 'Octal': 'Octal', 'Unsigned Decimal': 'Decimal sem Sinal',
  'Signed Decimal': 'Decimal com Sinal', 'Decimal': 'Decimal', 'Export waveform as VCD': 'Exportar formas de onda como VCD',
  'Add to Wave Window': 'Adicionar à Janela de Formas de Onda', 'Add to Wave Window (Recursive)': 'Adicionar à Janela de Formas de Onda (Recursivo)',
  'Show in wave window': 'Mostrar na janela de formas de onda', 'Force Constant...': 'Forçar Constante...', 'Force Clock...': 'Forçar Relógio...',
  'Remove Force': 'Remover Forçamento', 'Force Selected Signal': 'Forçar Sinal Selecionado', 'Define Clock': 'Definir Relógio', 'Signal Name:': 'Nome do Sinal:',
  'Force to Value:': 'Forçar para o Valor:', 'Value Radix:': 'Base do Valor:', 'Starting at Time Offset:': 'A partir do Tempo:',
  'Cancel after Time Offset:': 'Cancelar após o Tempo:', 'Leading Edge Value:': 'Valor do Flanco Inicial:', 'Trailing Edge Value:': 'Valor do Flanco Final:',
  'Period:': 'Período:', 'Duty Cycle (%):': 'Ciclo de Trabalho (%):', 'Apply': 'Aplicar', 'Expand Bus': 'Expandir Barramento', 'Collapse Bus': 'Recolher Barramento',
  'New Divider': 'Novo Divisor', 'Rename Divider...': 'Mudar Nome do Divisor...', 'Divider name:': 'Nome do divisor:',
  'New Group': 'Novo Grupo', 'Rename Group...': 'Mudar Nome do Grupo...', 'Ungroup': 'Desagrupar', 'Group name:': 'Nome do grupo:', 'Delete': 'Apagar', 'Copy Path': 'Copiar Caminho',
  'Go To Source Code': 'Ir para o Código-Fonte', 'Type a command (help)': 'Escreva um comando (help)', 'Simulation run time': 'Tempo de simulação',
  'Time unit': 'Unidade de tempo', 'Zoom level': 'Nível de zoom', 'Select a signal in the wave window first': 'Selecione primeiro um sinal na janela de formas de onda',
  'No more transitions': 'Não há mais transições', 'No more events scheduled': 'Não há mais eventos agendados',
  'Specify the value to force the selected signal to.': 'Indique o valor a forçar no sinal selecionado.',
  'Specify the properties of the clock to be applied to the selected signal.': 'Indique as propriedades do relógio a aplicar ao sinal selecionado.',
  // the stimuli drawn on the waveforms (#336)
  'Edit Stimuli: click the waveforms of the inputs (as the HDL Bencher)': 'Editar Estímulos: clique nas formas de onda das entradas (como no HDL Bencher)',
  'Edit Stimuli': 'Editar Estímulos', 'Stimuli': 'Estímulos', 'Timing…': 'Temporização…', 'Fill Expected Outputs': 'Preencher Saídas Esperadas', 'Save as Test Bench…': 'Guardar como Bancada de Teste…',
  'Stop Editing': 'Terminar a Edição', 'Stimulus Timing': 'Temporização dos Estímulos', 'None (combinational)': 'Nenhum (combinatório)',
  'Clock Period (ns):': 'Período do Relógio (ns):', 'Time Step (ns):': 'Passo de Tempo (ns):', 'Cycles:': 'Ciclos:', 'Input Value': 'Valor da Entrada',
  'Expected Value': 'Valor Esperado', 'From Cycle:': 'A partir do Ciclo:', 'Value:': 'Valor:', 'Save as Test Bench': 'Guardar como Bancada de Teste',
  'Bits, most significant first (0 1 Z X), h… hexadecimal or d… decimal; it holds up to the next change.': 'Bits, o mais significativo primeiro (0 1 Z X), h… hexadecimal ou d… decimal; mantém-se até à mudança seguinte.',
  'Bits, most significant first (0 1, - not checked), h… hexadecimal or d… decimal; - alone: not checked.': 'Bits, o mais significativo primeiro (0 1, - não verificado), h… hexadecimal ou d… decimal; - sozinho: não verificado.',
  'Expand the bus to change one of its bits: a click on its wave, as on a 1-bit signal.': 'Expanda o barramento para mudar um dos seus bits: um clique na sua onda, como num sinal de 1 bit.',
  // schematic viewer
  'Zoom In (+)': 'Ampliar (+)', 'Zoom Out (−)': 'Reduzir (−)', 'Zoom to Full View (F)': 'Ver Tudo (F)', 'Up one level (Backspace)': 'Subir um nível (Backspace)',
  'Empty schematic — this unit has no ports, logic or instances.': 'Esquemático vazio — esta unidade não tem portos, lógica nem instâncias.',
  'Input port': 'Porto de entrada', 'Output port': 'Porto de saída', 'Bidirectional port': 'Porto bidirecional', 'Clocked process': 'Processo síncrono',
  'Combinational logic': 'Lógica combinatória', 'Testbench process': 'Processo de testbench', 'Black box (module not found)': 'Caixa negra (módulo não encontrado)',
  'Instance': 'Instância', 'Constant': 'Constante', 'Net (driven elsewhere)': 'Ligação (excitada noutro sítio)',
  // ASM editor
  'State': 'Estado', 'Decision': 'Decisão', 'Cond. output': 'Saída cond.', 'Arrange': 'Organizar', 'Fit': 'Ajustar', '✓ Validate': '✓ Validar',
  'Add state box (rectangle)': 'Adicionar caixa de estado (retângulo)', 'Add decision box (diamond)': 'Adicionar caixa de decisão (losango)',
  'Add conditional output box (oval)': 'Adicionar caixa de saída condicional (oval)', 'Delete selection': 'Apagar seleção', 'Automatic top-down layout': 'Disposição automática de cima para baixo',
  'Toggle snapping to the grid': 'Ativar/desativar alinhamento à grelha', 'Fit the chart in the window': 'Ajustar o diagrama à janela',
  'Check the chart for errors': 'Verificar erros no diagrama',
  'Show / hide the generated HDL preview': 'Mostrar / ocultar a pré-visualização do HDL gerado', 'Selection': 'Seleção', 'Machine': 'Máquina',
  'Module / entity name': 'Nome do módulo / entidade', 'HDL language': 'Linguagem HDL', 'State encoding': 'Codificação de estados', 'Clock': 'Relógio',
  'Reset': 'Reset', 'Reset level': 'Nível do reset', 'Reset type': 'Tipo de reset', 'Initial state': 'Estado inicial', 'Inputs': 'Entradas', 'Inverted inputs': 'Entradas invertidas', 'Outputs': 'Saídas',
  'Width': 'Largura', 'empty: the width of its net': 'vazia: a largura da sua rede', 'Registered': 'Registada', 'Condition': 'Condição', 'Problems': 'Problemas', 'No problems found': 'Nenhum problema encontrado',
  'Moore outputs (one per line)': 'Saídas de Moore (uma por linha)', 'Mealy outputs (one per line)': 'Saídas de Mealy (uma por linha)',
  'Make this the initial (reset) state': 'Tornar este o estado inicial (reset)', 'Initial (reset) state': 'Estado inicial (reset)',
  'Exchange the true and false branches': 'Trocar os ramos verdadeiro e falso', 'Swap 1 / 0 exits': 'Trocar saídas 1 / 0', 'Delete box': 'Apagar caixa',
  'Delete connection': 'Apagar ligação', 'Reset route': 'Repor percurso', 'Use automatic routing': 'Usar encaminhamento automático',
  'State: name + Moore outputs': 'Estado: nome + saídas de Moore', 'Decision: condition, exits 1 / 0': 'Decisão: condição, saídas 1 / 0',
  'Conditional (Mealy) outputs': 'Saídas condicionais (Mealy)', 'Conditional output': 'Saída condicional', 'active high': 'ativo a alto', 'active low': 'ativo a baixo',
  'Gray': 'Gray', 'One-hot': 'One-hot', 'Enum / auto': 'Enum / automático', 'Code copied to clipboard': 'Código copiado',
  'Copy the code to the clipboard': 'Copiar o código',
  'Default (combinational) or reset value (registered)': 'Valor por omissão (combinatória) ou de reset (registada)',
  'Drop the connection on a box (a state, decision or conditional output)': 'Largue a ligação numa caixa (estado, decisão ou saída condicional)',
  'Drag from a port ● to a box to connect · drag background to pan · wheel to zoom · Shift+drag to select · double-click to add a state': 'Arraste de um porto ● para uma caixa para ligar · arraste o fundo para deslocar · roda para zoom · Shift+arrastar para selecionar · duplo clique para adicionar um estado',
  // ASM editor: data path and every-cycle blocks
  'Every cycle': 'Cada ciclo', 'every clock cycle': 'em todos os ciclos de relógio', 'Every-cycle block': 'Bloco de cada ciclo',
  'Add an every-cycle block (logic evaluated on every clock cycle, in parallel with the states)': 'Adicionar um bloco de cada ciclo (lógica avaliada em todos os ciclos de relógio, em paralelo com os estados)',
  'Automatic layout (states top-down, every-cycle blocks on the right)': 'Disposição automática (estados de cima para baixo, blocos de cada ciclo à direita)',
  'Used in the generated code comments.': 'Usado nos comentários do código gerado.',
  'Actions on every cycle (one per line)': 'Ações em cada ciclo (uma por linha)',
  'e.g. tc = 0, cnt = cnt + 1. Assign registers, registered outputs (next value) or combinational outputs.': 'p.ex. tc = 0, cnt = cnt + 1. Atribua registos, saídas registadas (valor seguinte) ou saídas combinatórias.',
  'Connect the exit to decision and conditional output boxes: they are evaluated on every clock cycle, in parallel with the states. Leave the last exits unconnected (end of the block); paths may join again but must not loop or reach a state. An assignment of the current state to the same target takes priority.': 'Ligue a saída a caixas de decisão e de saída condicional: são avaliadas em todos os ciclos de relógio, em paralelo com os estados. Deixe as últimas saídas por ligar (fim do bloco); os caminhos podem voltar a juntar-se mas não podem formar ciclos nem chegar a um estado. Uma atribuição do estado atual ao mesmo destino tem prioridade.',
  'Every cycle: logic in parallel with the states': 'Cada ciclo: lógica em paralelo com os estados',
  'e.g. go, !done, cnt == 9, x && (mode == 2\'b01), (1 << n) > cnt. Exit 1 = true, 0 = false.': 'p.ex. go, !done, cnt == 9, x && (mode == 2\'b01), (1 << n) > cnt. Saída 1 = verdadeiro, 0 = falso.',
  'Sync': 'Sinc.', 'Synchronise with 2 flip-flops (conditions see the synchronised value)': 'Sincronizar com 2 flip-flops (as condições veem o valor sincronizado)',
  'Synchronise with 2 flip-flops (asynchronous input, e.g. a button)': 'Sincronizar com 2 flip-flops (entrada assíncrona, p.ex. um botão)',
  'Registers': 'Registos', 'Reset (initial) value': 'Valor de reset (inicial)', 'Reset value': 'Valor de reset', '+ register': '+ registo',
  'Add an internal register (data path)': 'Adicionar um registo interno (caminho de dados)', 'Generics': 'Genéricos',
  'Default value (integer)': 'Valor por omissão (inteiro)', 'Default value (non-negative integer)': 'Valor por omissão (inteiro não negativo)',
  '+ generic': '+ genérico', 'Add an integer generic / parameter': 'Adicionar um genérico / parâmetro inteiro', 'Remove': 'Remover',
  '+ input': '+ entrada', '+ output': '+ saída', 'Add an input port': 'Adicionar um porto de entrada', 'Add an output port': 'Adicionar um porto de saída',
  'Registers are internal: assign them like registered outputs (next value at the clock edge, they hold otherwise) and read them anywhere. Generics are integer VHDL generics / Verilog parameters, usable in expressions (e.g. cnt == N - 1).': 'Os registos são internos: atribua-os como as saídas registadas (valor seguinte no flanco do relógio, mantêm-se nos outros casos) e leia-os em qualquer lado. Os genéricos são generics VHDL / parameters Verilog inteiros, utilizáveis em expressões (p.ex. cnt == N - 1).',
  'Combinational outputs take their default unless assigned. Registered outputs (Reg) hold their value, reset to the default and can be read in conditions, e.g. cnt = cnt + 1.': 'As saídas combinatórias tomam o valor por omissão quando não atribuídas. As saídas registadas (Reg) mantêm o valor, fazem reset para o valor por omissão e podem ser lidas em condições, p.ex. cnt = cnt + 1.',
  // schematic symbol library: categories, decoders / encoders / demultiplexers
  'Logic': 'Lógica', 'Arithmetic': 'Aritmética', 'Flip-Flops': 'Flip-Flops', 'Mux': 'Multiplexadores', 'Decoders/Encoders': 'Descodificadores/Codificadores',
  'Bus': 'Barramento', 'General': 'Geral', 'Device Primitives': 'Primitivas do Dispositivo', 'Project modules': 'Módulos do projeto',
  'n:2^n binary decoder (one-hot outputs, all 0 when E = 0; like Xilinx D2_4E / D3_8E / D4_16E)': 'Descodificador binário n:2^n (saídas one-hot, todas a 0 quando E = 0; como os Xilinx D2_4E / D3_8E / D4_16E)',
  '2^n:n binary encoder: priority (highest active input wins) or one-hot (OR of the inputs); V = some input is 1': 'Codificador binário 2^n:n: com prioridade (ganha a entrada ativa de maior índice) ou one-hot (OU das entradas); V = alguma entrada a 1',
  '1:2^n demultiplexer: output O<S> = D, the other outputs 0 (bitwise when Width > 1)': 'Desmultiplexador 1:2^n: saída O<S> = D, as outras saídas a 0 (bit a bit quando Largura > 1)',
  'Address bits': 'Bits de endereço', 'Enable input E': 'Entrada de habilitação E', 'Select as a bus (S)': 'Seleção em barramento (S)', 'Bus pins (A, D)': 'Pinos em barramento (A, D)',
  'Output bits': 'Bits de saída', 'Bus pins (I, A)': 'Pinos em barramento (I, A)', 'Select bits': 'Bits de seleção', 'Type': 'Tipo',
  'priority': 'prioridade',
  // tri-state buffers (BUFE / BUFT)
  'Tri-State': 'Três estados', 'Enable input': 'Entrada de habilitação', 'Pins per bit (I0.., O0..)': 'Um pino por bit (I0.., O0..)',
  'Tri-state buffer: O = I while enabled, Z (high impedance, released) otherwise; E active high (BUFE) or T active low (BUFT)': 'Buffer de três estados: O = I enquanto habilitado, Z (alta impedância, libertado) caso contrário; E ativo a 1 (BUFE) ou T ativo a 0 (BUFT)',
  'Tri-state buffer, active-high enable: O = I when E = 1, Z when E = 0': 'Buffer de três estados, habilitação ativa a 1: O = I quando E = 1, Z quando E = 0',
  'Tri-state buffer, active-low enable T: O = I when T = 0, Z when T = 1': 'Buffer de três estados, habilitação T ativa a 0: O = I quando T = 0, Z quando T = 1',
  // Symbol Info (datasheets of the schematic symbols; their own texts are in core/symdocs.js)
  'Symbol Info (F1)': 'Informação do Símbolo (F1)', 'Symbol Info…': 'Informação do Símbolo…', 'Symbol Info': 'Informação do Símbolo',
  // schematic editor labels that were still in English
  'Select (Esc)': 'Selecionar (Esc)', 'Add Wire (W)': 'Adicionar Fio (W)', 'Add Net Name (N)': 'Adicionar Nome de Rede (N)', 'Add I/O Marker (O)': 'Adicionar Marcador de E/S (O)',
  'Rotate (Ctrl+R)': 'Rodar (Ctrl+R)', 'Mirror (Ctrl+M)': 'Espelhar (Ctrl+M)', 'Delete (Del)': 'Apagar (Del)', 'Keep connections': 'Manter ligações',
  'Check': 'Verificar', 'View HDL': 'Ver HDL', 'Schematic sheet': 'Folha do esquemático',
  'Context clause': 'Cláusula de contexto', 'Compiler directives': 'Diretivas do compilador', 'one per line: NAME : type := default': 'uma por linha: NOME : tipo := valor por omissão',
  'signals, types, constants, functions emitted verbatim': 'sinais, tipos, constantes, funções copiados tal e qual',
  'Tip: drag symbols from the Symbols panel; double-click a module symbol to open its source.': 'Dica: arraste símbolos do painel Símbolos; faça duplo clique num símbolo de módulo para abrir a sua fonte.',
  'HDL kept with the schematic': 'HDL guardado com o esquemático',
  'More…': 'Mais…', 'Place Symbol': 'Colocar Símbolo', 'Datasheet of the symbol: pins, parameters, truth table, equivalent HDL': 'Folha de características do símbolo: pinos, parâmetros, tabela de verdade, HDL equivalente',
  // misc
  'Error': 'Erro', 'Warning': 'Aviso', 'Note': 'Nota', 'Failure': 'Falha', 'Running': 'Em curso', 'Running...': 'Em curso...', 'Other': 'Outro',
  'not available': 'indisponível', 'not found': 'não encontrado', 'see log': 'ver registo', 'Exported .xise': '.xise exportado',

  // the Tasks interface (web/js/tasks.js, #804): View ▸ Interface ▸ Tasks, the task switcher, the task's bar
  'Tasks': 'Tarefas', 'Task': 'Tarefa', 'Show or hide the side panel': 'Mostrar ou esconder o painel lateral',
  'Show or hide the messages': 'Mostrar ou esconder as mensagens', 'Maximize the document (double-click its tab)': 'Maximizar o documento (duplo clique no separador)',
  'Open a source from the Design panel, or check the design.': 'Abra uma fonte no painel Projeto, ou verifique o projeto.',
  'Simulate the design: its waves open here.': 'Simule o projeto: as formas de onda abrem aqui.',
  'Emulate the design on the board: the board opens here.': 'Emule o projeto na placa: a placa abre aqui.',
  'Implement the design: synthesis, place & route and the programming file.': 'Implemente o projeto: síntese, place & route e o ficheiro de programação.',
  'Program the board: the FPGA, or its flash to keep the design.': 'Programe a placa: a FPGA, ou a sua flash para guardar o projeto.',
  // a task's dot, its button's tooltip (#991): "<task> — <state>"
  'done, no warnings': 'concluído, sem avisos', 'done with warnings': 'concluído com avisos', 'errors': 'erros',
  'out of date (a source changed)': 'desatualizado (uma fonte mudou)', 'running…': 'em curso…',
  // the Program task (#803)
  'Up to date with the sources': 'Atualizado com as fontes', 'Out of date: the sources changed since the last implementation': 'Desatualizado: as fontes mudaram desde a última implementação',
  'The last implementation failed': 'A última implementação falhou', 'Being implemented…': 'A ser implementado…', 'No programming file yet': 'Ainda não há ficheiro de programação',
  'Board, programming tool and cable…': 'Placa, ferramenta de programação e cabo…',
  // the Implement task (#802)
  'Program the board…': 'Programar a placa…',
  // the Simulate task (#800)
  'The test bench to simulate': 'A bancada de teste a simular', 'Open the test bench\'s source': 'Abrir a fonte da bancada de teste',
  'Design modules': 'Módulos do projeto',
  'Create a test bench (Wizard)…': 'Criar uma bancada de teste (Assistente)…',
  'The project has no test bench yet: create one with the wizard, or simulate the top with stimuli drawn in ISim.': 'O projeto ainda não tem bancada de teste: crie uma com o assistente, ou simule o topo com estímulos desenhados no ISim.',
  'The model to simulate': 'O modelo a simular',
  // the Edit task's one tree: its groups (#799)
  'Test Benches': 'Bancadas de Teste', 'Constraints': 'Restrições',
  // a single document's module and model in the task's bar (#854)
  'Post-Synthesis': 'Pós-Síntese', 'Post-Translate': 'Pós-Translate', 'Post-Map': 'Pós-Map', 'Post-Place & Route': 'Pós-Place & Route',
  // its message centre (web/js/messages.js, #798)
  'Emulator': 'Emulador', 'Synthesis': 'Síntese', 'Messages from': 'Mensagens de', 'Command line': 'Linha de comandos',
  'Type an SSim command (help)': 'Escreva um comando do SSim (help)', 'Type a command or a file name': 'Escreva um comando ou o nome de um ficheiro',
  // modern interface (web/js/modern.js, web/js/palette.js): View ▸ Interface / Theme, header, design flow, command palette
  'Interface': 'Interface', 'Modern': 'Moderna', 'Classic': 'Clássica',
  'Theme': 'Tema', 'System': 'Sistema', 'Light': 'Claro', 'Dark': 'Escuro', 'Command Palette…': 'Paleta de Comandos…',
  'Implement': 'Implementar', 'Emulate': 'Emular', 'Design flow': 'Fluxo de projeto',
  'Check Syntax of the selected module': 'Verificar a sintaxe do módulo selecionado',
  'Simulate Behavioral Model of the selected module': 'Simular o modelo comportamental do módulo selecionado',
  'No project open': 'Nenhum projeto aberto', 'Main menu': 'Menu principal', 'Panels': 'Painéis',
  'Search commands and files (Ctrl+K)': 'Procurar comandos e ficheiros (Ctrl+K)', 'Search commands and files…': 'Procurar comandos e ficheiros…',
  'Search commands and files': 'Procurar comandos e ficheiros', 'Switch between light and dark theme': 'Alternar entre tema claro e escuro',
  'Open a source from the Design panel, or search for any command or file.': 'Abra uma fonte no painel Projeto, ou procure qualquer comando ou ficheiro.',
  'No matching commands or files': 'Nenhum comando ou ficheiro corresponde', 'to navigate': 'para navegar', 'to run': 'para executar', 'to close': 'para fechar',
  'Clear Recent Projects': 'Limpar Projetos Recentes', 'Recent projects cleared (the projects themselves are kept)': 'Projetos recentes limpos (os projetos mantêm-se)',
  'Power switch: click to turn the board off / on': 'Interruptor de alimentação: clique para desligar / ligar a placa', 'Power off': 'Desligada', 'Power': 'Alimentação',
  'Open file': 'Abrir ficheiro', 'Command palette': 'Paleta de comandos', 'Command palette: search commands and files': 'Paleta de comandos: procurar comandos e ficheiros',
};

const PT_GATE_INV = { 'input I0': 'a entrada I0', 'inputs I0 and I1': 'as entradas I0 e I1' };
const PT_FF = [['synchronous set and reset (S over R)', 'set e reset síncronos (S antes de R)'], ['synchronous reset and set (R over S)', 'reset e set síncronos (R antes de S)'],
  ['clock enable', 'habilitação do relógio'], ['asynchronous clear', 'clear assíncrono'], ['asynchronous preset', 'preset assíncrono'],
  ['synchronous reset', 'reset síncrono'], ['synchronous set', 'set síncrono']];
const PT_PATTERNS = [
  // the Development menu (#707)
  [/^Features \((\d+)\)$/, 'Funcionalidades ($1)'], [/^Bug fixes \((\d+)\)$/, 'Correções ($1)'], [/^Other \((\d+)\)$/, 'Outras ($1)'],
  [/^All Changes since (\d+\.\d+\.\d+)…$/, 'Todas as Alterações desde a $1…'], [/^Changes since (\d+\.\d+\.\d+)$/, 'Alterações desde a $1'],
  [/^This Build on GitHub \(commit (\w+)\)$/, 'Esta Versão no GitHub (commit $1)'], [/^Open Issue #(\d+) on GitHub$/, 'Abrir a Issue #$1 no GitHub'],
  // the tip of a drawing's link banner, shortened on a narrow screen (#266)
  [/^HDL: (\S+) — generated from the (diagram|net|table)$/, (m, f, w) => `HDL: ${f} — gerado a partir ${{ diagram: 'do diagrama', net: 'da rede', table: 'da tabela' }[w]}`],
  // a process run on the top module while another module is selected (#223)
  [/^(.+) (implements|synthesizes|emulates) the top module '(.+)', not the selected module '(.+)'\.$/,
    (m, p, v, top, sel) => `${t(p)} ${{ implements: 'implementa', synthesizes: 'sintetiza', emulates: 'emula' }[v]} o módulo de topo '${top}', não o módulo selecionado '${sel}'.`],
  // the browser edition's workspace folder (its name)
  [/^Reopen (.+)$/, 'Reabrir $1'], [/^In the folder (.+) on the disk\.$/, 'Na pasta $1 no disco.'], [/^Storage: folder (.+)$/, 'Armazenamento: pasta $1'], [/^Projects are kept in the folder (.+) on the disk \(File ▸ Open Workspace Folder… to change it\)\.$/, 'Os projetos ficam guardados na pasta $1 do disco (File ▸ Open Workspace Folder… para a mudar).'],
  // schematic symbols: flip-flops (FD*, FT*, FJK*)
  [/^(D|Toggle \(T\)|J-K) flip-flop(?: with (.*?))?( \(bitwise when Width > 1\))?$/, (m, k, w, bw) => {
    let r = w || '';
    for (const [a, b] of PT_FF) r = r.split(a).join(b);
    return `Flip-flop ${k === 'Toggle (T)' ? 'T (toggle)' : k}${w ? ` com ${r.replace(/ and /g, ' e ')}` : ''}${bw ? ' (bit a bit quando Largura > 1)' : ''}`;
  }],
  // schematic symbols: inverted-input gates (AND2B1...), decoders, encoders, demultiplexers
  [/^Multiplexer of 2, 4, 8 or 16 data inputs, its select bits \(1 to 4\), select bus and enable in its properties \(bitwise when Width > 1\)$/,
    'Multiplexador de 2, 4, 8 ou 16 entradas de dados, os bits de seleção (1 a 4), o barramento de seleção e a habilitação nas suas propriedades (bit a bit quando Largura > 1)'],
  // the stimuli drawn on the waveforms (#336): the timing dialog's hint, the bar's status, the errors
  [/^The inputs of (\S+) as a grid of cycles: with a clock, the inputs change at its falling edge and the outputs are checked before the next one; without one, at every time step\.$/,
    'As entradas de $1 como uma grelha de ciclos: com relógio, as entradas mudam no seu flanco descendente e as saídas são verificadas antes do seguinte; sem relógio, a cada passo de tempo.'],
  [/^(\d+) cycles \((?:clock (\S+), period (\d+) ns|combinational, step (\d+) ns)\): (no expected outputs|expected outputs OK|(\d+) mismatch\(es\))$/,
    (m, n, clk, per, step, res, bad) => `${n} ciclos (${clk ? `relógio ${clk}, período ${per} ns` : `combinatório, passo ${step} ns`}): ${bad ? `${bad} diferença(s)` : res === 'expected outputs OK' ? 'saídas esperadas certas' : 'sem saídas esperadas'}`],
  [/^(Cycles|Clock Period|Time Step): a whole number of at least (\d+)$/, (m, f, n) => `${{ Cycles: 'Ciclos', 'Clock Period': 'Período do Relógio', 'Time Step': 'Passo de Tempo' }[f]}: um número inteiro de pelo menos ${n}`],
  [/^'(.*)' is not a value \(bits(, -| 0 1 Z X), h… hexadecimal or d… decimal\)$/, (m, v, b) => `'${v}' não é um valor (bits${b === ', -' ? ', -' : ' 0 1 Z X'}, h… hexadecimal ou d… decimal)`],
  [/^'(.*)' does not fit in (\d+) bit\(s\)$/, "'$1' não cabe em $2 bit(s)"],
  [/^'(.*)' is not a valid name \(a letter, then letters, digits or _\)\.$/, "'$1' não é um nome válido (uma letra, depois letras, algarismos ou _)."],
  [/^(AND|OR|NAND|NOR|XOR|XNOR) gate of 2, 3 or 4 inputs, its inputs and inverted inputs in its properties \(bitwise when Width > 1\)$/,
    'Porta $1 de 2, 3 ou 4 entradas, as entradas e as entradas invertidas nas suas propriedades (bit a bit quando Largura > 1)'],
  [/^(\d)-input (AND|OR|NAND|NOR|XOR|XNOR) gate with (input I0|inputs I0 and I1|inputs I0\.\.I\d) inverted \(bitwise when Width > 1\)$/,
    (m, n, g, which) => `Porta ${g} de ${n} entradas com ${PT_GATE_INV[which] || `as entradas ${which.slice(7)}`} invertida${which === 'input I0' ? '' : 's'} (bit a bit quando Largura > 1)`],
  [/^(\d+):(\d+) decoder with enable \(Xilinx (\w+)\): D<A> = E, the other outputs 0$/, 'Descodificador $1:$2 com habilitação (Xilinx $3): D<A> = E, as outras saídas a 0'],
  [/^(\d+):(\d+) priority encoder: A = index of the highest input at 1 \(0 when none\), V = some input is 1$/, 'Codificador com prioridade $1:$2: A = índice da entrada a 1 de maior índice (0 se nenhuma), V = alguma entrada a 1'],
  [/^(\d+):(\d+) one-hot encoder: A = OR of the indices of the inputs at 1, V = some input is 1$/, 'Codificador one-hot $1:$2: A = OU dos índices das entradas a 1, V = alguma entrada a 1'],
  [/^1:(\d+) demultiplexer \((select S0|(\d)-bit select S)\): O<S> = D, the other outputs 0 \(bitwise when Width > 1\)$/,
    (m, n, sel, k) => `Desmultiplexador 1:${n} (${k ? `seleção S de ${k} bits` : 'seleção S0'}): O<S> = D, as outras saídas a 0 (bit a bit quando Largura > 1)`],
  [/^(Logic|Tri-State|Arithmetic|Flip-Flops|Mux|Decoders\/Encoders|Bus|General|Device Primitives|Project modules) \((\d+)\)$/, (m, c, n) => `${t(c)} (${n})`],
  [/^Silinx - (.*) - \[(.*)\]$/, (m, a, b) => `Silinx - ${a} - [${t(b)}]`],
  [/^(.*) \(RTL\)$/, '$1 (RTL)'],
  [/^(.*) \(Technology\)$/, '$1 (Tecnológico)'],
  [/^Processes: (.*)$/, 'Processos: $1'],
  [/^HDL kept with the schematic \((VHDL|VERILOG)\)$/, 'HDL guardado com o esquemático ($1)'],
  [/^Language: (.*)$/, 'Idioma: $1'],
  [/^(\d+)\/(\d+) I\/Os assigned$/, '$1/$2 E/S atribuídas'],
  [/^Top: (.*?) · Device (.*?) · Board: (.*)$/, 'Topo: $1 · Dispositivo $2 · Placa: $3'],
  [/^Top: (.*?) · Device (.*?) · no board selected$/, 'Topo: $1 · Dispositivo $2 · sem placa selecionada'],
  [/^(.*) Project Status$/, 'Estado do Projeto $1'],
  [/^Configuration file: (.*)$/, 'Ficheiro de configuração: $1'],
  [/^Bitstream: design (.*)$/, 'Bitstream: projeto $1'],
  [/^(\d+) Errors$/, '$1 Erros'], [/^(\d+) Warnings$/, '$1 Avisos'], [/^(\d+) HDL files$/, '$1 ficheiros HDL'],
  [/^position (\d+)$/, 'posição $1'],
  [/^(\d+) file\(s\) selected$/, '$1 ficheiro(s) selecionado(s)'],
  [/^Folder '(.*)': (\d+) file\(s\), project (.*)$/, "Pasta '$1': $2 ficheiro(s), projeto $3"],
  [/^Number of (.+)$/, 'Número de $1'],
  [/^Balanced \((Speed|Area)\)$/, (m, g) => `Equilibrado (${g === 'Speed' ? 'Velocidade' : 'Área'})`],
  [/^Example: (.*)$/, 'Exemplo: $1'],
  [/^Settings file: (.*)$/, 'Ficheiro de definições: $1'],
  // the Silinx toolchain: the status of the project's device
  // I/O Pin Planning without its top (#253)
  [/^The top-level module '(.+)' is not in the project\.$/, "O módulo de topo '$1' não está no projeto."],
  [/^The ports of the top-level module '(.+)' cannot be read: (.+)\.$/, "As portas do módulo de topo '$1' não podem ser lidas: $2."],
  [/^Silinx toolchain for (\S+): (available|not available)$/, (m, p, a) => `Toolchain Silinx para ${p}: ${a === 'available' ? 'disponível' : 'não disponível'}`],
  [/^(\S+): device description \((shipped with Silinx|built from your ISE)\) and bit database$/, (m, p, w) => `${p}: descrição do dispositivo (${w === 'built from your ISE' ? 'construída a partir do seu ISE' : 'fornecida com o Silinx'}) e base de dados de bits`],
  [/^no bit database for (\S+) yet \(only the (.+)\): use an ISE mode for this device$/, 'ainda não há base de dados de bits para o $1 (só para o $2): use um modo ISE para este dispositivo'],
  [/^no bit database for the pads of the (\S+) in the (\S+) package yet \((?:only (.+)|no package yet)\): use an ISE mode for this device$/, (m, d, p, o) => `ainda não há base de dados de bits para os pinos do ${d} no encapsulamento ${p} (${o ? `só ${o}` : 'nenhum encapsulamento ainda'}): use um modo ISE para este dispositivo`],
  [/^no device description of (\S+) ships with Silinx \(the Silinx toolchain supports the (.+)\): use an ISE mode for this device$/, 'o Silinx não inclui a descrição do dispositivo $1 (a toolchain Silinx suporta o $2): use um modo ISE para este dispositivo'],
  [/^the Silinx toolchain does not support the (\S+) family yet \(only the Spartan-3E (.+)\): use an ISE mode$/, 'a toolchain Silinx ainda não suporta a família $1 (só o Spartan-3E $2): use um modo ISE'],
  [/^Not met \((\d+) constraints\)$/, 'Não cumpridas ($1 restrições)'],
  [/^Version (\d[\w.-]*)$/, 'Versão $1'],
  // schematic palette: "<SYMBOL>: <description>"
  [/^([A-Z][A-Z0-9_]*(?: [A-Z]+)?): (.+)$/, (m, a, b) => `${a}: ${t(b)}`],
];

// t() looks strings up trimmed: the keys are trimmed the same way
for (const k of Object.keys(PT)) { const tk = k.trim(); if (tk !== k) { if (!(tk in PT)) PT[tk] = PT[k].trim(); delete PT[k]; } }
Object.assign(PT, {
  'Not in sync with': 'Não sincronizado com', 'Generated from': 'Gerado a partir de', 
  
  
  
  // Design Summary, File menu, project / import dialogs, toolchain, About, shortcuts
  'Device Utilization Summary (not yet implemented)': 'Resumo da Utilização do Dispositivo (ainda não implementado)',
  'Tip: double-click a process in the Processes panel to run it. Simulation runs entirely inside Silinx; synthesis/implementation require Xilinx ISE 14.7 (Tools ▸ Toolchain Settings).':
    'Dica: faça duplo clique num processo no painel Processos para o executar. A simulação corre inteiramente no Silinx; a síntese/implementação requer o Xilinx ISE 14.7 (Ferramentas ▸ Definições da Toolchain).',
  'Print…': 'Imprimir…', 'project name': 'nome do projeto', 'new project name': 'nome do novo projeto', 'file name': 'nome do ficheiro',
  'Device': 'Dispositivo', 'Top': 'Topo', 'Board': 'Placa', '.zip file:': 'Ficheiro .zip:',
  'Import a whole Silinx project from a .zip made with File ▸ Export Silinx ISE Project (silinx.json and every project file: sources, ASM charts, schematics, constraints, simulation files).':
    'Importe um projeto Silinx completo a partir de um .zip feito com Ficheiro ▸ Exportar Projeto Silinx ISE (silinx.json e todos os ficheiros do projeto: fontes, diagramas ASM, esquemáticos, restrições, ficheiros de simulação).',
  'Easiest setup on any OS:': 'Configuração mais simples em qualquer sistema operativo:',
  'build the private Docker image with the Silinx kit (docker/ise/README.md):': 'construa a imagem Docker privada com o kit do Silinx (docker/ise/README.md):',
  '(Windows: build-ise-image.ps1). It configures Silinx automatically.': '(Windows: build-ise-image.ps1). Configura o Silinx automaticamente.',
  'auto-detect (…/14.7/ISE_DS/settings64.sh)': 'deteção automática (…/14.7/ISE_DS/settings64.sh)',
  'Synthesis, place & route and bitstream generation use the Silinx toolchain (Yosys, and the place & route and bitstream writer of Silinx) for the Spartan-3E boards, or the Xilinx ISE 14.7 command-line tools. Xilinx, ISE, ISim, iMPACT and Spartan are trademarks of AMD/Xilinx; Silinx ISE is an independent project, not affiliated with or endorsed by AMD/Xilinx.':
    'A síntese, o place & route e a geração do bitstream usam a toolchain Silinx (o Yosys, e o place & route e o gerador de bitstreams do próprio Silinx) para as placas Spartan-3E, ou as ferramentas de linha de comandos do Xilinx ISE 14.7. Xilinx, ISE, ISim, iMPACT e Spartan são marcas registadas da AMD/Xilinx; o Silinx ISE é um projeto independente, sem afiliação nem aprovação da AMD/Xilinx.',
  'F12 or Ctrl/Cmd+Click': 'F12 ou Ctrl/Cmd+Clique',
  // the Silinx toolchain (Toolchain Settings, Processes, Design Summary)
  'Silinx toolchain (no ISE)': 'Toolchain Silinx (sem ISE)', 'Synthesize - Yosys': 'Sintetizar - Yosys',
  'Silinx toolchain (no ISE): selected': 'Toolchain Silinx (sem ISE): selecionada',
  'Needs Xilinx ISE: not available with the Silinx toolchain (choose an ISE mode in Toolchain Settings)': 'Requer o Xilinx ISE: não disponível com a toolchain Silinx (escolha um modo ISE nas Definições da Toolchain)',
  'Silinx toolchain: open a project to see whether its device is supported': 'Toolchain Silinx: abra um projeto para ver se o seu dispositivo é suportado',
  'Supported now: the Spartan-3E XC3S100E, XC3S250E (Basys2), XC3S500E and XC3S1200E (Nexys2).': 'Suportado agora: o Spartan-3E XC3S100E, XC3S250E (Basys2), XC3S500E e XC3S1200E (Nexys2).',
  'Device Utilization Summary (Silinx toolchain)': 'Resumo da Utilização do Dispositivo (toolchain Silinx)',
  'Device Utilization Summary (after synthesis)': 'Resumo da Utilização do Dispositivo (após a síntese)',
  'Timing (post Place & Route, Silinx toolchain estimate)': 'Temporização (após Posicionar e Encaminhar, estimativa da toolchain Silinx)',
  'Synthesis Report (Yosys)': 'Relatório de Síntese (Yosys)', 'Placed Design (XDL)': 'Projeto Posicionado (XDL)', 'Routed Design (XDL)': 'Projeto Encaminhado (XDL)',
  'Static Timing Report': 'Relatório de Temporização Estática',
  'Tip: double-click a process in the Processes panel to run it. Simulation runs entirely inside Silinx; synthesis and implementation use the Silinx toolchain (no ISE): Tools ▸ Toolchain Settings.':
    'Dica: faça duplo clique num processo no painel Processos para o executar. A simulação corre inteiramente no Silinx; a síntese e a implementação usam a toolchain Silinx (sem ISE): Ferramentas ▸ Definições da Toolchain.',
  // board emulator
  'Real time': 'Tempo real', 'Engine:': 'Motor:', 'Compiled (real speed)': 'Compilado (velocidade real)', 'Event-driven (debugging)': 'Por eventos (depuração)',
  'The simulator that runs the design: compiled (its netlist, at the board\'s real speed) or event-driven (the behavioural RTL, with X values and the design\'s messages: for debugging)':
    'O simulador que corre o projeto: compilado (a sua netlist, à velocidade real da placa) ou por eventos (o RTL comportamental, com valores X e as mensagens do projeto: para depuração)',
  'The design is compiled (its netlist, by Yosys) and runs at up to the board\'s clock rate; registers without an initial value start at 0, as on the FPGA; the event-driven engine shows X values and the design\'s messages. Each display digit keeps the last pattern it showed between its refreshes, as your eye does on the real board. Buttons: press and hold; Shift+click keeps a button pressed.':
    'O projeto é compilado (a sua netlist, pelo Yosys) e corre até à frequência do relógio da placa; os registos sem valor inicial começam a 0, como na FPGA; o motor por eventos mostra os valores X e as mensagens do projeto. Cada dígito do mostrador mantém o último padrão entre atualizações, como o olho faz na placa real. Botões: carregue e mantenha; Shift+clique mantém um botão carregado.',
  'Real values: the compiled engine runs the design at up to the board\'s clock rate.': 'Valores reais: o motor compilado corre o projeto até à frequência do relógio da placa.',
  'Compiling the design for the Board Emulator (Yosys)…': 'A compilar o projeto para o Emulador de Placa (Yosys)…',
  'Starting the Board Emulator…': 'A iniciar o Emulador de Placa…',
  'VGA monitor (640×480)': 'Monitor VGA (640×480)', 'No signal': 'Sem sinal',
  'The VGA monitor needs the compiled engine (the event-driven one is too slow for a frame)': 'O monitor VGA precisa do motor compilado (o motor por eventos é demasiado lento para uma imagem)',
  'HSYNC active high: 640×480 at 60 Hz has it active low': 'HSYNC ativo a 1: em 640×480 a 60 Hz é ativo a 0',
  'VSYNC active high: 640×480 at 60 Hz has it active low': 'VSYNC ativo a 1: em 640×480 a 60 Hz é ativo a 0',
  'No VSYNC: the monitor finds no frames': 'Sem VSYNC: o monitor não encontra imagens',
  'Max speed': 'Velocidade máxima', '▶ Run': '▶ Executar', '⏸ Pause': '⏸ Pausa', '⏭ Step': '⏭ Passo', '⟲ Power cycle': '⟲ Desligar/ligar',
  'Advance one clock cycle': 'Avançar um ciclo de relógio', 'Power-cycle the board: restart the design from time 0': 'Desligar e ligar a placa: reiniciar o projeto a partir do instante 0',
  'Emulated clock rate': 'Frequência do relógio emulado', 'Model:': 'Modelo:', 'Clock:': 'Relógio:', 'Timing:': 'Temporização:',
  'When hidden:': 'Quando oculto:', 'Keep running': 'Continuar a executar',
  'What the emulator does while it is not seen (another browser tab, a minimised window, another document tab): pause, and go on where it was when shown again, or keep running':
    'O que o emulador faz enquanto não está à vista (outro separador do navegador, uma janela minimizada, outro separador de documento): pausa, e continua onde estava quando volta a ser mostrado, ou continua a executar',
  'What runs on the board: the HDL (RTL) or a netlist generated by ISE (netgen)': 'O que corre na placa: o HDL (RTL) ou uma netlist gerada pelo ISE (netgen)',
  'Behavioral (RTL)': 'Comportamental (RTL)',
  'Character LCD (HD44780): lcd_e, lcd_rs, lcd_rw, lcd_d': 'LCD de caracteres (HD44780): lcd_e, lcd_rs, lcd_rw, lcd_d', 'LCD: not connected in the UCF': 'LCD: não ligado no UCF',
  'Turn the knob: ⟲ / ⟳ or the mouse wheel (ROT_A / ROT_B)': 'Rode o botão: ⟲ / ⟳ ou a roda do rato (ROT_A / ROT_B)',
  'Rotary encoder: ROT_A / ROT_B not connected in the UCF': 'Codificador rotativo: ROT_A / ROT_B não ligados no UCF',
  'Turn left (counter-clockwise)': 'Rodar para a esquerda (sentido anti-horário)', 'Turn right (clockwise)': 'Rodar para a direita (sentido horário)',
  'Watch': 'Observar', 'Add a signal to watch…': 'Adicionar um sinal a observar…', 'Timing generics': 'Genéricos de temporização',
  'Not on the board': 'Fora da placa', 'Messages': 'Mensagens', 'No clock input found': 'Nenhuma entrada de relógio encontrada',
  'Divided so that counters, dividers and debouncers advance at the emulator\'s speed (about 10^5 clock cycles per second instead of 50 MHz). The design and the bitstream are not changed.':
    'Divididos para que contadores, divisores e debouncers avancem à velocidade do emulador (cerca de 10^5 ciclos de relógio por segundo em vez de 50 MHz). O projeto e o bitstream não são alterados.',
  'Real values: at the emulator\'s speed, a design that counts millions of cycles moves very slowly.': 'Valores reais: à velocidade do emulador, um projeto que conta milhões de ciclos avança muito devagar.',
  'The design is simulated from its HDL (behavioural RTL) at a reduced clock rate; registers without an initial value start at 0, as on the FPGA; each display digit keeps the last pattern it showed between its refreshes, as your eye does on the real board. Buttons: press and hold; Shift+click keeps a button pressed.':
    'O projeto é simulado a partir do seu HDL (RTL comportamental) com um relógio mais lento; os registos sem valor inicial começam a 0, como na FPGA; cada dígito do mostrador mantém o último padrão entre atualizações, como o olho faz na placa real. Botões: carregue e mantenha; Shift+clique mantém um botão carregado.',
  // ASM chart editor
  'Value(s) of this exit: binary digits, a literal, a|b, or others': 'Valor(es) desta saída: dígitos binários, um literal, a|b, ou others',
  'Registered output (holds its value, readable in conditions)': 'Saída registada (mantém o valor, pode ser lida em condições)',
  'Value(s) of this exit': 'Valor(es) desta saída', 'Value tested': 'Valor testado', 'Exits (value → box)': 'Saídas (valor → caixa)', 'Connection': 'Ligação', 'Case': 'Case',
  // schematic editor
  'Moving components: keep the wires connected (re-routed around other parts) or detach them': 'Ao mover componentes: manter os fios ligados (reencaminhados à volta das outras peças) ou desligá-los',
  'Check Schematic': 'Verificar Esquemático', 'View generated HDL': 'Ver o HDL gerado',
  'Module name': 'Nome do módulo', 'Sheet size': 'Tamanho da folha', 'Declarations': 'Declarações', 'Architecture name': 'Nome da arquitetura',
  'Instance name': 'Nome da instância', 'Module': 'Módulo', 'Title': 'Título', 'Input pins': 'Pinos de entrada', 'Output pins': 'Pinos de saída',
  'HDL type': 'Tipo HDL', 'Draw as bus': 'Desenhar como barramento', 'Rename net': 'Mudar o nome da rede',
  // print dialog
  'Paper': 'Papel', 'Orientation': 'Orientação', 'Pages across': 'Páginas na horizontal', 'PNG resolution': 'Resolução PNG', 'Automatic': 'Automática',
  'Landscape': 'Horizontal', 'Portrait': 'Vertical', '1× (screen size)': '1× (tamanho do ecrã)', 'Save PNG': 'Guardar PNG', 'Save SVG': 'Guardar SVG',
  // placeholders
  'name': 'nome', 'Search symbols…': 'Procurar símbolos…', 'net name': 'nome da rede', 'auto': 'automático', 'e.g. my-ise:14.7': 'p.ex. my-ise:14.7',
});
const PT_POST = { 'Post-Synthesis': 'Pós-Síntese', 'Post-Translate': 'Pós-Translate', 'Post-Map': 'Pós-Map', 'Post-Place & Route': 'Pós-Place & Route' };
const PT_PRESS = { ' — click to toggle': ' — clique para comutar', ' — press and hold (Shift+click keeps it pressed)': ' — carregue e mantenha (Shift+clique mantém-no carregado)' };
const PT_THEN = { 'the simulation starts': 'a simulação começa', 'the emulator opens': 'o emulador abre', 'the technology schematic opens': 'o esquemático tecnológico abre' };
Object.assign(PT, { 'Generate and Simulate': 'Gerar e Simular', 'Generate and Emulate': 'Gerar e Emular', 'Generate and Show': 'Gerar e Mostrar' });
PT_PATTERNS.unshift(
  // a simulation model not generated yet (#490): generate it and go on, or why it cannot be
  [/^There is no (post-synthesis|post-translate|post-map|post-place & route) simulation model of '(.+)' yet\.$/,
    (m, n, top) => `Ainda não há modelo de simulação ${PT_POST[Object.keys(PT_POST).find((k) => k.toLowerCase() === n)].toLowerCase()} de '${top}'.`],
  [/^Generate it now with "(.+)"\? When it ends without errors, (the simulation starts|the emulator opens|the technology schematic opens)\.$/,
    (m, p, w) => `Gerá-lo agora com "${t(p)}"? Quando terminar sem erros, ${PT_THEN[w]}.`],
  [/^"(.+)" needs the Xilinx ISE toolchain: it is not available with the Silinx toolchain \(choose an ISE mode in Toolchain Settings\)\.$/,
    (m, p) => `"${t(p)}" requer a toolchain Xilinx ISE: não está disponível com a toolchain Silinx (escolha um modo ISE nas Definições da Toolchain).`],
  [/^"(.+)" needs the Xilinx ISE toolchain, which is not available \(configure it in Tools ▸ Toolchain Settings\)\.$/,
    (m, p) => `"${t(p)}" requer a toolchain Xilinx ISE, que não está disponível (configure-a em Ferramentas ▸ Definições da Toolchain).`],
  // board emulator
  [/^Divide the timing generics \((.*)\) so that the design runs visibly at the emulator's speed$/, 'Dividir os genéricos de temporização ($1) para que o projeto avance visivelmente à velocidade do emulador'],
  [/^(Post-Synthesis|Post-Translate|Post-Map|Post-Place & Route) netlist( \(not generated\))?$/, (m, n, ng) => `Netlist ${PT_POST[n]}${ng ? ' (não gerada)' : ''}`],
  [/^(.+) = (.+) \(pin (\w+)\)( — click to toggle| — press and hold \(Shift\+click keeps it pressed\))?$/, (m, r, b, p, s) => `${r} = ${b} (pino ${p})${s ? PT_PRESS[s] : ''}`],
  [/^(.+): not connected in the UCF( — click to toggle| — press and hold \(Shift\+click keeps it pressed\))?$/, (m, r, s) => `${r}: não ligado no UCF${s ? PT_PRESS[s] : ''}`],
  [/^Clock (.+): ([\d.]+) MHz on the board( \(not in the UCF: assumed\))?( · not emulated: (.*))?$/, (m, c, f, a, n, l) => `Relógio ${c}: ${f} MHz na placa${a ? ' (não está no UCF: assumido)' : ''}${n ? ` · não emulado: ${l}` : ''}`],
  [/^No clock input found · not emulated: (.*)$/, 'Nenhuma entrada de relógio encontrada · não emulado: $1'],
  // a manual clock on a button or a switch (#347)
  [/^Manual clock (.+): one edge per press( · not emulated: (.*))?$/, (m, c, n, l) => `Relógio manual ${c}: um flanco em cada pressão${n ? ` · não emulado: ${l}` : ''}`],
  [/^Timing ÷(.+) \(emulation only\)$/, 'Temporização ÷$1 (só na emulação)'],
  // the engines (#418): why the design is not compiled, what the compiled engine warns of
  [/^Not compiled: (.+)$/, 'Não compilado: $1'],
  [/^Not compiled \((.+)\): the event-driven simulator runs the design\.$/, 'Não compilado ($1): o projeto corre no simulador por eventos.'],
  [/^Compiled engine: (.+)$/, 'Motor compilado: $1'],
  // the event-driven engine by default on a slow device (#952): why (core/emulate-engine.js slowDevice)
  [/^The event-driven engine by default on this device \((.+)\): choose Engine ▸ Compiled to run the design at the board's real speed\.$/,
    (m, w) => `O motor por eventos por omissão neste dispositivo (${w.split(', ').map((x) => x === 'a phone or tablet' ? 'um telemóvel ou tablet'
      : x.replace(/^(\d+) processor cores?$/, (y, n) => `${n} ${n === '1' ? 'núcleo' : 'núcleos'} de processador`).replace(/^([\d.]+) GB of memory$/, (y, n) => `${n.replace('.', ',')} GB de memória`)).join(', ')}): `
      + 'escolha Motor ▸ Compilado para correr o projeto à velocidade real da placa.'],
  // the VGA monitor (#420): what it measured, what is not 640x480 at 60 Hz
  [/^640×480 · (.+) Hz · line (.+) µs · (\d+) lines$/, '640×480 · $1 Hz · linha de $2 µs · $3 linhas'],
  [/^640×480 · line (.+) µs · no VSYNC$/, '640×480 · linha de $1 µs · sem VSYNC'],
  [/^HSYNC every (.+) µs \((.+) kHz\): 31\.8 µs \(31\.5 kHz\) expected for 640×480 at 60 Hz$/, 'HSYNC a cada $1 µs ($2 kHz): esperado 31,8 µs (31,5 kHz) em 640×480 a 60 Hz'],
  [/^HSYNC pulse of (.+) µs: 3\.8 µs \(96 pixels\) expected$/, 'Impulso de HSYNC de $1 µs: esperado 3,8 µs (96 píxeis)'],
  [/^(.+) lines a frame: 525 expected$/, '$1 linhas por imagem: esperadas 525'],
  [/^(.+) Hz: 60 Hz expected$/, '$1 Hz: esperado 60 Hz'],
  [/^VSYNC pulse of (.+) lines: 2 expected$/, 'Impulso de VSYNC de $1 linhas: esperadas 2'],
  [/^t = (.+?) · ([\d,.\s]+) cycles(.*)$/, (m, tm, n, rest) => `t = ${tm} · ${n} ciclos${rest.replace('% of real time)', '% do tempo real)').replace(' · stopped by an error', ' · parado por um erro').replace(' · paused while hidden', ' · em pausa enquanto oculto')}`],
  [/^(\d+) port bit\(s\) have no LOC on a (.+) resource \(inputs are held at 0\):$/, '$1 bit(s) de porto sem LOC num recurso da $2 (as entradas ficam a 0):'],
  // print dialog
  [/^Print — (.*)$/, 'Imprimir — $1'],
  [/^(\d+) pages? \((\d+) across × (\d+) down\), (\S+) (landscape|portrait); 12 px text prints at ([\d.]+) pt$/,
    (m, n, c, r, p, o, pt) => `${n} página${n === '1' ? '' : 's'} (${c} na horizontal × ${r} na vertical), ${p} ${o === 'landscape' ? 'horizontal' : 'vertical'}; texto de 12 px impresso a ${pt} pt`],
  [/^Drawing: (\d+) × (\d+) px\. Large diagrams: several pages across \(tiles\) or A3; text below ~5 pt is hard to read on paper\. For a PDF choose "Save as PDF" in the print dialog \(keep the margins at "Default"\)\.$/,
    'Desenho: $1 × $2 px. Diagramas grandes: várias páginas na horizontal (mosaico) ou A3; texto abaixo de ~5 pt é difícil de ler em papel. Para um PDF escolha "Guardar como PDF" no diálogo de impressão (mantenha as margens em "Predefinição").'],
);

// live schematic simulation (sch-live.js): Try it, not Simulate (the design flow's, #992)
Object.assign(PT, {
  'Simulate': 'Simular', 'Try it': 'Experimentar', 'Try it: click the inputs and watch the circuit work (Esc to stop)': 'Experimentar: clique nas entradas e veja o circuito a funcionar (Esc para parar)',
  'Trying it out: click the inputs (switches, bus values, clocks), hover a wire or pin to see its value, drag to pan. Esc stops.':
    'A experimentar: clique nas entradas (interruptores, valores de barramentos, relógios), passe o rato sobre um fio ou pino para ver o valor, arraste para deslocar. Esc para.',
  'Building the circuit\'s model…': 'A construir o modelo do circuito…', 'Trying it out': 'A experimentar',
  'Power cycle: back to time 0, registers to their initial values': 'Religar: volta ao tempo 0, registos com os valores iniciais',
  'Step': 'Passo', 'One clock cycle (rising and falling edge)': 'Um ciclo de relógio (flanco ascendente e descendente)', 'Pause': 'Pausa',
  'Run / pause the clock': 'Executar / pausar o relógio', 'Clock rate': 'Frequência do relógio', 'Buses:': 'Barramentos:',
  'Number format of the bus values': 'Formato dos valores dos barramentos',
  'Stop trying it out and go back to the schematic (Esc)': 'Parar de experimentar e voltar ao esquemático (Esc)', 'Number format': 'Formato do número',
  'Subtract 1': 'Subtrair 1', 'Add 1': 'Somar 1', 'All bits 0': 'Todos os bits a 0', 'Set': 'Aplicar',
  'Hex 0x1F, binary 0b101, or decimal; ↑ / ↓ add / subtract 1': 'Hex 0x1F, binário 0b101 ou decimal; ↑ / ↓ somam / subtraem 1',
  'Click an input to change it: 1-bit inputs toggle, buses open a value editor, clock inputs step one cycle. Wires: green = 1, dark green = 0, red = X/U, blue = Z. Hover a pin or a wire to see its value; click a component to list its pins.':
    'Clique numa entrada para a mudar: as entradas de 1 bit comutam, os barramentos abrem um editor de valor, as entradas de relógio avançam um ciclo. Fios: verde = 1, verde escuro = 0, vermelho = X/U, azul = Z. Passe o rato sobre um pino ou fio para ver o valor; clique num componente para listar os seus pinos.',
  'click for one clock cycle': 'clique para um ciclo de relógio', 'click to toggle': 'clique para comutar', 'click to change the value': 'clique para mudar o valor',
  'no value': 'sem valor', '(unconnected)': '(não ligado)',
});
// the classic title bar (web/js/project.js updateTitle, #987): "<project> - [Design Summary]", its name translated (#1007)
PT_PATTERNS.push([/^(.+) - \[Design Summary\]$/, (m, pj) => `${pj} - [${PT['Design Summary']}]`]);
// a task's button with its dot (web/js/tasks.js taskTitle, #991): "Implement — done with warnings"
PT_PATTERNS.push([/^(Edit|Simulate|Implement) — (done, no warnings|done with warnings|errors|out of date \(a source changed\)|running…)$/, (m, a, b) => `${PT[a]} — ${PT[b]}`]);
PT_PATTERNS.push(
  [/^Cannot try it out: (\d+) error\(s\), (\d+) warning\(s\)$/, 'Não é possível experimentar: $1 erro(s), $2 aviso(s)'],
  [/^Cannot try it out: (.*)$/s, 'Não é possível experimentar: $1'],
  [/^Stopped: (.*)$/s, 'Parado: $1'],
  [/^Simulation stopped: (.*)$/s, 'Simulação parada: $1'],
);
// New Source types, Module Wizard and Schematic Wizard (web/js/modwizard.js, core/modgen.js)
Object.assign(PT, {
  'Module (HDL)': 'Módulo (HDL)',
  // New Source's types (#975; Schematic and Petri Net: their own entries)
  'Finite State Machine (FSM)': 'Máquina de Estados Finitos (FSM)', 'Algorithmic State Machine (ASM)': 'Máquina de Estados Algorítmica (ASM)', 'Test Bench': 'Bancada de Teste',
  'Wizard': 'Assistente', 'Clock Manager (DCM / PLL)': 'Gestor de Relógio (DCM / PLL)',   // New Source's Wizard button (#958)
  'Module Wizard': 'Assistente de Módulo', 'Schematic Wizard': 'Assistente de Esquemático',
  'Name and Language': 'Nome e Linguagem', 'Inputs and Outputs': 'Entradas e Saídas', 'Kind of Logic': 'Tipo de Lógica',
  'The wizard creates a schematic with an I/O marker for each input and output, ready for you to place the symbols and wire them.':
    'O assistente cria um esquemático com um marcador de E/S para cada entrada e saída, pronto para colocar os símbolos e ligá-los.',
  'The wizard writes a commented skeleton of the module: its inputs and outputs, and a template of the logic (combinational or sequential).':
    'O assistente escreve um esqueleto comentado do módulo: as entradas e saídas, e um modelo da lógica (combinatória ou sequencial).',
  'Schematic (module) name:': 'Nome do esquemático (módulo):', 'Module name:': 'Nome do módulo:', 'Description (optional):': 'Descrição (opcional):',
  'What the module does (it goes into the header comment)': 'O que o módulo faz (vai para o comentário de cabeçalho)',
  'Quick add (inputs):': 'Adicionar (entradas):', 'Quick add (outputs):': 'Adicionar (saídas):', 'Width (bits)': 'Largura (bits)',
  '1 = a single bit; N = a bus of N bits (N-1 downto 0)': '1 = um só bit; N = um barramento de N bits (N-1 downto 0)',
  'Description': 'Descrição', 'output': 'saída', 'optional': 'opcional', 'Add Port': 'Adicionar Porto',
  'No ports yet: use the quick-add buttons or Add Port.': 'Ainda sem portos: use os botões de adição rápida ou Adicionar Porto.',
  'No ports yet: use Add Port.': 'Ainda sem portos: use Adicionar Porto.',
  'One assignment per output (concurrent)': 'Uma atribuição por saída (concorrente)', 'One process / always block that reads every input': 'Um processo / bloco always que lê todas as entradas',
  'No reset': 'Sem reset', 'Synchronous (at the clock edge)': 'Síncrono (no flanco do relógio)', 'Asynchronous (at once)': 'Assíncrono (imediato)',
  "Active high ('1')": "Ativo a 1 ('1')", "Active low ('0')": "Ativo a 0 ('0')",
  'Style:': 'Estilo:', 'Reset:': 'Tipo de reset:', 'Reset input:': 'Entrada de reset:', 'Enable input:': 'Entrada de habilitação:',
  'Combinational: the outputs depend only on the present inputs (gates, multiplexers, adders, decoders…). Every output gets a default value, so no latch is made.':
    'Combinatória: as saídas dependem só das entradas atuais (portas, multiplexadores, somadores, descodificadores…). Cada saída recebe um valor por omissão, por isso não se cria nenhuma latch.',
  'Sequential: the outputs are registers that change at the rising edge of the clock (counters, shift registers, state machines…). The reset sets them to 0.':
    'Sequencial: as saídas são registos que mudam no flanco ascendente do relógio (contadores, registos de deslocamento, máquinas de estados…). O reset põe-nos a 0.',
  'Combinational': 'Combinatória', 'Sequential (clocked)': 'Sequencial (com relógio)', 'Default value': 'Valor por omissão',
  'Generics (optional)': 'Genéricos (opcional)', 'Add Generic': 'Adicionar Genérico',
  'Constants given when the module is used, e.g. a width (VHDL generic, Verilog parameter).': 'Constantes dadas quando o módulo é usado, p. ex. uma largura (generic em VHDL, parameter em Verilog).',
  'Preview of the code:': 'Pré-visualização do código:',
  'shown on the sheet and as a comment in the HDL': 'mostrada na folha e como comentário no HDL',
  'Add at least one input or output.': 'Adicione pelo menos uma entrada ou saída.',
  'A sequential module needs a clock: add a 1-bit input (e.g. clk) on the previous page.': 'Um módulo sequencial precisa de um relógio: adicione uma entrada de 1 bit (p. ex. clk) na página anterior.',
  'Choose the reset input, or No reset.': 'Escolha a entrada de reset, ou Sem reset.',
  'The clock and the reset must be different inputs.': 'O relógio e o reset têm de ser entradas diferentes.',
  'The enable must be an input other than the clock and the reset.': 'A habilitação tem de ser uma entrada diferente do relógio e do reset.',
  'A sequential module needs a clock: a 1-bit input.': 'Um módulo sequencial precisa de um relógio: uma entrada de 1 bit.',
  'The reset must be a 1-bit input other than the clock.': 'O reset tem de ser uma entrada de 1 bit diferente do relógio.',
  'The enable must be a 1-bit input other than the clock and the reset.': 'A habilitação tem de ser uma entrada de 1 bit diferente do relógio e do reset.',
});
// identifier problems (core/modgen.js identError), inside the messages below
const ptIdent = s => s
  .replace(/^the name is empty$/, 'o nome está vazio')
  .replace(/^('.*') must start with a letter$/, '$1 tem de começar por uma letra')
  .replace(/^('.*') may only contain letters, digits and _$/, '$1 só pode ter letras, dígitos e _')
  .replace(/^('.*'): no double __ and no _ at the end$/, '$1: sem __ seguidos e sem _ no fim')
  .replace(/^('.*') is a reserved word of (.+)$/, (m, n, l) => `${n} é uma palavra reservada de ${l.replace(' and ', ' e ')}`);
PT_PATTERNS.push(
  // a name that is a reserved word of VHDL or Verilog (core/reserved.js, #679): refused, or said of a drawing / a module
  [/^'(.*)' is a reserved word of (.+): choose another name\.$/, (m, n, l) => `'${n}' é uma palavra reservada de ${l.replace(' and ', ' e ')}: escolha outro nome.`],
  [/^'(.*)' is a reserved word of (.+): rename it$/, (m, n, l) => `'${n}' é uma palavra reservada de ${l.replace(' and ', ' e ')}: mude-lhe o nome`],
  [/^(\S+): '(.*)' is a reserved word of (.+): rename the module in the file first\.$/, (m, f, n, l) => `${f}: '${n}' é uma palavra reservada de ${l.replace(' and ', ' e ')}: mude primeiro o nome do módulo no ficheiro.`],
  [/^The module name '(.*)' is a reserved word of (.+): rename it \(Rename in the Design pane\), or its HDL may not compile\.$/, (m, n, l) => `O nome do módulo '${n}' é uma palavra reservada de ${l.replace(' and ', ' e ')}: mude-lhe o nome (Mudar o Nome no painel Projeto), ou o seu HDL pode não compilar.`],
  [/^(Name|Module name|Architecture name|Generic|Port (\d+)): (.*)\.$/, (m, w, k, e) => `${{ Name: 'Nome', 'Module name': 'Nome do módulo', 'Architecture name': 'Nome da arquitetura', Generic: 'Genérico' }[w] || `Porto ${k}`}: ${ptIdent(e)}.`],
  [/^Port '(.*)' has the name of the module\.$/, "O porto '$1' tem o nome do módulo."],
  [/^Two ports are named '([^']*)'\.$/, "Há dois portos com o nome '$1'."],
  [/^Two ports are named '([^']*)' \(letter case does not count: '([^']*)'\)\.$/, "Há dois portos com o nome '$1' (maiúsculas e minúsculas não contam: '$2')."],
  [/^Port '(.*)': the width must be a whole number from 1 to (\d+)\.$/, "Porto '$1': a largura tem de ser um número inteiro de 1 a $2."],
  [/^The generic '(.*)' has the name of a port or of another generic\.$/, "O genérico '$1' tem o nome de um porto ou de outro genérico."],
  [/^The generic '(.*)' has the name of a port or of the module\.$/, "O genérico '$1' tem o nome de um porto ou do módulo."],
  [/^Generic '(.*)': the default value must be a whole number\.$/, "Genérico '$1': o valor por omissão tem de ser um número inteiro."],
  [/^A module named '(.*)' already exists\.$/, "Já existe um módulo chamado '$1'."],
  [/^(\S+) already exists\.$/, '$1 já existe.'],
  [/^Open-source components \((\d+)\)$/, 'Componentes de código aberto ($1)'],
  [/^Copyright 2026 Pedro Maló\. Free software under the GNU Affero General Public License v3\.0 \($/, 'Copyright 2026 Pedro Maló. Software livre sob a GNU Affero General Public License v3.0 ('],

  [/^Removed (\S+) from the project$/, 'Removido $1 do projeto'],
  // Remove from Project: one file; a drawing with its HDL file, together (#234)
  [/^Remove '(\S+)' from the project\?\n\(The file stays in the project folder: Undo or Add to Project in the Files view brings it back\.\)$/, "Remover '$1' do projeto?\n(O ficheiro fica na pasta do projeto: Anular ou Acrescentar ao Projeto na vista Ficheiros repõe-no.)"],
  [/^Remove '(\S+)' and its HDL file '(\S+)' from the project\?\n\(The files stay in the project folder: Undo or Add to Project in the Files view brings them back\.\)$/, "Remover '$1' e o seu ficheiro HDL '$2' do projeto?\n(Os ficheiros ficam na pasta do projeto: Anular ou Acrescentar ao Projeto na vista Ficheiros repõe-nos.)"],
  [/^Removed (\S+) and (\S+) from the project$/, 'Removidos $1 e $2 do projeto'],
  [/^The project starts with (\S+) \(the top module 'top'\) and its HDL module, generated from it\.$/, "O projeto começa com $1 (o módulo de topo 'top') e o seu módulo HDL, gerado a partir dele."],
  [/^(\S+) already exists\.\n\nReplace it\? Its current contents will be lost\.$/, '$1 já existe.\n\nSubstituir? O conteúdo atual perde-se.'],
  [/^(\S+) already exists: choose another name\.$/, '$1 já existe: escolha outro nome.'],
  // Convert to Schematic (editable) of any HDL module (#225)
  [/^Convert to Schematic$/, 'Converter para Esquemático'],
  [/^(\S+) already exists\. Overwrite it\?$/, '$1 já existe. Substituí-lo?'],
  [/^Converting (\S+) to a schematic…$/, 'A converter $1 para esquemático…'],
  [/^'(.+)' does not elaborate( \(.*\))?: correct it first\.$/s, "'$1' não é elaborado$2: corrija-o primeiro."],
  [/^Not converted: the HDL generated from the schematic of '(.+?)' would not compile as the module does \((.*)\)\.$/s, "Não convertido: o HDL gerado a partir do esquemático de '$1' não compilaria como o módulo ($2)."],
  [/^The schematic of '(.+?)' cannot make its HDL: (.*)$/s, "O esquemático de '$1' não consegue gerar o seu HDL: $2"],
  [/^The text of '(.+?)' is not found in (\S+)\.$/, "O texto de '$1' não foi encontrado em $2."],
  [/^No module '(.+?)' in the project\.$/, "Não há nenhum módulo '$1' no projeto."],
  [/^'(.+?)' is not an HDL module\.$/, "'$1' não é um módulo HDL."],
  // a drawing whose HDL file name is taken (#230): the tip of its [No HDL] badge, Generate HDL File…, the New Source wizards
  [/^No HDL file: (\S+) defines its module (\S+) already\. Generate HDL File… \(right-click\) replaces it with the HDL generated from the drawing\.$/, 'Sem ficheiro HDL: $1 já define o seu módulo $2. Gerar Ficheiro HDL… (botão direito) substitui-o pelo HDL gerado a partir do desenho.'],
  [/^No HDL file: (\S+) holds something else\. Generate HDL File… \(right-click\) writes its HDL to (\S+)\.$/, 'Sem ficheiro HDL: $1 contém outra coisa. Gerar Ficheiro HDL… (botão direito) escreve o seu HDL em $2.'],
  [/^No HDL file: its module (\S+) is the module of (\S+)\. Rename one of them\.$/, 'Sem ficheiro HDL: o seu módulo $1 é o módulo de $2. Mude o nome de um deles.'],
  // its HDL file removed from the project (#231)
  [/^No HDL file: its HDL file (\S+) was removed from the project\. Generate HDL File… \(right-click\) makes it again from the drawing\.$/, 'Sem ficheiro HDL: o seu ficheiro HDL $1 foi removido do projeto. Gerar Ficheiro HDL… (botão direito) gera-o de novo a partir do desenho.'],
  [/^(\S+), the HDL file of (\S+), was removed from the project\.\n\nMake it again from (\S+) and put it back in the project\? Its current contents will be lost\.$/, '$1, o ficheiro HDL de $2, foi removido do projeto.\n\nGerá-lo de novo a partir de $3 e repô-lo no projeto? O conteúdo atual perde-se.'],
  [/^(\S+) defines the module (\S+) already\.\n\nReplace it with the HDL generated from (\S+)\? Its current contents will be lost\.$/, '$1 já define o módulo $2.\n\nSubstituí-lo pelo HDL gerado a partir de $3? O conteúdo atual perde-se.'],
  [/^(\S+) has errors: correct them first\.$/, '$1 tem erros: corrija-os primeiro.'],
  [/^(\S+) already exists: the HDL generated from the new source would be written there\. Choose another name\.$/, '$1 já existe: o HDL gerado a partir da nova fonte seria escrito aí. Escolha outro nome.'],
  // Back-annotate Pin Locations: the pins to add to the UCF
  [/^Add the (\d+) pin location\(s\) chosen by the tools to (.+?)\?\n\n([\s\S]*)$/, 'Adicionar a $2 as $1 localizações de pinos escolhidas pelas ferramentas?\n\n$3'],
);
// a development build's version (core/version.js VERSION_LABEL, #135): in the title bar, the Design
// Summary, the start-up message; the last pattern tried (a text no other pattern translates)
// Help ▸ Check for Updates (#198): the application's (GitHub's releases) and the site's (the page it serves)
Object.assign(PT, {
  'It is the version this site serves.': 'É a versão que este site serve.',
  'This is the development edition, built from the latest code (main): it is updated after every change, before the releases.': 'Esta é a edição de desenvolvimento, construída a partir do código mais recente (main): é atualizada a cada alteração, antes das versões.',
  'Releases:': 'Versões:', 'Reload': 'Recarregar', "What's new:": 'Novidades:', 'Release notes and downloads:': 'Notas da versão e transferências:',
  'release notes': 'notas da versão', 'You are running a development version newer than the latest release.': 'Está a usar uma versão de desenvolvimento mais recente do que a última versão publicada.',
  'To update: download silinx-ise-<version>.zip and replace your Silinx folder (your projects in the workspace are kept), or download the new Silinx-ISE.html for the standalone edition.':
    'Para atualizar: descarregue o silinx-ise-<versão>.zip e substitua a pasta do Silinx (os projetos da área de trabalho mantêm-se), ou descarregue o novo Silinx-ISE.html para a edição autónoma.',
});
const ptLabel = v => v;   // a version label in a sentence (dev:<commit> (<date>): the same in Portuguese)
PT_PATTERNS.push(
  [/^Running Silinx ISE (.+)\. Checking for a newer version…$/, (m, v) => `A executar o Silinx ISE ${ptLabel(v)}. A procurar uma versão mais recente…`],
  [/^Running Silinx ISE (.+)\.$/, (m, v) => `A executar o Silinx ISE ${ptLabel(v)}.`],
  [/^Silinx ISE (.+) is up to date\.$/, (m, v) => `O Silinx ISE ${ptLabel(v)} está atualizado.`],
  [/^This site now serves Silinx ISE (.+)\.$/, (m, v) => `Este site serve agora o Silinx ISE ${ptLabel(v)}.`],
  [/^This page is (.+): reload the page to get the new version \(your projects are kept\)\.$/, (m, v) => `Esta página é a ${ptLabel(v)}: recarregue a página para obter a nova versão (os projetos mantêm-se).`],
  [/^A new version is available: Silinx ISE (.+)$/, 'Está disponível uma nova versão: Silinx ISE $1'],
  [/^\(released (.+)\)$/, '(publicada a $1)'],
  [/^You are running (.+)\.$/, (m, v) => `Está a usar a ${ptLabel(v)}.`],
  [/^Latest release on GitHub: (.+) —$/, 'Última versão no GitHub: $1 —'],
  [/^Could not check for updates: (.+)\.$/, 'Não foi possível procurar atualizações: $1.'],
);
Object.assign(PT, TT_PT); PT_PATTERNS.unshift(...TT_PT_PATTERNS);   // Truth Table / Karnaugh Map tool
Object.assign(PT, IO_PT); PT_PATTERNS.unshift(...IO_PT_PATTERNS);   // bidirectional (inout) ports of the wizards
Object.assign(PT, LINT_PT);   // design checks (the help texts of the messages are in core/hints.js)
Object.assign(PT, EDITOR_PT); PT_PATTERNS.unshift(...EDITOR_PT_PATTERNS);   // HDL editor: Rename Symbol, quick fixes
for (const [k, v] of Object.entries(FSM_PT)) if (!(k in PT)) PT[k] = v;   // FSM state diagram editor (existing translations kept)
PT_PATTERNS.unshift(...FSM_PT_PATTERNS);
for (const [k, v] of Object.entries(PETRI_PT)) if (!(k in PT)) PT[k] = v;   // Petri net editor
PT_PATTERNS.unshift(...PETRI_PT_PATTERNS);
for (const [k, v] of Object.entries(FPGA_PT)) if (!(k in PT)) PT[k] = v;   // View Implemented Design (FPGA)
PT_PATTERNS.unshift(...FPGA_PT_PATTERNS);
for (const [k, v] of Object.entries(SCH_PT)) if (!(k in PT)) PT[k] = v;   // schematic editor, RTL / Technology Schematic (#130)
PT_PATTERNS.unshift(...SCH_PT_PATTERNS);
for (const [k, v] of Object.entries(CLOCKING_PT)) if (!(k in PT)) PT[k] = v;   // the Clocking Wizard (#793)
for (const [k, v] of Object.entries(MEMORY_PT)) if (!(k in PT)) PT[k] = v;   // the Block Memory wizard (#794)
PT_PATTERNS.unshift(...MEMORY_PT_PATTERNS);
PT_PATTERNS.unshift(...CLOCKING_PT_PATTERNS,
  [/^(Input port|Reset input|LOCKED output|Output (\w+)): (.*)\.$/, (m, w, o, e) => `${{ 'Input port': 'Porto de entrada', 'Reset input': 'Entrada de reset', 'LOCKED output': 'Saída LOCKED' }[w] || `Saída ${o}`}: ${ptIdent(e)}.`]);
for (const [k, v] of Object.entries(RESOURCES_PT)) if (!(k in PT)) PT[k] = v;   // the device's resources checked against the design (#796)
PT_PATTERNS.unshift(...RESOURCES_PT_PATTERNS);

export const LOCALES = {
  en: { name: 'English', strings: {}, patterns: [] },
  pt: { name: 'Português', strings: PT, patterns: PT_PATTERNS },
};

const KEY = 'silinx.lang';
let lang = 'en';
try { lang = localStorage.getItem(KEY) || ''; } catch { /* storage unavailable */ }
if (!LOCALES[lang]) lang = /^pt\b/i.test(navigator.language || '') ? 'pt' : 'en';

export const getLanguage = () => lang;

/** Translate an English UI string (exact match or pattern) into the current language. */
export function t(text) {
  if (lang === 'en' || text == null) return text;
  const L = LOCALES[lang];
  const s = String(text);
  const key = s.trim();
  if (!key) return s;
  let out = L.strings[key];
  if (out === undefined) {
    for (const [re, rep] of L.patterns) if (re.test(key)) { out = key.replace(re, rep); break; }   // rep: string or function
  }
  if (out === undefined) return s;
  return s.replace(key, out);    // keep surrounding whitespace
}

// ---------------------------------------------------------------- DOM translation
const SKIP = '.cm-editor, .console-page, pre, code, textarea, [data-no-i18n], #hier .lbl, #libs-page .lbl, svg text, .sch-svg, .xl-hover-tip';
const ATTRS = ['title', 'placeholder', 'aria-label'];
const textState = new WeakMap();   // text node -> { orig, last }
const attrState = new WeakMap();   // element -> { [attr]: { orig, last } }

function skipEl(el) { return !el || (el.closest && el.closest(SKIP)); }

function translateText(node) {
  const parent = node.parentElement;
  if (!parent || skipEl(parent) || parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE') return;
  const cur = node.nodeValue;
  let st = textState.get(node);
  if (!st || cur !== st.last) { st = { orig: cur, last: cur }; textState.set(node, st); }
  const next = t(st.orig);
  if (next !== cur) { st.last = next; node.nodeValue = next; } else st.last = cur;
}

function translateAttrs(el) {
  if (skipEl(el)) return;
  let map = attrState.get(el);
  for (const a of ATTRS) {
    if (!el.hasAttribute(a)) continue;
    const cur = el.getAttribute(a);
    if (!map) { map = {}; attrState.set(el, map); }
    let st = map[a];
    if (!st || cur !== st.last) st = map[a] = { orig: cur, last: cur };
    const next = t(st.orig);
    if (next !== cur) { st.last = next; el.setAttribute(a, next); }
  }
}

export function translateTree(root) {
  if (!root) return;
  if (root.nodeType === 3) { translateText(root); return; }
  if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
  if (root.nodeType === 1) { if (skipEl(root)) return; translateAttrs(root); }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: n => (n.nodeType === 1 && n.matches?.(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === 3) translateText(n); else translateAttrs(n);
  }
}

let observer = null;
let docTitle = { orig: null, last: null };
function translateTitle() {
  if (document.title !== docTitle.last) docTitle.orig = document.title;
  docTitle.last = t(docTitle.orig);
  if (document.title !== docTitle.last) document.title = docTitle.last;
}

export function startI18n() {
  document.documentElement.lang = lang;
  translateTree(document.body);
  translateTitle();
  if (observer) return;
  observer = new MutationObserver(muts => {
    for (const m of muts) {
      if (m.type === 'childList') m.addedNodes.forEach(n => translateTree(n));
      else if (m.type === 'characterData') translateText(m.target);
      else if (m.type === 'attributes' && ATTRS.includes(m.attributeName)) translateAttrs(m.target);
    }
    translateTitle();
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}

// views that render their own texts per language (e.g. the Symbol Info datasheets) re-render on a change
const langListeners = new Set();
/** Call fn(lang) after every language change; returns the function that removes the listener. */
export function onLanguageChange(fn) { langListeners.add(fn); return () => langListeners.delete(fn); }

export function setLanguage(next) {
  if (!LOCALES[next] || next === lang) return;
  lang = next;
  try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
  document.documentElement.lang = lang;
  translateTree(document.body);     // re-translate from the stored English originals
  translateTitle();
  for (const fn of [...langListeners]) { try { fn(lang); } catch (e) { console.error(e); } }
}
