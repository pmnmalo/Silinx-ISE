In short:

- **Verilog macros expand in linear time:** a file of many macro uses (generated code) took minutes to check (99,000
  uses: 65 s); 200,000 uses now take about two seconds. A file of more than 100,000 uses is no longer refused as
  expanding "too deeply".

In detail:

- **Verilog macros' expansion in linear time (#3556):** the lexer (packages/silinx-hdl/src/verilog/lexer.js) replaced
  each use of a macro by rebuilding the whole text, a cost of the file's length per use. It reads the text through a
  window: a use makes its body the window and sets the text after it aside, brought back as the reading needs it; a
  name joined to many bodies (f4_`N) is read on rather than read again. Its limits are the depth of nested expansions
  (1000) and the text the macros add (8 MB, over a
  file and its includes), each one error that stops the expansion; it counted uses (100,000). Every Verilog file of
  the repository lexes to the same tokens, positions and expanded text. Tests: test/verilog-macro-expansion.test.js
  (100,000 and 200,000 uses, in a child process with a time limit, no warnings, about twice the time; a name joined to
  100,000 times, a body of 200,000 uses, an argument of 1 MB; a macro used in its own body, 1000 and 1001 nested
  expansions, a text doubling at each level: the errors exact).
