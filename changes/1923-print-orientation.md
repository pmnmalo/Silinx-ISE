In short:
- Print: every document (an HDL source, the Design Summary and reports, SSim's waveforms, the Board Emulator, a truth table) now asks for the paper and the orientation, portrait or landscape, as the drawings do.

In detail:
- Print: a document that is not a drawing opens a print dialog: Paper (A4, A3, Letter) and Orientation (Automatic, Portrait, Landscape), the last choice kept for the next print. The page's `@page` rule had fixed A4 and the orientation (a source always portrait), so the browser's dialog could not change it either. Automatic stays as it was: landscape when a copy of a document is wider than the page; the copy is fitted to the page chosen (#1923).
