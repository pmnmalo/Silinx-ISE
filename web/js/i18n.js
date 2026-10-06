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

const PT = {
  // menus
  'File': 'Ficheiro', 'Edit': 'Editar', 'View': 'Ver', 'Project': 'Projeto', 'Process': 'Processo', 'Tools': 'Ferramentas',
  'Window': 'Janela', 'Help': 'Ajuda', 'Language': 'Idioma',
  'New Project…': 'Novo Projeto…', 'Open Project…': 'Abrir Projeto…', 'Close Project': 'Fechar Projeto',
  'Import ISE Project (.zip)…': 'Importar Projeto ISE (.zip)…', 'Export ISE Project (.zip)…': 'Exportar Projeto ISE (.zip)…',
  'Download Project Bundle…': 'Descarregar Pacote do Projeto…', 'Open Project Bundle…': 'Abrir Pacote do Projeto…',
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
  'Close All Documents': 'Fechar Todos os Documentos', 'About XAIlinx': 'Acerca do XAIlinx', 'Keyboard Shortcuts': 'Atalhos de Teclado',
  'Close': 'Fechar', 'Close Others': 'Fechar Outros', 'Close All': 'Fechar Todos', 'Open': 'Abrir', 'Remove from Project': 'Remover do Projeto',
  'Source Properties…': 'Propriedades da Fonte…', 'Rerun': 'Executar Novamente', 'Stop': 'Parar', 'Schematic': 'Esquemático', 'View/Edit Schematic': 'Ver/Editar Esquemático', 'Convert to HDL': 'Converter para HDL', 'Check Syntax of this file': 'Verificar a sintaxe deste ficheiro', ' Check Syntax': ' Verificar Sintaxe', 'Toggle Comment': 'Comentar/Descomentar', 'Find…': 'Procurar…', 'Language Templates': 'Modelos de Linguagem', 'Instantiate module': 'Instanciar módulo', 'Open Synchronized Schematic': 'Abrir Esquemático Sincronizado', 'Select All': 'Selecionar Tudo', 'Convert to HDL (HDL as base)': 'Converter para HDL (HDL como base)', 'Convert to Schematic (schematic as base)': 'Converter para Esquemático (esquemático como base)', 'Remove Synchronized Schematic…': 'Remover Esquemático Sincronizado…', '(synchronized schematic)': '(esquemático sincronizado)', ' (schematic view of this file) — saving here updates it': ' (vista em esquemático deste ficheiro) — guardar aqui atualiza-o', 'RTL Schematic (read-only)': 'Esquemático RTL (só de leitura)', 'Open this instance': 'Abrir esta instância', 'Read-only view. Drag on empty space to select, double-click a module to open it, wheel to zoom.': 'Vista só de leitura. Arraste numa área vazia para selecionar, duplo-clique num módulo para o abrir, roda para zoom.', 'Convert to Schematic (editable)…': 'Converter para Esquemático (editável)…', 'Synchronized with ': 'Sincronizado com ', ' — saving here updates the schematic': ' — guardar aqui atualiza o esquemático', '(synchronized HDL)': '(HDL sincronizado)', 'An implementation is already running (use Stop to cancel it)': 'Já está uma implementação em curso (use Parar para a cancelar)', 'Stop the running process': 'Parar o processo em curso', 'No process is running': 'Nenhum processo em curso', 'Process Properties…': 'Propriedades do Processo…',
  // toolbar / panels
  'New Project': 'Novo Projeto', 'Open Project': 'Abrir Projeto', 'Save (Ctrl+S)': 'Guardar (Ctrl+S)', 'Cut': 'Cortar', 'Copy': 'Copiar',
  'Paste': 'Colar', 'Find': 'Procurar', 'View RTL Schematic': 'Ver Esquemático RTL', 'New ASM State Diagram': 'Novo Diagrama de Estados ASM',
  'Configure Target Device (iMPACT)': 'Configurar Dispositivo (iMPACT)', 'Toolchain Settings': 'Definições da Toolchain', 'About': 'Acerca de',
  'Design': 'Projeto', 'View:': 'Vista:', 'Hierarchy': 'Hierarquia', 'Processes:': 'Processos:', 'Start': 'Início', 'Files': 'Ficheiros',
  'Libraries': 'Bibliotecas', 'Console': 'Consola', 'Errors': 'Erros', 'Warnings': 'Avisos', 'Ready': 'Pronto', 'Clear': 'Limpar',
  'Project Commands': 'Comandos do Projeto', 'Open Example (blinky)': 'Abrir Exemplo (blinky)', 'No projects yet.': 'Ainda não há projetos.',
  'File Name': 'Nome do Ficheiro', 'Association': 'Associação', 'Behavioral': 'Comportamental',
  // processes
  'Design Summary/Reports': 'Resumo do Projeto/Relatórios', 'Design Utilities': 'Utilitários de Projeto',
  'View HDL Instantiation Template': 'Ver Modelo de Instanciação HDL', 'User Constraints': 'Restrições do Utilizador',
  'Edit Constraints (Text)': 'Editar Restrições (Texto)', 'Synthesize - XST': 'Sintetizar - XST', 'Implement Design': 'Implementar Projeto',
  'Translate': 'Traduzir', 'Map': 'Mapear', 'Place & Route': 'Posicionar e Encaminhar', 'Generate Programming File': 'Gerar Ficheiro de Programação',
  'Configure Target Device': 'Configurar Dispositivo', 'Manage Configuration Project (iMPACT)': 'Gerir Projeto de Configuração (iMPACT)',
  'ISim Simulator': 'Simulador ISim', 'Behavioral Check Syntax': 'Verificar Sintaxe (Comportamental)',
  'View/Edit State Diagram (ASM)': 'Ver/Editar Diagrama de Estados (ASM)', 'No processes for the selected item': 'Sem processos para o item selecionado',
  // dialogs & wizards
  'Cancel': 'Cancelar', 'Yes': 'Sim', 'No': 'Não', 'Next >': 'Seguinte >', '< Back': '< Anterior', 'Finish': 'Concluir', 'Import': 'Importar',
  'New Project Wizard': 'Assistente de Novo Projeto', 'Create New Project': 'Criar Novo Projeto', 'Project Settings': 'Definições do Projeto',
  'Project Summary': 'Resumo do Projeto', 'Enter a name and location for the project.': 'Indique um nome e uma localização para o projeto.',
  'Name:': 'Nome:', 'Location:': 'Localização:', 'Top-level source type:': 'Tipo de fonte de topo:', 'Start from:': 'Começar a partir de:',
  'Empty project': 'Projeto vazio', 'Projects are stored in the XAIlinx workspace folder (default ~/XAIlinx-projects).': 'Os projetos são guardados na pasta de trabalho do XAIlinx (por omissão ~/XAIlinx-projects).',
  'Select the device and design flow for the project.': 'Selecione o dispositivo e o fluxo de projeto.',
  'Evaluation Development Board:': 'Placa de Desenvolvimento:', 'Product Category:': 'Categoria de Produto:', 'Family:': 'Família:',
  'Device:': 'Dispositivo:', 'Package:': 'Encapsulamento:', 'Speed:': 'Velocidade:', 'Top-Level Source Type:': 'Tipo de Fonte de Topo:',
  'Synthesis Tool:': 'Ferramenta de Síntese:', 'Simulator:': 'Simulador:', 'Preferred Language:': 'Linguagem Preferida:',
  'VHDL Source Analysis Standard:': 'Norma de Análise VHDL:', 'None Specified': 'Nenhuma', 'All': 'Todas',
  'Project name must start with a letter and contain only letters, digits and _.': 'O nome do projeto deve começar por uma letra e conter apenas letras, dígitos e _.',
  'No projects found in the workspace.': 'Não foram encontrados projetos na pasta de trabalho.',
  'Import ISE Project': 'Importar Projeto ISE', 'Export ISE Project': 'Exportar Projeto ISE', 'File(s):': 'Ficheiro(s):', 'Project name:': 'Nome do projeto:',
  'Select a .zip of the ISE project folder (the .xise and its sources — e.g. one exported with File ▸ Export ISE Project).': 'Selecione um .zip da pasta do projeto ISE (o .xise e as suas fontes — p. ex. um exportado com Ficheiro ▸ Exportar Projeto ISE).',
  'Select a .zip (or a .xise with its sources).': 'Selecione um .zip (ou um .xise com as suas fontes).',
  'Project folder:': 'Pasta do projeto:', 'or .zip / .xise file(s):': 'ou ficheiro(s) .zip / .xise:',
  'Select the project folder, a .zip, or a .xise with its sources.': 'Selecione a pasta do projeto, um .zip, ou um .xise com as suas fontes.',
  'ISE output files in the folder (xst, _ngo, netlists, bitstreams, logs) are not imported.': 'Os ficheiros gerados pelo ISE na pasta (xst, _ngo, netlists, bitstreams, logs) não são importados.',
  'Import an ISE project from its folder (the folder with the .xise file), or from a .zip of that folder (e.g. one exported with File ▸ Export ISE Project).': 'Importe um projeto ISE a partir da sua pasta (a pasta com o ficheiro .xise), ou de um .zip dessa pasta (p. ex. um exportado com Ficheiro ▸ Exportar Projeto ISE).',
  'New Source Wizard': 'Assistente de Nova Fonte', 'Select Source Type': 'Selecionar Tipo de Fonte', 'File name:': 'Nome do ficheiro:',
  'Add to project': 'Adicionar ao projeto', 'Define Module': 'Definir Módulo', 'Entity / Module name:': 'Nome da entidade / módulo:',
  'Architecture name:': 'Nome da arquitetura:', 'Port Name': 'Nome do Porto', 'Direction': 'Direção', 'Associate Source': 'Associar Fonte',
  'Select the source (Unit Under Test) to associate with the new test bench.': 'Selecione a fonte (Unidade em Teste) a associar ao novo test bench.',
  'Summary': 'Resumo', 'Options': 'Opções', 'VHDL Module': 'Módulo VHDL', 'Verilog Module': 'Módulo Verilog', 'VHDL Test Bench': 'Test Bench VHDL',
  'Verilog Test Fixture': 'Test Fixture Verilog', 'VHDL Package': 'Pacote VHDL', 'ASM State Diagram (State Machine)': 'Diagrama de Estados ASM (Máquina de Estados)',
  'Implementation Constraints File': 'Ficheiro de Restrições de Implementação', 'Memory Initialization File (.mem)': 'Ficheiro de Inicialização de Memória (.mem)',
  'Enter a valid file name (letters, digits, _ and -).': 'Indique um nome de ficheiro válido (letras, dígitos, _ e -).', 'Invalid location.': 'Localização inválida.',
  'Invalid module name.': 'Nome de módulo inválido.', 'Duplicate port names.': 'Nomes de portos repetidos.', 'Select a module.': 'Selecione um módulo.',
  'No design modules in the project.': 'Não há módulos de projeto.', 'Add Source': 'Adicionar Fonte', 'Files:': 'Ficheiros:', 'Association:': 'Associação:',
  'All (Implementation + Simulation)': 'Todas (Implementação + Simulação)', 'Simulation only': 'Só simulação', 'File:': 'Ficheiro:', 'Language:': 'Linguagem:',
  'View Association:': 'Associação de Vista:', 'Design Properties': 'Propriedades do Projeto', 'Top Module (implementation):': 'Módulo de Topo (implementação):',
  'Top Module (simulation):': 'Módulo de Topo (simulação):', 'Optimization Goal:': 'Objetivo de Otimização:', 'Optimization Effort:': 'Esforço de Otimização:',
  'FPGA Start-Up Clock:': 'Relógio de Arranque da FPGA:', 'Speed': 'Velocidade', 'Area': 'Área', 'High': 'Alto', 'Normal': 'Normal',
  'JTAG Clock': 'Relógio JTAG', 'User Clock': 'Relógio do Utilizador', 'Process Properties - Synthesis / Implementation / Bitstream': 'Propriedades do Processo - Síntese / Implementação / Bitstream',
  'Execution mode:': 'Modo de execução:', 'Local (ISE installed on this machine)': 'Local (ISE instalado nesta máquina)',
  'Docker image with ISE 14.7': 'Imagem Docker com ISE 14.7', 'Remote Linux host via SSH': 'Máquina Linux remota por SSH',
  'ISE settings64.sh:': 'settings64.sh do ISE:', 'Docker image:': 'Imagem Docker:', 'Host:': 'Servidor:', 'User:': 'Utilizador:', 'Port:': 'Porto:',
  'Remote build dir:': 'Pasta remota de build:', 'Remote settings64.sh:': 'settings64.sh remoto:', 'Programmer tool:': 'Ferramenta de programação:',
  'Cable:': 'Cabo:', 'Device programmers': 'Programadores de dispositivos', 'Tool': 'Ferramenta', 'Location': 'Localização',
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
  'Programming tool:': 'Ferramenta de programação:', 'Configuration file (.bit):': 'Ficheiro de configuração (.bit):',
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
  'New Divider': 'Novo Divisor', 'Rename Divider...': 'Mudar Nome do Divisor...', 'Divider name:': 'Nome do divisor:', 'Delete': 'Apagar', 'Copy Path': 'Copiar Caminho',
  'Go To Source Code': 'Ir para o Código-Fonte', 'Type a command (help)': 'Escreva um comando (help)', 'Simulation run time': 'Tempo de simulação',
  'Time unit': 'Unidade de tempo', 'Zoom level': 'Nível de zoom', 'Select a signal in the wave window first': 'Selecione primeiro um sinal na janela de formas de onda',
  'No more transitions': 'Não há mais transições', 'No more events scheduled': 'Não há mais eventos agendados',
  'Specify the value to force the selected signal to.': 'Indique o valor a forçar no sinal selecionado.',
  'Specify the properties of the clock to be applied to the selected signal.': 'Indique as propriedades do relógio a aplicar ao sinal selecionado.',
  // schematic viewer
  'Zoom In (+)': 'Ampliar (+)', 'Zoom Out (−)': 'Reduzir (−)', 'Zoom to Full View (F)': 'Ver Tudo (F)', 'Up one level (Backspace)': 'Subir um nível (Backspace)',
  'Empty schematic — this unit has no ports, logic or instances.': 'Esquemático vazio — esta unidade não tem portos, lógica nem instâncias.',
  'Input port': 'Porto de entrada', 'Output port': 'Porto de saída', 'Bidirectional port': 'Porto bidirecional', 'Clocked process': 'Processo síncrono',
  'Combinational logic': 'Lógica combinatória', 'Testbench process': 'Processo de testbench', 'Black box (module not found)': 'Caixa negra (módulo não encontrado)',
  'Instance': 'Instância', 'Constant': 'Constante', 'Net (driven elsewhere)': 'Ligação (excitada noutro sítio)',
  // ASM editor
  'State': 'Estado', 'Decision': 'Decisão', 'Cond. output': 'Saída cond.', 'Arrange': 'Organizar', 'Fit': 'Ajustar', '✓ Validate': '✓ Validar',
  'Generate HDL': 'Gerar HDL', 'Add state box (rectangle)': 'Adicionar caixa de estado (retângulo)', 'Add decision box (diamond)': 'Adicionar caixa de decisão (losango)',
  'Add conditional output box (oval)': 'Adicionar caixa de saída condicional (oval)', 'Delete selection': 'Apagar seleção', 'Automatic top-down layout': 'Disposição automática de cima para baixo',
  'Toggle snapping to the grid': 'Ativar/desativar alinhamento à grelha', 'Fit the chart in the window': 'Ajustar o diagrama à janela',
  'Check the chart for errors': 'Verificar erros no diagrama', 'Generate the VHDL/Verilog file': 'Gerar o ficheiro VHDL/Verilog',
  'Show / hide the generated HDL preview': 'Mostrar / ocultar a pré-visualização do HDL gerado', 'Selection': 'Seleção', 'Machine': 'Máquina',
  'Module / entity name': 'Nome do módulo / entidade', 'HDL language': 'Linguagem HDL', 'State encoding': 'Codificação de estados', 'Clock': 'Relógio',
  'Reset': 'Reset', 'Reset level': 'Nível do reset', 'Reset type': 'Tipo de reset', 'Initial state': 'Estado inicial', 'Inputs': 'Entradas', 'Outputs': 'Saídas',
  'Width': 'Largura', 'Registered': 'Registada', 'Condition': 'Condição', 'Problems': 'Problemas', 'No problems found': 'Nenhum problema encontrado',
  'Moore outputs (one per line)': 'Saídas de Moore (uma por linha)', 'Mealy outputs (one per line)': 'Saídas de Mealy (uma por linha)',
  'Make this the initial (reset) state': 'Tornar este o estado inicial (reset)', 'Initial (reset) state': 'Estado inicial (reset)',
  'Exchange the true and false branches': 'Trocar os ramos verdadeiro e falso', 'Swap 1 / 0 exits': 'Trocar saídas 1 / 0', 'Delete box': 'Apagar caixa',
  'Delete connection': 'Apagar ligação', 'Reset route': 'Repor percurso', 'Use automatic routing': 'Usar encaminhamento automático',
  'State: name + Moore outputs': 'Estado: nome + saídas de Moore', 'Decision: condition, exits 1 / 0': 'Decisão: condição, saídas 1 / 0',
  'Conditional (Mealy) outputs': 'Saídas condicionais (Mealy)', 'Conditional output': 'Saída condicional', 'active high': 'ativo a alto', 'active low': 'ativo a baixo',
  'Gray': 'Gray', 'One-hot': 'One-hot', 'Enum / auto': 'Enum / automático', 'Code copied to clipboard': 'Código copiado',
  'Copy the code to the clipboard': 'Copiar o código', 'Cannot generate HDL: fix the errors listed in Problems': 'Não é possível gerar HDL: corrija os erros indicados em Problemas',
  'Default (combinational) or reset value (registered)': 'Valor por omissão (combinatória) ou de reset (registada)',
  'Drop the connection on a box (a state, decision or conditional output)': 'Largue a ligação numa caixa (estado, decisão ou saída condicional)',
  'Drag from a port ● to a box to connect · drag background to pan · wheel to zoom · Shift+drag to select · double-click to add a state': 'Arraste de um porto ● para uma caixa para ligar · arraste o fundo para deslocar · roda para zoom · Shift+arrastar para selecionar · duplo clique para adicionar um estado',
  // misc
  'Error': 'Erro', 'Warning': 'Aviso', 'Note': 'Nota', 'Failure': 'Falha', 'Running': 'Em curso', 'Running...': 'Em curso...', 'Other': 'Outro',
  'not available': 'indisponível', 'not found': 'não encontrado', 'see log': 'ver registo', 'Exported .xise': '.xise exportado',
};

const PT_PATTERNS = [
  [/^XAIlinx - (.*) - \[(.*)\]$/, (m, a, b) => `XAIlinx - ${a} - [${t(b)}]`],
  [/^(.*) \(RTL\)$/, '$1 (RTL)'],
  [/^Processes: (.*)$/, 'Processos: $1'],
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
];

export const LOCALES = {
  en: { name: 'English', strings: {}, patterns: [] },
  pt: { name: 'Português', strings: PT, patterns: PT_PATTERNS },
};

const KEY = 'xailinx.lang';
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
const SKIP = '.CodeMirror, .console-page, pre, code, textarea, [data-no-i18n], #hier .lbl, #libs-page .lbl, svg text, .sch-svg, .xl-hover-tip, .CodeMirror-hints';
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

export function setLanguage(next) {
  if (!LOCALES[next] || next === lang) return;
  lang = next;
  try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
  document.documentElement.lang = lang;
  translateTree(document.body);     // re-translate from the stored English originals
  translateTitle();
}
