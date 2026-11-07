In short:

- Rearrange Wires spaces the wires that run side by side between the symbols evenly, and orders them with the fewest
  crossings (jumps).
- Rearrange Wires and Rearrange Schematic for an AI assistant: the MCP tools `rearrange_wires` and `rearrange_schematic`.

In detail:

- **Rearrange Wires' channels (#1994):** once the wires are routed again, the runs that can slide sideways without a
  new bend (a wire's middle segment between two bends that turn the same way), side by side over the same free strip,
  are a channel (`core/schchannels.js`). A channel's runs take the order with the fewest crossings (every order of up
  to six runs, swaps of neighbours for more) and are spread over the strip at an even pitch, the gaps between
  neighbours and to the strip's walls equal within a grid step. A channel changes only when every wire stays clear, no
  net name is taken in, and the sheet has no more crossings and fewer of them or more even gaps; the connections are
  checked after. On the examples' schematics and the schematic corpus (67 sheets): the uneven channels 44 -> 9, the
  bends and crossings never more (1513 both ways: the router had already taken off the crossings a channel's order
  can); on the examples' top schematics made untidy, a few crossings fewer (blinky 11 -> 9). `test/schchannels.test.js`, the UI test of Rearrange Wires.
- **The MCP server's `rearrange_wires` and `rearrange_schematic` (#1994, #2674):** what the schematic editor's menu
  does, through the same functions and with the same messages (the selection's wires, `selectionWires`, and the notes,
  `wiresNote` and `sheetNote`, moved to `core/`); the schematic written and its HDL file made again.
  `test/mcp-schematic.test.js`.
