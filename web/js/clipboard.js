// The app's clipboard (#677): Cut / Copy / Paste of the Edit menu and the toolbar, for the text editors and
// the drawing editors. The system clipboard where the browser lets the page use it (a copy also reaches
// other applications and other tabs), and a clipboard of the app's own as the fallback (file://, a
// permission refused, a browser without the API): what was copied last in this session.
//
// A drawing is carried as text: a JSON object { silinx: <kind>, ... } (kind 'schematic', 'asm', 'fsm', …),
// so that a copy pasted into a text editor is readable and a copy from another tab can be pasted here.

let mem = null;   // { text, kind, data }: the last copy made in this session
const clone = o => (o == null ? o : JSON.parse(JSON.stringify(o)));

const encode = (kind, data) => JSON.stringify({ silinx: kind, ...data });
function decode(text, kind) {
  if (typeof text !== 'string' || !text.startsWith('{"silinx":')) return null;
  try { const o = JSON.parse(text); if (o?.silinx !== kind) return null; delete o.silinx; return o; } catch { return null; }
}

// a copy through the page's copy event (document.execCommand('copy')): synchronous, in the click's user
// gesture, allowed on file:// and without a permission where navigator.clipboard is not
function copyEvent(text) {
  let done = false;
  // (the focused editor's own copy handler not run: this copy is the one asked for)
  const on = e => { e.clipboardData?.setData('text/plain', text); e.preventDefault(); e.stopImmediatePropagation(); done = !!e.clipboardData; };
  document.addEventListener('copy', on, true);
  try { document.execCommand('copy'); } catch { /* not allowed */ } finally { document.removeEventListener('copy', on, true); }
  return done;
}

/** Copy text (kind 'text') or a drawing's selection (kind, data) to the clipboard. */
export function writeClip(kind, data, text = kind === 'text' ? data : encode(kind, data)) {
  mem = { text, kind, data: kind === 'text' ? null : clone(data) };
  if (!copyEvent(text)) navigator.clipboard?.writeText?.(text).catch(() => {});
}

// what a text read from the system clipboard holds for kind ('' or null: it could not be read)
function fromText(sys, kind) {
  if (typeof sys === 'string' && sys !== '') {
    if (kind === 'text') return sys;
    if (mem && sys === mem.text) return mem.kind === kind ? clone(mem.data) : null;
    return decode(sys, kind);
  }
  if (!mem) return null;
  if (kind === 'text') return mem.text;
  return mem.kind === kind ? clone(mem.data) : null;
}
// how long a read of the system clipboard is waited for: Firefox holds it until the viewer clicks its own Paste
// prompt, so that it never comes in a paste from a menu; past it, the app's own copy (#888)
export const READ_WAIT_MS = 300;
/** What is on the clipboard for kind ('text': any text), or null: the system clipboard's when it can be
 *  read (a copy made in another tab or application, newer than the app's), else the app's own. */
export async function readClip(kind, wait = READ_WAIT_MS) {
  let sys = null, timer = null;
  if (!await systemReadable()) return fromText(null, kind);
  const late = new Promise(ok => { timer = setTimeout(() => ok(null), wait); });
  try { sys = await Promise.race([navigator.clipboard?.readText?.(), late]); } catch { sys = null; } finally { clearTimeout(timer); }
  return fromText(sys, kind);
}
// whether the system clipboard is read at all: where the browser has a clipboard-read permission (Chromium), not
// refused. Firefox and Safari have none: they answer a read with a Paste prompt of their own, which stays open in
// the way of the next clicks (#888); there Ctrl+V pastes the system clipboard, a menu's Paste the app's own copy
async function systemReadable() {
  try {
    const p = await navigator.permissions?.query?.({ name: 'clipboard-read' });
    return (readable = !!p && p.state !== 'denied');
  } catch { return (readable = false); }
}
systemReadable();

/** The same, from a paste event (Ctrl+V: the browser gives the page the clipboard with no permission asked). */
export const clipFromEvent = (e, kind) => fromText(e.clipboardData?.getData('text/plain') ?? null, kind);

/** Ctrl+V in a drawing editor (its keydown, not prevented): the browser's paste event that follows reads the system
 *  clipboard with no permission asked; when the browser sends none (a page that is not editable), the clipboard
 *  read as Edit ▸ Paste does. paste(clip) gets what there is for kind. */
export function pasteFromKey(kind, paste) {
  let done = false, timer = null;
  const end = () => { done = true; clearTimeout(timer); removeEventListener('paste', on, true); };
  const on = e => { if (done) return; end(); e.preventDefault(); const c = clipFromEvent(e, kind); if (c) paste(c); };
  addEventListener('paste', on, true);
  timer = setTimeout(() => { if (done) return; end(); readClip(kind).then(c => { if (c) paste(c); }); }, 50);
}

/** Whether something of kind was copied in this session (the menus' Paste is enabled by it). */
export const hasClip = kind => !!mem && (kind === 'text' || mem.kind === kind);
// whether the system clipboard is read (systemReadable), known once the browser has answered (null: not yet)
let readable = null;
/** Whether a text Paste has something to paste: the system clipboard where it is read (Chromium), else a copy made
 *  in this session (Firefox, Safari: a menu's Paste with nothing copied did nothing, #888). */
export const canPasteText = () => readable !== false || hasClip('text');

/** Record a copy made by the browser itself (Ctrl+C in a text editor, a copy event of an editor), so that
 *  the app's own clipboard follows it when the system clipboard cannot be read. */
export function noteCopy(text, kind = 'text', data = null) {
  mem = { text, kind, data: clone(data) };
}
