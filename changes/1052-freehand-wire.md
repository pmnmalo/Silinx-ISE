In short:

- **A wire drawn as one stroke:** with Add Wire, trace a stroke with the pen, a finger or the mouse from a pin or
  a wire to another one, along any curve: it becomes a wire between them, routed square around the symbols.
  Clicking corner by corner works as before.

In detail:

- **Add Wire: a freehand stroke made into a routed wire (#1052):** a press on a pin, an I/O marker or a wire
  that moves 16 screen pixels or more is a stroke, shown as a light ink trail; lifted on another pin, marker or
  wire, the wire router (`routePath`) joins the two points with a square wire clear of the other wires and the
  bodies, and the stroke's shape is dropped. The drawn wire's rules hold (it connects at its ends only, a wire
  between two named nets is refused). A stroke lifted elsewhere, or where it started, leaves the drawing
  unchanged; a shorter press is a click, the wire drawn corner by corner as before; a second finger pans and
  zooms. The Add Wire hint says so, in Portuguese too (`web/js/sch-stroke.js`).
