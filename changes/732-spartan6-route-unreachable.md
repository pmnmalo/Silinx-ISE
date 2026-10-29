In detail:

- **Spartan-6: the router fast when a sink cannot be reached on the switches allowed (#732):** with the open flow's
  known switches only, a sink no allowed switch reached was searched again on every pass, over the whole device,
  and the passes went on to their limit. The Atlys's stopwatch took over an hour; it now takes 142 s, both routings
  included. Such a sink is now searched once (packages/silinx-fpga/src/fpga/s6/route.js), and the passes end when
  nothing is shared and only those sinks are left. Tests: test/s6-route.test.js.
