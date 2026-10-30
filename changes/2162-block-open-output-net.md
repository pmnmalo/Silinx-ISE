In detail:

- **A block's output left unconnected declares no net (#2162):** core/schdoc-hdl.js no longer declares the net of a
  block's output left unconnected (ADD's CO, a flip-flop's Q with only QN wired), which the instance leaves out of its
  port map: XST warned that it was never used or assigned (Xst:1780). Test: test/schdoc-hdl.test.js.
