In short:

- **Module Wizard without "Quick add" buttons:** its ports are only the ones added with Add Port, as in the other
  wizards.

In detail:

- **Module Wizard: no quick-add buttons (#2145):** the Inputs and Outputs page of New Source ▸ Module (HDL) ▸ Wizard >
  has no "Quick add (inputs / outputs / bidirectional)" rows; the port table (`portEditor`, `web/js/modwizard.js`) no
  longer has them for any wizard, and the list of their ports (`QUICK_PORTS`, `core/modgen.js`) and their labels'
  translations are gone.
