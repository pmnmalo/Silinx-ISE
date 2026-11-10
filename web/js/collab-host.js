// A shared project hosted by the owner's page (#3227, the browser edition, which has no server; on a server edition,
// when the owner asks for it): the room in the page (core/collab-loop.js), the followers over WebRTC (collab-rtc.js),
// each connected by two codes exchanged by hand: the follower's, which they get when they open the link, and the
// owner's answer to it (Add a Follower…). Every message in the console.
//   hostRoom() -> { hosted, WebSocket }: the room of a share (collab-share.js startSharing), the owner's socket to it
//   addFollowerDialog(share): a follower's code taken, the answer's shown; the follower in the room once connected
//   hostSocket(link): the follower's side (the meeting point first, collab-meet.js), its code shown and the owner's
//                   asked; a WebSocket class for followRoom
import { h, dialog } from './ui.js';
import { app } from './app.js';
import { writeClip } from './clipboard.js';
import { hostedRooms } from '/core/collab-loop.js';
import { followerOffer, ownerAnswer, channelSocket, channelEnd } from './collab-rtc.js';

const codeField = (value, field) => h('textarea', { class: 'collab-code', rows: 4, readonly: value !== undefined ? '' : null, spellcheck: 'false', 'data-field': field, 'data-no-i18n': '', style: { width: '100%' } }, value ?? '');
const copyButton = (text, what) => h('button', { type: 'button', class: 'btn collab-copy', onclick: () => { writeClip('text', text); app.log(`${what} copied.`, 'ok'); } }, 'Copy Code');

/** The room of a share hosted by this page, and the owner's socket to it. */
export function hostRoom() {
  const hosted = hostedRooms();
  return { hosted, WebSocket: hosted.owner };
}

/** Add a Follower…: their code (got when they opened the link) taken; the answer's code shown, for them. */
export async function addFollowerDialog(share) {
  const input = codeField(undefined, 'code');
  const code = await dialog({
    title: 'Add a Follower',
    body: h('div', { class: 'collab-dlg' },
      h('p', {}, 'A follower gets a code when they open the link: paste it here.'),
      input),
    buttons: [{ label: 'Connect', primary: true, value: () => input.value.trim() }, { label: 'Cancel', value: null }],
    onOpen: () => setTimeout(() => input.focus(), 0),
  });
  if (!code || !share.hosted) return null;
  let ans;
  try { ans = await ownerAnswer({ key: share.session.key, room: share.session.room, code }); } catch (e) { app.log(`ERROR: Add a Follower: ${e.message}.`, 'err'); return null; }
  ans.channel.then(dc => { if (share.hosted) share.hosted.follower(channelEnd(dc, ans.pc)); else ans.close(); },
    e => app.log(`WARNING: Add a Follower: ${e.message}.`, 'warn'));
  app.log('Add a Follower: send your code back to the follower; they are in once they paste it.', 'info');
  await dialog({
    title: 'Add a Follower',
    body: h('div', { class: 'collab-dlg' },
      h('p', {}, 'Send this code back to the follower: they paste it to connect.'),
      codeField(ans.code, 'answer'), copyButton(ans.code, 'Your code')),
    buttons: [{ label: 'Close', primary: true, value: true }],
  });
  return ans.code;
}

/** The follower's side of a room the owner's page hosts: the owner found at the meeting point when the link has their
 *  key (collab-meet.js); else, or failing that, their code shown and the owner's asked; then the socket. */
export async function hostSocket(link) {
  if (link.host) {
    const met = await (await import('./collab-meet.js')).findOwner(link);
    if (met !== 'codes') return met;
  }
  let offer;
  try { offer = await followerOffer({ key: link.key, room: link.room }); } catch (e) { app.log(`ERROR: Follow a shared project: ${e.message}.`, 'err'); return null; }
  const answer = codeField(undefined, 'answer');
  const code = await dialog({
    title: 'Connect to the Owner',
    body: h('div', { class: 'collab-dlg' },
      h('p', {}, 'The owner\'s page shares this project itself. Send them your code (Add a Follower…, in their toolbar), then paste the code they send back.'),
      h('label', {}, 'Your code:'), codeField(offer.code, 'code'), copyButton(offer.code, 'Your code'),
      h('label', {}, 'The owner\'s code:'), answer),
    buttons: [{ label: 'Connect', primary: true, value: () => answer.value.trim() }, { label: 'Cancel', value: null }],
  });
  if (!code) { offer.close(); return null; }
  let dc;
  try { dc = await offer.accept(code); } catch (e) { offer.close(); app.log(`ERROR: Follow a shared project: ${e.message}.`, 'err'); return null; }
  return function HostChannelSocket() { return channelSocket(dc, offer.pc); };
}
