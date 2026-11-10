In short:

- **State diagrams: a transition takes the shape you draw:** drawn with the mouse, a pen or a finger, a transition
  follows the stroke and comes out curved as drawn; a stroke that leaves a state and comes back to it makes a
  self-loop on that side, easy to draw with a pen on a tablet.

In detail:

- **A transition drawn as a stroke in the state diagram editor (#3286):** the connect drag's preview is the path drawn,
  not a straight line; on release a transition between two states gets the `bend` of the editor's arc nearest to the
  stroke (`core/fsm-stroke.js`: a least-squares fit, refined against the arc as it is drawn; a straight stroke, under
  the 8 px threshold, keeps the default bend), and a self-loop the `angle` of the stroke's farthest point from the
  state, whatever its size (it needed a release 6 px from the press before); a pen's or a finger's rim is 12 px wide
  (the mouse's 7). The second finger (#674) still drops the stroke. MCP: `write_file`'s description names a
  transition's `bend` and a self-loop's `angle`, tested.
