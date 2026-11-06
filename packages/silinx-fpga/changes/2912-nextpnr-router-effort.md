In short:

- **nextpnr-himbaechel-spartan3e 1.1.0:** a congested design no longer takes router 1 tens of minutes: past its budget
  router 2 routes it.

In detail:

- **nextpnr-himbaechel-spartan3e 1.1.0 (#2912).** nextpnr-spartan's PR 13 (8d8106e1): router 1 stops past 30000 wires
  visited per arc to route or 200 million in all (`-o max-visits-per-arc=<n>`, `-o max-visits=<n>`, 0 for no limit),
  and router 2 routes the design from there (router 1's weak wires unbound first). The budget counts wires visited, not
  time, so the WebAssembly and native builds route alike. The designs router 1 routes within it (every test of the
  package's, the corpus's largest processors: serv, picorv32, neorv32) route as on 1.0.0.
