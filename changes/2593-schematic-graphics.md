In short:

- **Annotate a schematic:** the schematic editor's new Add Graphics menu draws text, lines, rectangles, circles and
  arcs on the sheet, as ISE's Add menu does. They change nothing of the circuit: they are selected, moved, copied,
  deleted and undone like the rest, their text and size edited in the Properties panel, and kept in the ISE
  schematics Silinx imports and exports.

In detail:

- **Graphics on the schematic sheet (#2593):** a document's `graphics` (`core/schgraphics.js`: text, line, rectangle,
  circle, and an arc through three points), ignored by the netlist, the HDL and the check; the Add Graphics menu after
  Add I/O Marker (Add Text also by T): a text typed where the sheet is clicked, a line, a rectangle or a circle (from its
  centre) dragged, an arc dragged from its start to its end then its bulge clicked; drawn under the circuit, picked by
  their lines (a rectangle's inside still picks what is in it), selected by the band, moved, copied and pasted, deleted;
  the Properties panel edits a text's lines and size and a shape's points, several texts' size at once; printed and fitted
  with the rest. The ISE importer places the sheet's texts and drawings instead of warning that it drops its texts, and the
  exporter writes them (`core/isesch-graphics.js`, ISE's arcs drawn with their angle decreasing).
