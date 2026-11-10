// The browser edition's GitHub sign-in (#3196, web/js/git-browser.js): File ▸ Git ▸ Sign in with GitHub… shows the code
// GitHub gives and its page (github.com/login/device), where the user signs in and enters it; the dialog waits until
// GitHub says the code is authorized (or refused, or expired), and Cancel stops it. Sign out of GitHub forgets the
// sign-in. Every message goes to the console; the token is never in one.
import { api } from './api.js';
import { h, dialog } from './ui.js';
import { log } from './console.js';
import { logGitError } from './git.js';

const DEVICE = 'https://github.com/login/device';
// (GitHub's page only: what the sign-in's answer names elsewhere is not linked)
const pageOf = uri => (/^https:\/\/github\.com\/[\w/-]*$/.test(String(uri || '')) ? uri : DEVICE);

/** Sign in with GitHub…: true once signed in. */
export async function signInDialog() {
  const ctl = new AbortController();
  const code = h('code', { class: 'git-user-code', 'data-no-i18n': '', style: { fontSize: '20px', letterSpacing: '2px' } }, '…');
  const link = h('a', { class: 'git-verify', href: DEVICE, target: '_blank', rel: 'noopener noreferrer', 'data-no-i18n': '' }, DEVICE);
  const wait = h('div', { class: 'hint git-wait' }, 'Asking GitHub for a code…');
  let close = null;
  const shown = dialog({
    title: 'Sign in with GitHub', width: 480,
    body: h('div', {},
      h('div', {}, 'Open this page of GitHub, sign in there and enter the code:'),
      h('div', { style: { margin: '8px 0' } }, link),
      h('div', { style: { margin: '8px 0' } }, code),
      wait,
      h('div', { class: 'hint', style: { marginTop: '10px' } }, 'The sign-in is kept in this browser only, and sent only to GitHub.')),
    buttons: [{ label: 'Cancel', value: 'cancel' }],
    onOpen: ({ close: c }) => { close = c; },
  });
  const run = api.githubSignIn({
    signal: ctl.signal,
    onCode: d => {
      code.textContent = d.userCode;
      link.href = link.textContent = pageOf(d.verificationUri);
      wait.textContent = 'Waiting for GitHub: enter the code there and authorize Silinx.';
    },
  }).then(() => ({ ok: true }), error => ({ error }));
  const r = await Promise.race([shown.then(v => (v === 'done' ? null : { cancel: true })), run]);
  if (!r || r.cancel) { ctl.abort(); await run; log('The GitHub sign-in was cancelled.', 'info'); return false; }
  close?.('done');
  if (r.error) { logGitError(r.error); return false; }
  log('Signed in to GitHub: the sign-in is kept in this browser only (Sign out of GitHub forgets it).', 'ok');
  return true;
}

/** Sign out of GitHub: the sign-in forgotten. */
export async function signOut() {
  await api.githubSignOut();
  log('Signed out of GitHub: this browser no longer keeps the sign-in.', 'ok');
}
