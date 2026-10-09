// Plain-language help for diagnostics (English and Portuguese), for 1st-semester students.
//
// A diagnostic keeps its ISE-style message; hintFor(d) adds an explanation ("what this means") and
// a fix ("how to fix it"). The Errors / Warnings tabs show it under the message (expandable) and the
// editor shows it in the tooltip of the marker.
//
// To add a hint: add an entry to HINTS. An entry matches
//   - a design check by its id (d.check, see core/lint.js), or
//   - a message by a regular expression (the first entry that matches wins: put specific ones first).
// Texts may use $1, $2… (groups of the regular expression, run on the message). Portuguese texts
// use European Portuguese technical wording.

export const HINTS = [
  // ======================================================================= syntax
  {
    id: 'missing-semicolon', re: /^expected ';' after '?([^']*)'?/,
    en: { explain: "A statement or declaration is not finished: every statement, declaration and port list item in VHDL and Verilog ends with ';'. The line reported is where the ';' was expected (usually the end of the previous line).",
      fix: "Add ';' after $1, at the end of that statement. Check also the line above: the missing ';' is often at the end of the previous line." },
    pt: { explain: "Uma instrução ou declaração não está terminada: em VHDL e em Verilog cada instrução, declaração e item de lista de portos termina com ';'. A linha indicada é onde o ';' era esperado (normalmente o fim da linha anterior).",
      fix: "Acrescente ';' depois de $1, no fim dessa instrução. Veja também a linha de cima: o ';' em falta está muitas vezes no fim da linha anterior." },
  },
  {
    id: 'missing-end-if', re: /^expected 'if' but found '?(process|end|else|elsif|architecture|eof|end of file)'?/,
    en: { explain: "An 'if' statement is not closed. In VHDL every 'if … then' needs its own 'end if;' (also when it has 'elsif' / 'else' branches).",
      fix: "Add 'end if;' after the last statement of that if (before 'end process'). Indent the code: each 'if' and its 'end if;' should line up." },
    pt: { explain: "Uma instrução 'if' não está fechada. Em VHDL cada 'if … then' precisa do seu próprio 'end if;' (também quando tem ramos 'elsif' / 'else').",
      fix: "Acrescente 'end if;' depois da última instrução desse if (antes de 'end process'). Indente o código: cada 'if' e o seu 'end if;' devem ficar alinhados." },
  },
  {
    id: 'statement-outside-process', re: /^expected 'generate' but found '?(then|is|loop|when)'?/,
    en: { explain: "An 'if', 'case' or 'for … loop' is written directly in the architecture (after 'begin'), outside any process. There, VHDL only accepts concurrent statements, so the compiler read it as an 'if / for … generate'. Sequential statements (if, case, loop) must be inside a process.",
      fix: "Put the statement in a process: 'process (all inputs it reads) begin … end process;' (or a clocked process). For simple logic you can also use a concurrent assignment: y <= a when s = '1' else b;  or  with s select y <= …;" },
    pt: { explain: "Um 'if', 'case' ou 'for … loop' está escrito diretamente na arquitetura (depois de 'begin'), fora de qualquer process. Aí o VHDL só aceita instruções concorrentes, por isso o compilador leu-o como um 'if / for … generate'. As instruções sequenciais (if, case, loop) têm de estar dentro de um process.",
      fix: "Coloque a instrução num process: 'process (todas as entradas que lê) begin … end process;' (ou num process com relógio). Para lógica simples também pode usar uma atribuição concorrente: y <= a when s = '1' else b;  ou  with s select y <= …;" },
  },
  {
    id: 'declaration-place', re: /^declaration '?([^']*?)'? not allowed in statement part/,
    en: { explain: "A declaration ('$1') is written after 'begin'. In VHDL the declarations of an architecture (signal, constant, type, component) go between 'architecture … is' and 'begin'; those of a process between 'process (…)' and its 'begin'.",
      fix: "Move the declaration up, before the 'begin' of the architecture (or of the process)." },
    pt: { explain: "Uma declaração ('$1') está escrita depois de 'begin'. Em VHDL as declarações de uma arquitetura (signal, constant, type, component) ficam entre 'architecture … is' e 'begin'; as de um process entre 'process (…)' e o seu 'begin'.",
      fix: "Suba a declaração para antes do 'begin' da arquitetura (ou do process)." },
  },
  {
    id: 'assignment-operator', re: /^expected '(<=|=|<=', ':=' or ';)' but found '?(=|:=|<=)'?/,
    en: { explain: "Wrong assignment symbol. VHDL: signals are assigned with '<=' and variables with ':='; '=' is only a comparison. Verilog: 'assign y = …;', '=' (blocking) or '<=' (non-blocking) in always blocks.",
      fix: "Use '<=' for a VHDL signal (y <= a and b;), ':=' for a VHDL variable, '=' / '<=' in Verilog." },
    pt: { explain: "Símbolo de atribuição errado. VHDL: os sinais são atribuídos com '<=' e as variáveis com ':='; '=' é só uma comparação. Verilog: 'assign y = …;', '=' (bloqueante) ou '<=' (não bloqueante) em blocos always.",
      fix: "Use '<=' para um sinal VHDL (y <= a and b;), ':=' para uma variável VHDL, '=' / '<=' em Verilog." },
  },
  {
    id: 'missing-end', re: /^expected '(end\w*|if|case|loop|process|generate)' but found '?([^']*)'?/,
    en: { explain: "A block is not closed where the compiler expected '$1' (it found '$2' instead). Usually an 'end …' is missing (end if, end case, end process, end loop, end architecture, end / endcase / endmodule in Verilog), or there is one too many.",
      fix: "Find the block that starts before this line and close it with its matching end ('$1'). Check that every if / case / process / begin has exactly one end." },
    pt: { explain: "Um bloco não está fechado onde o compilador esperava '$1' (encontrou '$2'). Normalmente falta um 'end …' (end if, end case, end process, end loop, end architecture, end / endcase / endmodule em Verilog), ou há um a mais.",
      fix: "Procure o bloco que começa antes desta linha e feche-o com o end correspondente ('$1'). Verifique que cada if / case / process / begin tem exatamente um end." },
  },
  {
    id: 'missing-then', re: /^expected '(then|is|of|begin|=>|loop|generate|when|select|port|map)' but found '?([^']*)'?/,
    en: { explain: "A keyword of the statement is missing: the compiler expected '$1' but found '$2'. For example 'if cond then', 'case sel is', 'when value =>', 'architecture rtl of name is', 'for i in 0 to 3 loop'.",
      fix: "Write '$1' in its place in the statement. Compare the line with a Language Template (Edit ▸ Language Templates)." },
    pt: { explain: "Falta uma palavra-chave da instrução: o compilador esperava '$1' mas encontrou '$2'. Por exemplo 'if cond then', 'case sel is', 'when valor =>', 'architecture rtl of nome is', 'for i in 0 to 3 loop'.",
      fix: "Escreva '$1' no seu lugar na instrução. Compare a linha com um modelo de linguagem (Editar ▸ Modelos de Linguagem)." },
  },
  {
    id: 'unexpected-statement', re: /^unexpected '?([^']*?)'? in (concurrent statement part|declarative part|sequential statement|module body|expression)/,
    en: { explain: "'$1' cannot be written here ($2). In VHDL, declarations (signal, constant, component) go between 'architecture … is' and 'begin'; 'if', 'case' and 'for' go inside a process; concurrent assignments and instances go after 'begin'. In Verilog, 'if' / 'case' go inside an always block.",
      fix: "Move the statement to the right place (or put it inside a process / always block), or check the line above for a missing ';' or 'end'." },
    pt: { explain: "'$1' não pode ser escrito aqui ($2). Em VHDL as declarações (signal, constant, component) ficam entre 'architecture … is' e 'begin'; 'if', 'case' e 'for' ficam dentro de um process; as atribuições concorrentes e as instâncias ficam depois de 'begin'. Em Verilog, 'if' / 'case' ficam dentro de um bloco always.",
      fix: "Mova a instrução para o sítio certo (ou coloque-a dentro de um process / bloco always), ou procure na linha de cima um ';' ou um 'end' em falta." },
  },
  {
    id: 'expected-identifier', re: /^expected (identifier|a name|[a-z ]*name) but found '?([^']*)'?/,
    en: { explain: "A name was expected here but the compiler found '$2'. Names (of signals, ports, entities…) start with a letter and contain only letters, digits and '_'; reserved words (signal, in, out, begin, end, process…) cannot be used as names.",
      fix: "Write a valid name, or rename it if it is a reserved word (e.g. 'in' -> 'din'). Check also for a missing ';' on the line above." },
    pt: { explain: "Era esperado um nome mas o compilador encontrou '$2'. Os nomes (de sinais, portos, entidades…) começam por uma letra e só têm letras, algarismos e '_'; as palavras reservadas (signal, in, out, begin, end, process…) não podem ser usadas como nomes.",
      fix: "Escreva um nome válido, ou mude-o se for uma palavra reservada (p. ex. 'in' -> 'din'). Procure também um ';' em falta na linha de cima." },
  },
  {
    id: 'lexical', re: /^(unterminated (string|block comment|string literal|extended identifier)|unexpected character '([^']*)'|bad number literal|invalid digit|malformed based literal)/,
    en: { explain: "The text has a character or literal the language does not accept here: an unclosed string or comment, or a stray character.",
      fix: "Close the string (\") or comment, remove the stray character, and write numbers / bit strings as \"0101\", x\"A3\" (VHDL) or 4'b0101, 8'hA3 (Verilog)." },
    pt: { explain: "O texto tem um carácter ou literal que a linguagem não aceita aqui: uma string ou um comentário por fechar, ou um carácter a mais.",
      fix: "Feche a string (\") ou o comentário, retire o carácter a mais, e escreva números / cadeias de bits como \"0101\", x\"A3\" (VHDL) ou 4'b0101, 8'hA3 (Verilog)." },
  },
  {
    id: 'syntax', re: /^(expected|unexpected) /,
    en: { explain: "Syntax error: the text does not follow the grammar of the language at this point. The error is often caused by something just before it (a missing ';', ')' or 'end').",
      fix: "Read the line and the one above it carefully; compare with a Language Template (Edit ▸ Language Templates). Fix the first error first: the next ones are often consequences of it." },
    pt: { explain: "Erro de sintaxe: o texto não segue a gramática da linguagem neste ponto. Muitas vezes a causa está logo antes (um ';', ')' ou 'end' em falta).",
      fix: "Leia com atenção esta linha e a de cima; compare com um modelo de linguagem (Editar ▸ Modelos de Linguagem). Corrija primeiro o primeiro erro: os seguintes são muitas vezes consequência dele." },
  },
  // ======================================================================= names and types
  {
    id: 'numeric-std-not-declared', check: 'missing-library', re: /^<(to_unsigned|to_signed|to_integer|unsigned|signed|resize|shift_left|shift_right|rotate_left|rotate_right)> is not declared/i,
    en: { explain: "'$1' is defined in the IEEE package numeric_std, which this file does not use. Without 'use ieee.numeric_std.all;' the types unsigned / signed and their functions are not visible (ISE stops with an error).",
      fix: "Add at the top of the file, after 'library ieee;' and 'use ieee.std_logic_1164.all;':  use ieee.numeric_std.all;" },
    pt: { explain: "'$1' está definido no pacote IEEE numeric_std, que este ficheiro não usa. Sem 'use ieee.numeric_std.all;' os tipos unsigned / signed e as suas funções não estão visíveis (o ISE para com um erro).",
      fix: "Acrescente no início do ficheiro, depois de 'library ieee;' e 'use ieee.std_logic_1164.all;':  use ieee.numeric_std.all;" },
  },
  {
    id: 'std-logic-not-declared', check: 'missing-library', re: /^<(std_u?logic(?:_vector)?)> is not declared/i,
    en: { explain: "'$1' is defined in the IEEE package std_logic_1164, which this file does not use: the type is unknown.",
      fix: "Add before the entity:  library ieee;  use ieee.std_logic_1164.all;  (and 'use ieee.numeric_std.all;' if you use unsigned / signed)." },
    pt: { explain: "'$1' está definido no pacote IEEE std_logic_1164, que este ficheiro não usa: o tipo é desconhecido.",
      fix: "Acrescente antes da entidade:  library ieee;  use ieee.std_logic_1164.all;  (e 'use ieee.numeric_std.all;' se usar unsigned / signed)." },
  },
  {
    id: 'not-declared', re: /^'([^']+)' is not declared|^<([^>]+)> is not declared|^function '([^']+)' is not declared|^task\/procedure '([^']+)' is not declared/,
    en: { explain: "The name '$1$2$3$4' is used but it is not declared anywhere visible here: it is not a port, a signal, a constant, a variable or a function of this module (VHDL is not case sensitive, Verilog is).",
      fix: "Check the spelling (and the letter case in Verilog). If it is a new internal signal, declare it: VHDL 'signal $1$2$3$4 : std_logic;' between 'architecture … is' and 'begin'; Verilog 'wire $1$2$3$4;' or 'reg $1$2$3$4;'. If it should be a port, add it to the port list." },
    pt: { explain: "O nome '$1$2$3$4' é usado mas não está declarado em lado nenhum visível aqui: não é um porto, sinal, constante, variável ou função deste módulo (o VHDL não distingue maiúsculas de minúsculas, o Verilog distingue).",
      fix: "Verifique a ortografia (e as maiúsculas em Verilog). Se for um novo sinal interno, declare-o: VHDL 'signal $1$2$3$4 : std_logic;' entre 'architecture … is' e 'begin'; Verilog 'wire $1$2$3$4;' ou 'reg $1$2$3$4;'. Se devia ser um porto, acrescente-o à lista de portos." },
  },
  {
    id: 'unknown-type', re: /^unknown type '([^']+)'/,
    en: { explain: "The type '$1' is not known. Either it is misspelled, or its package is not used (std_logic / std_logic_vector need ieee.std_logic_1164; unsigned / signed need ieee.numeric_std), or it is a type of your own that is declared later or not at all.",
      fix: "Check the spelling, add the missing 'use ieee.….all;' line, or declare the type ('type state_t is (IDLE, RUN);') before using it." },
    pt: { explain: "O tipo '$1' não é conhecido. Ou está mal escrito, ou o seu pacote não é usado (std_logic / std_logic_vector precisam de ieee.std_logic_1164; unsigned / signed precisam de ieee.numeric_std), ou é um tipo seu declarado mais à frente ou nunca declarado.",
      fix: "Verifique a ortografia, acrescente a linha 'use ieee.….all;' em falta, ou declare o tipo ('type state_t is (IDLE, RUN);') antes de o usar." },
  },
  {
    id: 'type-mismatch', check: 'type-mismatch', re: /^Type error near (.+?) ; current type ([^;]+); expected type (.+)$/,
    en: { explain: "The two sides of the assignment have different types: the value ($1) is $2 but the target needs $3. VHDL never converts types by itself: std_logic is one bit, std_logic_vector is a group of bits, unsigned / signed are numbers, a comparison gives a boolean.",
      fix: "Make both sides the same type: take one bit with v(0); make a vector with (0 => a) or (others => a); convert numbers with std_logic_vector(x), unsigned(v), to_unsigned(n, width), to_integer(u); for a comparison use: y <= '1' when a = b else '0';" },
    pt: { explain: "Os dois lados da atribuição têm tipos diferentes: o valor ($1) é $2 mas o destino precisa de $3. O VHDL nunca converte tipos sozinho: std_logic é um bit, std_logic_vector é um grupo de bits, unsigned / signed são números, uma comparação dá um boolean.",
      fix: "Ponha os dois lados com o mesmo tipo: tire um bit com v(0); faça um vetor com (0 => a) ou (others => a); converta números com std_logic_vector(x), unsigned(v), to_unsigned(n, largura), to_integer(u); para uma comparação use: y <= '1' when a = b else '0';" },
  },
  {
    id: 'width-mismatch', re: /^width mismatch: target is (\d+) bits, value is (\d+) bits/,
    en: { explain: "The target has $1 bits but the value has $2 bits. In VHDL both sides of an assignment must have the same number of bits (ISE stops with an error); in Verilog the value is silently cut or extended with zeros, which is usually a bug.",
      fix: "Make the widths equal: assign a slice (v(3 downto 0)), extend with resize(unsigned(x), $1) or '0' & x, or fix the declared range of one of the signals." },
    pt: { explain: "O destino tem $1 bits mas o valor tem $2 bits. Em VHDL os dois lados de uma atribuição têm de ter o mesmo número de bits (o ISE para com um erro); em Verilog o valor é cortado ou estendido com zeros sem aviso, o que normalmente é um erro.",
      fix: "Iguale as larguras: atribua uma fatia (v(3 downto 0)), estenda com resize(unsigned(x), $1) ou '0' & x, ou corrija a gama declarada de um dos sinais." },
  },
  {
    id: 'mode-in', check: 'mode-in', re: /^Object <([^>]+)> of mode IN can not be updated/,
    en: { explain: "'$1' is an input port (mode in): its value comes from outside the module, so the module can only read it, never assign it.",
      fix: "If the module must produce this value, declare the port as 'out'. If you need an internal copy you can change, declare a signal (signal $1_int : …) and assign that one instead." },
    pt: { explain: "'$1' é um porto de entrada (modo in): o seu valor vem de fora do módulo, por isso o módulo só o pode ler, nunca atribuir.",
      fix: "Se o módulo deve produzir este valor, declare o porto como 'out'. Se precisa de uma cópia interna que possa alterar, declare um sinal (signal $1_int : …) e atribua esse." },
  },
  {
    id: 'mode-out', check: 'mode-out', re: /^Object <([^>]+)> of mode OUT can not be read/,
    en: { explain: "'$1' is an output port (mode out). In VHDL-93, the version ISE uses, an output can only be assigned inside the module, not read (for example in 'count <= count + 1' or 'if q = …').",
      fix: "Use an internal signal: declare 'signal $1_reg : …;', do all the logic with $1_reg (read and assign it), and add the concurrent assignment '$1 <= $1_reg;' after begin." },
    pt: { explain: "'$1' é um porto de saída (modo out). Em VHDL-93, a versão que o ISE usa, uma saída só pode ser atribuída dentro do módulo, não lida (por exemplo em 'count <= count + 1' ou 'if q = …').",
      fix: "Use um sinal interno: declare 'signal $1_reg : …;', faça toda a lógica com $1_reg (leia-o e atribua-o) e acrescente a atribuição concorrente '$1 <= $1_reg;' depois de begin." },
  },
  {
    id: 'wire-procedural', check: 'wire-procedural', re: /^Procedural assignment to a non-register <([^>]+)>/,
    en: { explain: "'$1' is a wire (a net), but it is assigned inside an always / initial block. In Verilog only variables (reg, integer) can be assigned in always / initial blocks; wires are driven by 'assign' or by instance outputs.",
      fix: "Declare it as reg: 'reg $1;' (or 'output reg $1' for a port). Being 'reg' does not make it a register: in an always @* block it is still combinational logic." },
    pt: { explain: "'$1' é um wire (uma ligação), mas é atribuído dentro de um bloco always / initial. Em Verilog só as variáveis (reg, integer) podem ser atribuídas em blocos always / initial; os wires são ligados por 'assign' ou por saídas de instâncias.",
      fix: "Declare-o como reg: 'reg $1;' (ou 'output reg $1' num porto). Ser 'reg' não o torna um registo: num bloco always @* continua a ser lógica combinatória." },
  },
  {
    id: 'reg-continuous', check: 'reg-continuous', re: /^Target <([^>]+)> of concurrent assignment or output port connection should be a net type/,
    en: { explain: "'$1' is declared reg but is driven by a continuous assignment ('assign'). In Verilog 'assign' drives nets (wire); a reg is assigned only inside always / initial blocks.",
      fix: "Declare it as wire ('wire $1;', or 'output $1' / 'output wire $1' for a port), or assign it inside an always @* block instead of with 'assign'." },
    pt: { explain: "'$1' está declarado como reg mas é ligado por uma atribuição contínua ('assign'). Em Verilog o 'assign' liga nets (wire); um reg só é atribuído dentro de blocos always / initial.",
      fix: "Declare-o como wire ('wire $1;', ou 'output $1' / 'output wire $1' num porto), ou atribua-o dentro de um bloco always @* em vez de com 'assign'." },
  },
  {
    id: 'variable-assign', re: /^'([^']+)' is a variable: use ':='/,
    en: { explain: "'$1' is a variable (declared in the process), and variables are assigned with ':=' (immediately), not with '<=' (signals).",
      fix: "Write '$1 := …;'. If you need its value outside the process, use a signal instead of a variable." },
    pt: { explain: "'$1' é uma variável (declarada no process), e as variáveis são atribuídas com ':=' (de imediato), não com '<=' (sinais).",
      fix: "Escreva '$1 := …;'. Se precisa do valor fora do process, use um sinal em vez de uma variável." },
  },
  {
    id: 'cannot-assign', re: /^cannot assign to '([^']+)'/,
    en: { explain: "'$1' cannot be assigned: it is a constant, a generic / parameter, or a name that is not a signal or variable.",
      fix: "Assign a signal (or a variable inside a process). To change a constant, edit its declaration." },
    pt: { explain: "'$1' não pode ser atribuído: é uma constante, um genérico / parâmetro, ou um nome que não é um sinal nem uma variável.",
      fix: "Atribua um sinal (ou uma variável dentro de um process). Para mudar uma constante, altere a sua declaração." },
  },
  {
    id: 'integer-conversion', re: /^cannot convert an integer with ([^(]+)\(\)/,
    en: { explain: "$1() converts a vector to another vector type; it cannot turn an integer into bits because it does not know how many bits to use.",
      fix: "Use to_unsigned(n, width) or to_signed(n, width) (numeric_std), e.g. std_logic_vector(to_unsigned(n, 8))." },
    pt: { explain: "$1() converte um vetor noutro tipo de vetor; não consegue transformar um inteiro em bits porque não sabe quantos bits usar.",
      fix: "Use to_unsigned(n, largura) ou to_signed(n, largura) (numeric_std), p. ex. std_logic_vector(to_unsigned(n, 8))." },
  },
  {
    id: 'redeclared', re: /^'([^']+)' redeclared/,
    en: { explain: "'$1' is declared twice in the same place (or it is a port and also declared as a signal).",
      fix: "Keep only one declaration: remove the duplicate, or rename one of them. A port is already a signal: do not declare it again." },
    pt: { explain: "'$1' está declarado duas vezes no mesmo sítio (ou é um porto e também está declarado como sinal).",
      fix: "Mantenha só uma declaração: retire a repetida, ou mude o nome de uma delas. Um porto já é um sinal: não o declare outra vez." },
  },
  {
    id: 'implicit-net', re: /^implicit net '([^']+)'/,
    en: { explain: "'$1' is used without being declared, so Verilog creates a 1-bit wire with that name by itself. That is almost always a typo or a missing declaration (and a bus becomes 1 bit).",
      fix: "Declare it ('wire [7:0] $1;') or correct the spelling. Writing `default_nettype none at the top of the file turns this into an error." },
    pt: { explain: "'$1' é usado sem ser declarado, por isso o Verilog cria sozinho um wire de 1 bit com esse nome. Quase sempre é um erro de escrita ou uma declaração em falta (e um barramento passa a ter 1 bit).",
      fix: "Declare-o ('wire [7:0] $1;') ou corrija a ortografia. Escrever `default_nettype none no início do ficheiro transforma isto num erro." },
  },
  // ======================================================================= hierarchy
  {
    id: 'unknown-module', re: /^module\/entity '([^']+)' not found \(instance '([^']+)'\)/,
    en: { explain: "The instance '$2' uses the module / entity '$1', which is not in the project (or it is misspelled, or its file has errors, or its file is only in the Simulation view).",
      fix: "Check the name against the entity / module declaration, add the file that defines '$1' to the project (Project ▸ Add Copy of Source…), and fix that file's errors first." },
    pt: { explain: "A instância '$2' usa o módulo / entidade '$1', que não está no projeto (ou o nome está mal escrito, ou o seu ficheiro tem erros, ou o ficheiro só está na vista de Simulação).",
      fix: "Compare o nome com a declaração da entidade / módulo, acrescente ao projeto o ficheiro que define '$1' (Projeto ▸ Adicionar Cópia de Fonte…) e corrija primeiro os erros desse ficheiro." },
  },
  {
    id: 'unknown-port', re: /^module '([^']+)' has no port '([^']+)'/,
    en: { explain: "The port map / connection names a port '$2', but '$1' has no port with that name.",
      fix: "Use the port names of the declaration of '$1' (in the editor, Templates ▾ ▸ Instantiate module writes the whole port map for you). In VHDL the formal (port of the component) is on the left of '=>'." },
    pt: { explain: "O port map / ligação refere um porto '$2', mas '$1' não tem nenhum porto com esse nome.",
      fix: "Use os nomes dos portos da declaração de '$1' (no editor, Modelos ▾ ▸ Instanciar módulo escreve o port map completo). Em VHDL o formal (porto do componente) fica à esquerda de '=>'." },
  },
  {
    id: 'too-many-ports', re: /^too many port connections for '([^']+)'/,
    en: { explain: "The instance connects more signals than '$1' has ports (positional association: one actual per port, in the order of the declaration).",
      fix: "Compare with the port list of '$1'. Prefer named association (VHDL 'port map (a => x, y => z)', Verilog '.a(x), .y(z)'): the order then does not matter." },
    pt: { explain: "A instância liga mais sinais do que os portos que '$1' tem (associação posicional: um sinal por porto, pela ordem da declaração).",
      fix: "Compare com a lista de portos de '$1'. Prefira a associação por nome (VHDL 'port map (a => x, y => z)', Verilog '.a(x), .y(z)'): assim a ordem não importa." },
  },
  {
    id: 'unconnected-input', re: /^input port '([^']+)' of '([^']+)' is not connected/,
    en: { explain: "The input '$1' of the instance '$2' is not connected, so its value is undefined (U / Z) in simulation and constant in hardware.",
      fix: "Connect it in the port map ('$1 => some_signal'), or to a constant ('$1 => '0''), if it is really not needed." },
    pt: { explain: "A entrada '$1' da instância '$2' não está ligada, por isso o seu valor é indefinido (U / Z) na simulação e constante no hardware.",
      fix: "Ligue-a no port map ('$1 => um_sinal'), ou a uma constante ('$1 => '0''), se não for mesmo necessária." },
  },
  {
    id: 'output-expression', re: /^output port '([^']+)' of '([^']+)' is connected to a non-assignable expression/,
    en: { explain: "The output '$1' of '$2' is connected to an expression (an operation or a constant) that cannot receive a value.",
      fix: "Connect the output to a signal (declare one if needed) and use that signal in the expression." },
    pt: { explain: "A saída '$1' de '$2' está ligada a uma expressão (uma operação ou uma constante) que não pode receber um valor.",
      fix: "Ligue a saída a um sinal (declare um se for preciso) e use esse sinal na expressão." },
  },
  {
    id: 'top-not-found', re: /^top module '([^']+)' not found/,
    en: { explain: "The top module '$1' is not in the project, or its file has syntax errors and could not be read.",
      fix: "Fix the syntax errors of its file first; or set another top module (right-click the module ▸ Set as Top Module)." },
    pt: { explain: "O módulo de topo '$1' não está no projeto, ou o seu ficheiro tem erros de sintaxe e não pôde ser lido.",
      fix: "Corrija primeiro os erros de sintaxe do ficheiro; ou defina outro módulo de topo (botão direito no módulo ▸ Definir como Módulo de Topo)." },
  },
  {
    id: 'generic-value', re: /^generic '([^']+)' has no value/,
    en: { explain: "The generic / parameter '$1' has no default value and the instance does not give one.",
      fix: "Give it a value in the instance (generic map ($1 => …)) or a default in the declaration ($1 : integer := 8)." },
    pt: { explain: "O genérico / parâmetro '$1' não tem valor por omissão e a instância não lhe dá nenhum.",
      fix: "Dê-lhe um valor na instância (generic map ($1 => …)) ou um valor por omissão na declaração ($1 : integer := 8)." },
  },
  // ======================================================================= design checks (warnings)
  {
    id: 'latch', check: 'latch', re: /latch for signal <([^>]+)>/,
    en: { explain: "A latch is inferred for '$1': in this combinational process (or conditional assignment) there is a path where '$1' is not assigned (an 'if' without 'else', a 'case' without all values), so the hardware must remember its old value. Latches are a classic beginner bug: timing problems, glitches, and the simulation may not match the board.",
      fix: "Give '$1' a value on every path: add an 'else' branch, add 'when others' / 'default', or assign a default value at the start of the process ($1 <= '0';) before the if / case. If you really wanted to store a value, use a clocked process (rising_edge(clk) / posedge clk) to make a flip-flop." },
    pt: { explain: "É inferido um latch (trinco) para '$1': neste process combinatório (ou atribuição condicional) há um caminho em que '$1' não é atribuído (um 'if' sem 'else', um 'case' sem todos os valores), por isso o hardware tem de memorizar o valor antigo. Os latches são um erro clássico de principiante: problemas de temporização, glitches, e a simulação pode não corresponder à placa.",
      fix: "Dê um valor a '$1' em todos os caminhos: acrescente um ramo 'else', acrescente 'when others' / 'default', ou atribua um valor por omissão no início do process ($1 <= '0';) antes do if / case. Se queria mesmo guardar um valor, use um process com relógio (rising_edge(clk) / posedge clk) para obter um flip-flop." },
  },
  {
    id: 'sensitivity-vhdl', check: 'sensitivity', re: /^(\S+) should be on the sensitivity list of the process/,
    en: { explain: "The process reads '$1' but '$1' is not in its sensitivity list. In simulation the process does not run when '$1' changes, so the outputs keep stale values; synthesis ignores the list, so the hardware behaves differently from the simulation.",
      fix: "Add '$1' to the sensitivity list: process(…, $1). Simpler: list every signal the process reads, or (VHDL-2008) write process(all). A clocked process only needs the clock (and an asynchronous reset)." },
    pt: { explain: "O process lê '$1' mas '$1' não está na sua lista de sensibilidade. Na simulação o process não corre quando '$1' muda, por isso as saídas ficam com valores antigos; a síntese ignora a lista, por isso o hardware comporta-se de forma diferente da simulação.",
      fix: "Acrescente '$1' à lista de sensibilidade: process(…, $1). Mais simples: ponha na lista todos os sinais que o process lê, ou (VHDL-2008) escreva process(all). Um process com relógio só precisa do relógio (e de um reset assíncrono)." },
  },
  {
    id: 'sensitivity-verilog', check: 'sensitivity', re: /missing in the sensitivity list of always block\. The missing signals are: (.+)$/,
    en: { explain: "The always block reads $1 but they are not in its event list @(…). The simulation does not re-evaluate the block when they change, while synthesis builds the logic as if they were listed: simulation and hardware differ.",
      fix: "Write always @* (or always @(*)) for combinational logic: Verilog then puts every signal read in the list for you." },
    pt: { explain: "O bloco always lê $1 mas estes sinais não estão na sua lista de eventos @(…). A simulação não volta a avaliar o bloco quando eles mudam, enquanto a síntese constrói a lógica como se estivessem na lista: a simulação e o hardware ficam diferentes.",
      fix: "Escreva always @* (ou always @(*)) para lógica combinatória: assim o Verilog põe na lista todos os sinais lidos." },
  },
  {
    id: 'multi-driver', check: 'multi-driver', re: /^Signal <([^>]+)> in unit <([^>]+)> is connected to multiple drivers \((.+)\)/,
    en: { explain: "'$1' is assigned in more than one place ($3): two processes / always blocks, or a process and a concurrent assignment, or an instance output plus an assignment. In hardware that is two outputs wired together (a short circuit); in simulation the value becomes X. ISE stops with an error.",
      fix: "Assign '$1' in one process / always block only: put all the assignments of '$1' together (use if / case to choose the value), or use a different signal for each place and combine them (e.g. with a multiplexer)." },
    pt: { explain: "'$1' é atribuído em mais do que um sítio ($3): dois process / blocos always, ou um process e uma atribuição concorrente, ou a saída de uma instância e uma atribuição. No hardware isso são duas saídas ligadas uma à outra (um curto-circuito); na simulação o valor fica X. O ISE para com um erro.",
      fix: "Atribua '$1' num único process / bloco always: junte todas as atribuições de '$1' (use if / case para escolher o valor), ou use um sinal diferente em cada sítio e combine-os (p. ex. com um multiplexador)." },
  },
  {
    id: 'comb-loop', check: 'comb-loop', re: /form a combinatorial loop: (.+)\.$/,
    en: { explain: "There is a combinational path from a signal back to itself ($1) without any flip-flop in between, e.g. 'a <= b; b <= not a;' or 'count <= count + 1' outside a clocked process. Such a loop oscillates or stays unknown (X): it is not a useful circuit.",
      fix: "Break the loop with a register: compute the new value in a clocked process (if rising_edge(clk) then count <= count + 1;). Otherwise check that you did not use the output of a block as its own input by mistake." },
    pt: { explain: "Há um caminho combinatório de um sinal de volta a si próprio ($1) sem nenhum flip-flop pelo meio, p. ex. 'a <= b; b <= not a;' ou 'count <= count + 1' fora de um process com relógio. Um ciclo assim oscila ou fica desconhecido (X): não é um circuito útil.",
      fix: "Quebre o ciclo com um registo: calcule o novo valor num process com relógio (if rising_edge(clk) then count <= count + 1;). Caso contrário, verifique se não usou por engano a saída de um bloco como a sua própria entrada." },
  },
  {
    id: 'unassigned-output', check: 'unassigned-output', re: /^Signal <([^>]+)>, unconnected in block <([^>]+)>/,
    en: { explain: "The output '$1' of '$2' is never assigned, so it is stuck at a constant value (its initial value, or undefined U / X in simulation).",
      fix: "Assign it: a concurrent assignment ('$1 <= …;' / 'assign $1 = …;') or an assignment in a process / always block. If it is not needed, remove the port." },
    pt: { explain: "A saída '$1' de '$2' nunca é atribuída, por isso fica presa a um valor constante (o valor inicial, ou indefinido U / X na simulação).",
      fix: "Atribua-a: uma atribuição concorrente ('$1 <= …;' / 'assign $1 = …;') ou uma atribuição num process / bloco always. Se não for precisa, retire o porto." },
  },
  {
    id: 'unused-input', check: 'unused-input', re: /^Input <([^>]+)> is never used/,
    en: { explain: "The input '$1' is never read inside the module: whatever is connected to it has no effect.",
      fix: "Use it in the logic where it is needed (check for a typo: another name may be used instead of '$1'), or remove the port if it is not needed." },
    pt: { explain: "A entrada '$1' nunca é lida dentro do módulo: o que lhe estiver ligado não tem efeito.",
      fix: "Use-a na lógica onde é precisa (verifique se não há um erro de escrita: outro nome pode estar a ser usado em vez de '$1'), ou retire o porto se não for preciso." },
  },
  {
    id: 'unused-signal', check: 'unused-signal', re: /^Signal <([^>]+)> is assigned but never used/,
    en: { explain: "'$1' gets a value but nothing reads it, so the logic that computes it is useless (synthesis removes it).",
      fix: "Use '$1' where it was meant to be used (perhaps an output should be assigned from it), or remove it." },
    pt: { explain: "'$1' recebe um valor mas nada o lê, por isso a lógica que o calcula é inútil (a síntese retira-a).",
      fix: "Use '$1' onde devia ser usado (talvez uma saída deva ser atribuída a partir dele), ou retire-o." },
  },
  {
    id: 'unassigned-signal', check: 'unassigned-signal', re: /^Signal <([^>]+)> is used but never assigned/,
    en: { explain: "'$1' is read but never gets a value: it is undefined (U / X) in simulation and tied to 0 in hardware.",
      fix: "Assign '$1' (in a process or a concurrent assignment), give it an initial value if it is a constant (or declare it as a constant), or check whether another signal was meant." },
    pt: { explain: "'$1' é lido mas nunca recebe um valor: fica indefinido (U / X) na simulação e ligado a 0 no hardware.",
      fix: "Atribua '$1' (num process ou numa atribuição concorrente), dê-lhe um valor inicial se for uma constante (ou declare-o como constant), ou verifique se queria usar outro sinal." },
  },
  {
    id: 'clock-as-data', check: 'clock-as-data', re: /^Clock signal <([^>]+)> is used as data/,
    en: { explain: "'$1' is a clock (it is used with rising_edge / posedge), but here it is also used as an ordinary logic value (in an assignment or a condition). On an FPGA clocks run on special clock networks; mixing them with logic causes skew and glitches.",
      fix: "Use '$1' only in the clock edge (rising_edge($1) / posedge $1). To see a clock on a LED, divide it with a counter; to detect a slow signal's edge, sample it in a clocked process." },
    pt: { explain: "'$1' é um relógio (é usado com rising_edge / posedge), mas aqui também é usado como um valor lógico normal (numa atribuição ou numa condição). Numa FPGA os relógios usam redes de relógio especiais; misturá-los com lógica causa desvios (skew) e glitches.",
      fix: "Use '$1' só na transição do relógio (rising_edge($1) / posedge $1). Para ver um relógio num LED, divida-o com um contador; para detetar a transição de um sinal lento, amostre-o num process com relógio." },
  },
  {
    id: 'data-as-clock', check: 'data-as-clock', re: /^Signal <([^>]+)> is used as a clock but it is generated by logic/,
    en: { explain: "'$1' is used as a clock but it is produced by logic (a divider, a gate, a register…), not by a clock input. Such derived / gated clocks do not use the FPGA's clock network: timing is unpredictable and ISE warns about it.",
      fix: "Keep a single clock (the board clock) for every process and use '$1' as a clock enable: if rising_edge(clk) then if $1 = '1' then … end if; end if; (make '$1' a one-cycle pulse, e.g. when the divider counter reaches its end)." },
    pt: { explain: "'$1' é usado como relógio mas é produzido por lógica (um divisor, uma porta, um registo…), não por uma entrada de relógio. Estes relógios derivados não usam a rede de relógio da FPGA: a temporização fica imprevisível e o ISE avisa.",
      fix: "Use um único relógio (o relógio da placa) em todos os process e use '$1' como enable: if rising_edge(clk) then if $1 = '1' then … end if; end if; (faça de '$1' um impulso de um ciclo, p. ex. quando o contador do divisor chega ao fim)." },
  },
  {
    id: 'blocking', check: 'blocking', re: /^Blocking assignment \(=\) to <([^>]+)> in a clocked always block/,
    en: { explain: "In a clocked always block (@(posedge clk)) registers should be assigned with '<=' (non-blocking): all of them then change together at the clock edge. With '=' the order of the statements matters and the simulation may not match the hardware (race conditions between blocks).",
      fix: "Write '$1 <= …;'. Rule of thumb: '<=' in always @(posedge clk), '=' in always @*." },
    pt: { explain: "Num bloco always com relógio (@(posedge clk)) os registos devem ser atribuídos com '<=' (não bloqueante): assim todos mudam ao mesmo tempo na transição do relógio. Com '=' a ordem das instruções importa e a simulação pode não corresponder ao hardware (corridas entre blocos).",
      fix: "Escreva '$1 <= …;'. Regra prática: '<=' em always @(posedge clk), '=' em always @*." },
  },
  {
    id: 'nonblocking', check: 'nonblocking', re: /^Non-blocking assignment \(<=\) to <([^>]+)> in a combinational always block/,
    en: { explain: "In a combinational always block (@*) use '=' (blocking): the block then computes its outputs in order, like a function. With '<=' a value assigned in the block is not visible to the following statements in the same pass, so the simulation may show old values.",
      fix: "Write '$1 = …;'. Rule of thumb: '=' in always @*, '<=' in always @(posedge clk)." },
    pt: { explain: "Num bloco always combinatório (@*) use '=' (bloqueante): assim o bloco calcula as saídas por ordem, como uma função. Com '<=' um valor atribuído no bloco não é visto pelas instruções seguintes na mesma passagem, por isso a simulação pode mostrar valores antigos.",
      fix: "Escreva '$1 = …;'. Regra prática: '=' em always @*, '<=' em always @(posedge clk)." },
  },
  {
    id: 'case-default', check: 'case-default', re: /^Case statement without '(when others|default)'/,
    en: { explain: "This case statement does not have a '$1' branch, so some values of the selector are not handled. In a combinational process the outputs then keep their old value for those values (a latch). In VHDL a case on std_logic / std_logic_vector must cover every value (also 'X', 'Z'…), so ISE requires 'when others'.",
      fix: "Add a last branch: VHDL 'when others => y <= …;' (or 'when others => null;' in a clocked process); Verilog 'default: y = …;'." },
    pt: { explain: "Esta instrução case não tem um ramo '$1', por isso alguns valores do seletor não são tratados. Num process combinatório as saídas ficam então com o valor antigo para esses valores (um latch). Em VHDL um case sobre std_logic / std_logic_vector tem de cobrir todos os valores (também 'X', 'Z'…), por isso o ISE exige 'when others'.",
      fix: "Acrescente um último ramo: VHDL 'when others => y <= …;' (ou 'when others => null;' num process com relógio); Verilog 'default: y = …;'." },
  },
  {
    id: 'integer-range', check: 'integer-range', re: /^(?:Signal|Variable) <([^>]+)> is an integer without a range/,
    en: { explain: "'$1' is an integer without a range, so synthesis builds it with 32 bits even if it only counts to a few values (wasted logic, slower counters).",
      fix: "Give it the range it really needs, e.g. 'signal $1 : integer range 0 to 99;' (7 bits), or use unsigned(6 downto 0)." },
    pt: { explain: "'$1' é um inteiro sem gama (range), por isso a síntese constrói-o com 32 bits mesmo que só conte até poucos valores (lógica desperdiçada, contadores mais lentos).",
      fix: "Dê-lhe a gama de que realmente precisa, p. ex. 'signal $1 : integer range 0 to 99;' (7 bits), ou use unsigned(6 downto 0)." },
  },
];

