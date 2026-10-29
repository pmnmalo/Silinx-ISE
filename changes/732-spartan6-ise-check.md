In detail:

- **Spartan-6: the open flow's routings checked by ISE (#732):** research/s6/flow-xdl6.mjs writes the examples as the
  open flow routes them, and ISE checks them and writes their bitstreams. ISE's DRC finds no error. The seven Nexys3
  examples' bitstreams (bitstreamS6) are byte-identical with ISE's bitgen of the same routings, as are the Atlys's
  gates and pong. The rest is in the research note.
