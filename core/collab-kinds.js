// The drawings a shared project's participants edit live (#3183, phase 3 of #3180), by kind: one editor after the other,
// as the issue orders them (the FSM first, the schematic last). Their structure: core/collab-model.js; this module is
// light, read by the pages at start-up (web/js/collab-state.js).
export const LIVE_KINDS = Object.freeze({ fsm: /\.fsm\.json$/i });

/** The kind of the drawing at `path` that is edited live (null: none). */
export function drawingKind(path) {
  for (const [k, re] of Object.entries(LIVE_KINDS)) if (re.test(String(path))) return k;
  return null;
}
export const liveDrawing = p => drawingKind(p) !== null;
