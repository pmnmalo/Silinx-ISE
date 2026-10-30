In detail:

- **Silinx HLS, the delays of a family (#2080):** `core/c-timing.js` estimates a path with the Artix-7's delays, as before, or
  with the Spartan-3E's, fitted on small designs through the open flow; the scheduling over cycles will use them. A `<=`
  now counts as a carry chain, as `<` does (it counted as nothing).
