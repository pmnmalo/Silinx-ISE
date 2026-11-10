// A shared project's room hosted by a page of its own (#3227: the browser edition's owner, with no server): the room
// (core/collab-room.js) runs in the owner's page, the owner's own participant (core/collab-client.js shareRoom) reaches
// it through a pair of sockets in the page, and each follower through a transport of their own (a WebRTC data channel,
// web/js/collab-rtc.js), as a socket of the room. The participants are those of the server's relay, unchanged: the
// same protocol, the same sealed frames, the same checks.
//   socketPair() -> { client, room }: `client` as a WebSocket (readyState, binaryType, send, close, its events open,
//                   message, close, error); `room` as a room's socket (readyState, send(data, { binary }), close(code,
//                   reason)), whose messages and end go to its `onmessage(data, binary)` and `onclose()`
//   hostedRooms({ limits }) -> { rooms, owner (a WebSocket class for shareRoom), follower(end) (a room's socket of a
//                   follower attached: its frames larger than limits.followerFrame close it, 1009), closeRoom }
import { collabRooms, ROOM_LIMITS } from './collab-room.js';

/** A hosted room's limits: one room (the page's own project), a follower's frames as small as on the relay. */
export const HOST_LIMITS = Object.freeze({ ...ROOM_LIMITS, rooms: 1, followerFrame: 64 << 10 });

const later = f => setTimeout(f, 0);   // (as a network would: never within the call that sent)
const copy = d => (typeof d === 'string' ? d : new Uint8Array(d));
const event = (type, props = {}) => Object.assign(new Event(type), props);

/** Two connected sockets: the client's (as a WebSocket) and the room's. */
export function socketPair() {
  const client = new EventTarget();
  const room = { readyState: 1, onmessage: () => {}, onclose: () => {} };
  let ended = false;
  const end = (code = 1000, reason = '') => {
    if (ended) return;
    ended = true;
    client.readyState = room.readyState = 3;
    later(() => { room.onclose(); client.dispatchEvent(event('close', { code, reason, wasClean: true })); });
  };
  Object.assign(client, {
    readyState: 0, binaryType: 'arraybuffer', protocol: '',
    send(data) {
      if (client.readyState !== 1) throw new Error('the socket is not open');
      const d = copy(data);
      later(() => room.onmessage(d, typeof d !== 'string'));   // (sent before a close: delivered, as on a network)
    },
    close: (code, reason) => end(code, reason),
  });
  Object.assign(room, {
    send(data) {
      if (ended) return;
      const d = copy(data);
      later(() => client.dispatchEvent(event('message', { data: typeof d === 'string' ? d : d.buffer })));
    },
    close: (code, reason) => end(code, reason),
  });
  later(() => { if (!ended) { client.readyState = 1; client.dispatchEvent(event('open')); } });
  return { client, room };
}

/** The rooms of a page that hosts them. */
export function hostedRooms({ limits = HOST_LIMITS } = {}) {
  const host = collabRooms({ limits });
  const attach = (end, role, max = Infinity) => {
    const p = host.welcome(end, role);
    const size = d => (typeof d === 'string' ? d.length : d.byteLength);
    end.onmessage = (data, binary) => { if (size(data) > max) end.close(1009, 'a message too large'); else p.message(data, binary); };
    end.onclose = () => p.close();
    return end;
  };
  // (the owner's participant: `new owner(url, protocols)` connects it to the page's room, as a WebSocket would)
  const owner = function HostedOwnerSocket() { const { client, room } = socketPair(); attach(room, 'owner'); return client; };
  return { rooms: host.rooms, owner, follower: end => attach(end, 'follower', limits.followerFrame), closeRoom: host.closeRoom };
}
