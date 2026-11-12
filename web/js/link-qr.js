// The QR code of a sharing dialog's link (#3637): Share Project…'s copy (the full link, or the short one once made) and
// its live sharing (the follow link), for a phone or another computer to scan off the teacher's screen. Made here
// (core/qr.js, no network), an image of its SVG (the CSP's img-src data:); a click on it, or Enlarge, shows it as large as
// the window allows, for a projector. A link longer than a QR code holds gets none: its dialog says so in the console.
import { h, dialog } from './ui.js';
import { qrSvg } from '/core/qr.js';

const image = (svg, cls) => h('img', { class: cls, alt: 'QR code of the link', 'aria-label': 'QR code of the link', src: `data:image/svg+xml,${encodeURIComponent(svg)}` });

/** The enlarged QR code of `link`, in a dialog of its own (over the one that shows it). */
function enlargeQr(link, title = 'QR Code') {
  const svg = qrSvg(link);
  if (!svg) return null;
  return dialog({
    title, width: 'min(94vw, calc(94vh - 80px))', className: 'qr-dlg',
    body: h('div', { class: 'qr-large' }, image(svg, 'qr-large-img'), h('div', { class: 'qr-large-link', 'data-no-i18n': '' }, link)),
    buttons: [{ label: 'Close', primary: true, value: true }],
  });
}

/** A dialog's QR box: show(link) draws it (false: the link too long, nothing drawn), clear() empties it; `action`, a
 *  button shown instead of a QR ({ label, run }), when the link is still to be made (a short link). */
export function qrBox({ title = 'QR Code' } = {}) {
  const el = h('div', { class: 'qr-box' });
  let link = null;
  const enlarge = () => { if (link) enlargeQr(link, title); };
  return {
    el,
    get link() { return link; },
    show(l) {
      const svg = l ? qrSvg(l) : null;
      link = svg ? l : null;
      if (!svg) { el.replaceChildren(); return false; }
      el.replaceChildren(
        h('button', { class: 'qr-show', type: 'button', title: 'Enlarge the QR code, for a projector', onclick: enlarge }, image(svg, 'qr-img')),
        h('a', { href: '#', class: 'qr-enlarge', onclick: e => { e.preventDefault(); enlarge(); } }, 'Enlarge'));
      return true;
    },
    clear() { link = null; el.replaceChildren(); },
    action({ label, run }) {
      link = null;
      el.replaceChildren(h('button', { class: 'btn qr-make', type: 'button', onclick: run }, label));
    },
    enlarge,
  };
}
