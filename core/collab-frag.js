// A shared project's frames over a transport whose messages are small (#3227: a WebRTC data channel, whose messages are
// 256 KB at most in Chrome, 16 KB everywhere): a frame larger than a part sent as parts, joined again at the other end
// before the room or the participant sees it. A part is [PART][more (1: another follows, 0: the last)][bytes]: never a
// frame's own first byte (its kind, core/collab-client.js KIND). Text (the control's JSON) is never split.
//   splitFrame(bytes, size) -> [part, …] (the frame itself when it fits)
//   frameJoiner(max) -> push(bytes) -> the frame (whole), or null (a part: more to come); an error past `max` bytes
export const PART = 0xf0;
export const PART_SIZE = 16 << 10;

/** A frame as the messages to send. */
export function splitFrame(bytes, size = PART_SIZE) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length <= size) return [b];
  const out = [];
  const step = size - 2;
  for (let i = 0; i < b.length; i += step) {
    const piece = b.subarray(i, Math.min(b.length, i + step));
    const p = new Uint8Array(piece.length + 2);
    p[0] = PART;
    p[1] = i + step < b.length ? 1 : 0;
    p.set(piece, 2);
    out.push(p);
  }
  return out;
}

/** The frames of the messages received, in their order: parts joined, `max` bytes at most a frame. */
export function frameJoiner(max) {
  let parts = [], n = 0;
  return {
    push(bytes) {
      const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      if (b[0] !== PART) {
        if (parts.length) throw new Error('a frame within the parts of another');
        return b;
      }
      if (b.length < 3 || b[1] > 1) throw new Error('a broken part');
      n += b.length - 2;
      if (n > max) { parts = []; n = 0; throw new Error('a message too large'); }
      parts.push(b.subarray(2));
      if (b[1] === 1) return null;
      const out = new Uint8Array(n);
      let at = 0;
      for (const p of parts) { out.set(p, at); at += p.length; }
      parts = []; n = 0;
      return out;
    },
  };
}
