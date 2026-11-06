In short:

- **Boolean Algebra, canonical forms:** the results show the canonical SOP (the sum of the minterms) and the
  canonical POS (the product of the maxterms) in full, every input in every term, in the notation chosen; the
  Σm / ΠM lists follow them. The MCP server returns these results too.

In detail:

- **The canonical forms as expressions (#2927):** `canonicalAsts` (`core/logic.js`) builds the sum of the
  minterms and the product of the maxterms as expressions (the don't cares left out; no minterm: 0, no maxterm: 1);
  the editor's results show them first, then "Minterm and maxterm lists", where "Canonical forms" showed only the
  lists; a table of 8 inputs wraps in the panel. `related_view`'s new view `results` returns a truth table's
  results as the editor shows them (#2674). In Portuguese: Forma canónica SOP / POS, Listas de mintermos e maxtermos.
