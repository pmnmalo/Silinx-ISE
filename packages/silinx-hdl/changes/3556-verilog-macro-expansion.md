In detail:

- **Verilog macros' expansion in linear time (#3556):** src/verilog/lexer.js reads the text through a window, a macro's
  body the window and the text after its use set aside, rather than rebuilding the whole text at each use (quadratic).
  Its limits are the depth of nested expansions (1000) and the text the macros add (8 MB), each one error; it counted
  uses (100,000). The repository's Verilog files lex to the same tokens.
