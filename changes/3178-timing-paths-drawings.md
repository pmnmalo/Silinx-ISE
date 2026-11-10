In short:

- **The critical path in the drawings:** Show Path in the timing report's Paths panel also opens the state diagram, ASM
  chart or schematic a path's module is generated from, with the states, transitions, boxes, symbols and wires on the
  path marked.

In detail:

- **Show Path in the drawings (#3178):** `core/path-drawing.js` finds a drawing's elements on a timing path by the
  drawing's own names: the named nets next to the stages of its module and the signals their cells drive (a state
  diagram's states when the path starts or ends in the state register, the transitions whose condition reads the path,
  the states or transitions driving its output; an ASM chart's boxes that read or assign its signals and the arrows
  between them; a schematic's wires of its nets and the symbols driving them). `web/js/drawing-path.js` marks them in the
  drawing's editor (kept over a redraw, cleared by the next Show Path), and the MCP server's `timing_paths` lists them
  with a path's highlight. On blinky's ASM chart and traffic's state diagram, their HDL generated in VHDL and in
  Verilog, every path marks some of their elements, the slowest the same in both languages.
