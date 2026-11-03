In short:

- View Implemented Design (FPGA): its side panel looks and folds as the Design editors' Properties panel, each of its
  sections folded by its title; on a narrow window it opens over the chip from the toolbar's ☰ Properties.

In detail:

- **View Implemented Design (FPGA): the side panel as the diagram editors' Properties (#2668):** a Properties title
  whose button folds the panel to a strip (remembered, side-fold.js); Device, Modules, Selection and Nets sections
  folded by their titles; under 1024 px the panel over the chip, shown and hidden by ☰ Properties in the toolbar
  (narrow.js); a row scrolled into view no longer hides under the panel's title. Test: test/ui/fpgaview.test.js.
