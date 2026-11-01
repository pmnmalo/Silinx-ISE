In short:
- Process Properties has one Optimization: Fast (the quickest build), Area (the smallest circuit, the default of a new project) or Speed (the fastest circuit). The projects made before are Fast.

In detail:
- The Optimization, Fast, Area or Speed, kept as ISE's Optimization Goal and Effort (Speed / Normal, Area / High, Speed / High): with the Silinx toolchain, Fast synthesizes the usual mapping alone and makes one placement with no register replication; Area keeps the smaller of the usual mapping's netlist and Speed's (by slices, then LUTs: neither is always the smaller) with one placement; Speed tries every mapping for speed and several placements as High did (#2470).