const BY_CHECK = new Map();
for (const h of HINTS) if (h.check && !BY_CHECK.has(h.check)) BY_CHECK.set(h.check, []);
for (const h of HINTS) if (h.check) BY_CHECK.get(h.check).push(h);

const fill = (s, m) => s.replace(/\$(\d)/g, (_, k) => (m && m[+k] !== undefined ? m[+k] : ''));

/** Help of a diagnostic: { id, en: { explain, fix }, pt: { explain, fix } } or null. */
export function hintFor(d) {
  if (!d || !d.message) return null;
  const msg = String(d.message);
  let h = null, m = null;
  if (d.check && BY_CHECK.has(d.check)) {
    const list = BY_CHECK.get(d.check);
    for (const x of list) { const mm = x.re ? x.re.exec(msg) : null; if (mm) { h = x; m = mm; break; } }
    if (!h) h = list[0];
  }
  if (!h) for (const x of HINTS) { if (!x.re) continue; const mm = x.re.exec(msg); if (mm) { h = x; m = mm; break; } }
  if (!h) return null;
  const tr = L => ({ explain: fill(L.explain, m), fix: fill(L.fix, m) });
  return { id: h.id, en: tr(h.en), pt: tr(h.pt) };
}

/** { explain, fix } of a diagnostic in a language ('en' | 'pt'; English when missing), or null. */
export function hintText(d, lang = 'en') {
  const h = hintFor(d);
  return h ? (h[lang] || h.en) : null;
}

export const HINT_LABELS = {
  en: { explain: 'Explanation', fix: 'How to fix', more: 'Explanation and fix' },
  pt: { explain: 'Explicação', fix: 'Como corrigir', more: 'Explicação e correção' },
};
