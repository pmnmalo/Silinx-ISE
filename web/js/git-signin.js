// The browser edition's GitHub sign-in (#3196, web/js/git-browser.js): Sign in with GitHub…. With the sign-in's relay
// (web/js/github-app.js), the device flow: the code GitHub gives and its page (github.com/login/device), where the user
// signs in and enters it, the dialog waiting until GitHub says the code is authorized (or refused, or expired), Cancel
// stopping it. Without it, a fine-grained personal access token of the user's, pasted: the steps to make one and the
// permissions it needs said, the token checked with GitHub before it is kept (a refusal said beside the field). The
// sign-in is kept in this browser (Remember me, ticked by default), or in this tab until it closes when the user unticks
// it (#3356); the single file opened from the disk (file:) keeps it in this tab only, Remember me unticked and disabled,
// its reason its tip (#3530: every page opened from the disk reads that browser's storage); the device
// flow asks for the public repositories only, the private ones when the user ticks them. Sign out of GitHub forgets the
// sign-in. Every message goes to the console; the token is never in one.
import { api } from './api.js';
import { h, dialog } from './ui.js';
import { log } from './console.js';
import { logGitError } from './git.js';

const DEVICE = 'https://github.com/login/device';
const NEW_TOKEN = 'https://github.com/settings/personal-access-tokens/new';
// (GitHub's page only: what the sign-in's answer names elsewhere is not linked)
const pageOf = uri => (/^https:\/\/github\.com\/[\w/-]*$/.test(String(uri || '')) ? uri : DEVICE);
const KEPT = 'The sign-in is sent only to GitHub, and kept in this browser unless you untick Remember me (then in this tab until it is closed).';
// (#3530: a Silinx opened from a file, whose storage every page opened from the disk reads)
const fromFile = () => globalThis.location?.protocol === 'file:';
const KEPT_FILE = 'The sign-in is sent only to GitHub, and kept in this tab until it is closed (a Silinx opened from a file does not remember it).';
const NO_REMEMBER = 'A Silinx opened from a file keeps the sign-in in this tab only: every page opened from the disk can read what this browser keeps for files.';
// Remember me: the sign-in kept in this browser (#3356); at file: unticked and disabled (#3530)
const rememberBox = () => (fromFile()
  ? h('input', { type: 'checkbox', class: 'git-remember', checked: false, disabled: true, title: NO_REMEMBER })
  : h('input', { type: 'checkbox', class: 'git-remember', checked: true }));
const keptHint = () => h('div', { class: 'hint', style: { marginTop: '10px' } }, fromFile() ? KEPT_FILE : KEPT);
const checkLine = (box, label) => h('label', { style: { display: 'block', marginTop: '6px' } }, box, ' ', label);
const REMEMBER = 'Remember me in this browser (kept after this tab closes, where every page of this site\'s address can read it)';
// the console's line once signed in
const signedIn = (login, remembered) => `Signed in to GitHub${login ? ` as ${login}` : ''}: the sign-in is kept ${remembered ? 'in this browser' : 'in this tab until it is closed'} (Sign out of GitHub forgets it).`;

/** Sign in with GitHub…: true once signed in. */
export async function signInDialog() {
  return api.githubSignInWay() === 'device' ? deviceDialog() : tokenDialog();
}

// a pasted token: the steps, the permissions, the field
async function tokenDialog() {
  const field = h('input', { type: 'password', class: 'git-token', autocomplete: 'off', spellcheck: 'false', style: { width: '100%' } });
  const err = h('div', { class: 'hint git-error git-token-error', style: { minHeight: '16px' } });
  field.addEventListener('input', () => { err.textContent = ''; });
  const remember = rememberBox();
  let who = null;
  const r = await dialog({
    title: 'Sign in with GitHub', width: 540,
    body: h('div', {},
      h('div', {}, 'Sign in with a fine-grained personal access token of your GitHub account:'),
      h('ol', { class: 'git-token-steps', style: { margin: '6px 0', paddingLeft: '20px' } },
        h('li', {}, 'Open GitHub\'s page for a new token:', ' ', h('a', { class: 'git-new-token', href: NEW_TOKEN, target: '_blank', rel: 'noopener noreferrer', 'data-no-i18n': '' }, NEW_TOKEN)),
        h('li', {}, 'Repository access: Only select repositories (the ones to open in Silinx).'),
        h('li', {}, 'Repository permissions: Contents, Read and write (Metadata, Read-only, comes with it).'),
        h('li', {}, 'Account permissions: Gists, Read and write (for Share Project\'s short links).'),
        h('li', {}, 'Generate the token, copy it and paste it here.')),
      field, err, checkLine(remember, REMEMBER),
      keptHint()),
    buttons: [{ label: 'Sign In', primary: true, value: () => who, validate: async () => {
      try { who = await api.githubSetToken(field.value, { remember: remember.checked }); return true; } catch (e) { err.textContent = e.hint ? `${e.message}: ${e.hint}` : e.message; return false; }
    } }, { label: 'Cancel', value: null }],
  });
  field.value = '';
  if (!r) { log('The GitHub sign-in was cancelled.', 'info'); return false; }
  log(signedIn(r.login, r.remembered), 'ok');
  return true;
}

// the device flow, through the relay: what it asks for first (the private repositories, Remember me), then the code
async function deviceDialog() {
  const priv = h('input', { type: 'checkbox', class: 'git-private' }), remember = rememberBox();
  const opts = await dialog({
    title: 'Sign in with GitHub', width: 480,
    body: h('div', {},
      h('div', {}, 'Silinx asks GitHub for your public repositories and your gists.'),
      checkLine(priv, 'Include my private repositories (a Classroom assignment\'s): GitHub then gives Silinx all of them'),
      checkLine(remember, REMEMBER),
      keptHint()),
    buttons: [{ label: 'Get a Code', primary: true, value: () => ({ privateRepos: priv.checked, remember: remember.checked }) }, { label: 'Cancel', value: null }],
  });
  if (!opts) { log('The GitHub sign-in was cancelled.', 'info'); return false; }
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
      wait),
    buttons: [{ label: 'Cancel', value: 'cancel' }],
    onOpen: ({ close: c }) => { close = c; },
  });
  const run = api.githubSignIn({
    ...opts,
    signal: ctl.signal,
    onCode: d => {
      code.textContent = d.userCode;
      link.href = link.textContent = pageOf(d.verificationUri);
      wait.textContent = 'Waiting for GitHub: enter the code there and authorize Silinx.';
    },
  }).then(ok => ({ ok }), error => ({ error }));
  const r = await Promise.race([shown.then(v => (v === 'done' ? null : { cancel: true })), run]);
  if (!r || r.cancel) { ctl.abort(); await run; log('The GitHub sign-in was cancelled.', 'info'); return false; }
  close?.('done');
  if (r.error) { logGitError(r.error); return false; }
  log(signedIn(null, r.ok.remembered), 'ok');
  return true;
}

/** Sign out of GitHub: the sign-in forgotten. */
export async function signOut() {
  await api.githubSignOut();
  log('Signed out of GitHub: this browser no longer keeps the sign-in.', 'ok');
}
