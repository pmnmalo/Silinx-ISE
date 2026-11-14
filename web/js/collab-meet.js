// The public meeting point of a shared project the owner's page hosts (#3227, the browser edition): the owner's page
// waits there for its followers, and a follower's page, opening a link with the owner's key (…host.<owner's key>),
// finds the owner there, so opening the link is enough (core/collab-meet.js: the owner's proof, every other peer
// ignored). The meeting point is Trystero's torrent strategy (@trystero-p2p/torrent, public WebTorrent trackers), with
// the STUN servers of the codes' WebRTC (collab-rtc.js); this browser's setting silinx.collab.meeting = 'local' takes a
// meeting point between this browser's pages instead (the tests'). The codes exchanged by hand stay as the fall-back:
// the follower's after MEET_MS with no owner, or at their choice (Exchange Codes Instead). Every message in the console.
//   meetFollowers(share, hostKey): the owner's page at the meeting point (its followers attached to its room)
//   findOwner(link) -> a WebSocket class for followRoom, 'codes' (the codes instead) or null (cancelled); the class's
//                    rejoin(): the owner found there again, with no dialog (#3835: its connection lost, made again)
//   publicServers(link) -> the follow dialog's line naming the public servers a hosted room's follower reaches (#3361)
import { h, dialog } from './ui.js';
import { app } from './app.js';
import { prefKey } from './prefs.js';
import { iceServers } from './collab-rtc.js';
import { meetAsHost, meetOwner, channelMeeting, trysteroMeeting, MEET_MS, TRACKERS } from '/core/collab-meet.js';
import { FOLLOWER_JOIN } from '/core/collab-loop.js';

/** This browser's meeting point: '' (the public one, Trystero's) or 'local' (between this browser's pages). */
export const MEETING_KEY = prefKey('silinx.collab.meeting');
const OWNER_MAX = 16 << 20;

/** The meeting point this page uses. */
export async function meetingPoint() {
  let which = '';
  try { which = localStorage.getItem(MEETING_KEY) || ''; } catch { /* the public one */ }
  if (which === 'local') return channelMeeting();
  const { joinRoom, selfId } = await import('@trystero-p2p/torrent');
  return trysteroMeeting({ joinRoom, selfId, rtcConfig: { iceServers: iceServers() } });
}

/** The public servers a follower's page reaches for a room its owner's page hosts (#3361), named before it joins, since
 *  they see its IP address: the meeting point's trackers (a link with the owner's key, the public meeting point) and the
 *  STUN servers; null: none (this browser's settings name none). */
export function publicServers(link) {
  let local = false;
  try { local = localStorage.getItem(MEETING_KEY) === 'local'; } catch { /* the public one */ }
  const trackers = link.host && !local ? TRACKERS.map(t => new URL(t).host) : [];
  const stun = iceServers().flatMap(s => s.urls).map(u => String(u).replace(/^stuns?:/i, ''));
  const parts = [trackers.length ? `the WebTorrent trackers ${trackers.join(', ')} (to find its owner)` : null, stun.length ? `the STUN server${stun.length > 1 ? 's' : ''} ${stun.join(', ')}` : null].filter(Boolean);
  return parts.length ? `This page connects to public servers, which see your IP address: ${parts.join(' and ')}.` : null;
}

/** The owner's page at the meeting point: each follower that finds it there gets its proof, then joins its room. */
export async function meetFollowers(share, hostKey) {
  try {
    return await meetAsHost({ meeting: await meetingPoint(), room: share.session.room, key: share.session.key, hostKey, maxReceive: FOLLOWER_JOIN, attach: end => share.hosted?.follower(end) });
  } catch (e) {
    app.log(`WARNING: Share Project: the meeting point is out of reach (${e.message}): each follower connects with a code instead (Add a Follower…).`, 'warn');
    return null;
  }
}

/** The owner looked for at the meeting point again, MEET_MS at most, with no dialog (#3835: a follower's connection
 *  lost, core/collab-client.js followRoom's transport): a WebSocket class; an error when not found (tried again later). */
async function ownerAgain(link) {
  return meetOwner({ meeting: await meetingPoint(), room: link.room, key: link.key, host: link.host, ms: MEET_MS, maxReceive: OWNER_MAX });
}

/** A follower looking for the owner at the meeting point, MEET_MS at most; the codes on their choice or after. */
export async function findOwner(link) {
  const ac = new AbortController();
  let found = null, gaveUp = false;
  const buttons = [{ label: 'Exchange Codes Instead', value: () => (found ? 'found' : 'codes') }, { label: 'Cancel', value: null }];
  const meet = meetingPoint().then(meeting => meetOwner({ meeting, room: link.room, key: link.key, host: link.host, ms: MEET_MS, signal: ac.signal, maxReceive: OWNER_MAX }));
  meet.then(ws => { if (ac.signal.aborted) { new ws().close(); return; } found = ws; buttons[0].el?.click(); }, e => { gaveUp = !ac.signal.aborted && e.message; buttons[0].el?.click(); });
  const how = await dialog({
    title: 'Connect to the Owner',
    body: h('div', { class: 'collab-dlg' },
      h('p', {}, 'Looking for the owner at the meeting point…'),
      h('p', {}, 'If they cannot be found there, you exchange codes with them instead.')),
    buttons,
  });
  if (how === 'found') { app.log('Follow a shared project: the owner was found at the meeting point.', 'info'); found.rejoin = () => ownerAgain(link); return found; }
  ac.abort();
  if (how === null) return null;
  app.log(gaveUp ? `WARNING: Follow a shared project: ${gaveUp} (in ${MEET_MS / 1000} s): exchange codes with them instead.` : 'Follow a shared project: codes exchanged with the owner instead of the meeting point.', gaveUp ? 'warn' : 'info');
  return 'codes';
}
