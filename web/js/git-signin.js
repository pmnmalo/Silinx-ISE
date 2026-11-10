// The browser edition's GitHub sign-in (#3196, web/js/git-browser.js): Sign in with GitHub…. With the sign-in's relay
// (web/js/github-app.js), the device flow: the code GitHub gives and its page (github.com/login/device), where the user
// signs in and enters it, the dialog waiting until GitHub says the code is authorized (or refused, or expired), Cancel
// stopping it. Without it, a fine-grained personal access token of the user's, pasted: the steps to make one and the
// permissions it needs said, the token checked with GitHub before it is kept (a refusal said beside the field). Sign
// out of GitHub forgets the sign-in. Every message goes to the console; the token is never in one.
import { api } from './api.js';
import { h, dialog } from './ui.js';
import { log } from './console.js';
import { logGitError } from './git.js';

const DEVICE = 'https://github.com/login/device';
const NEW_TOKEN = 'https://github.com/settings/personal-access-tokens/new';
// (GitHub's page only: what the sign-in's answer names elsewhere is not linked)
const pageOf = uri => (/^https:\/\/github\.com\/[\w/-]*$/.test(String(uri || '')) ? uri : DEVICE);

/** Sign in with GitHub…: true once signed in. */
export async function signInDialog() {
  return api.githubSignInWay() === 'device' ? deviceDialog() : tokenDialog();
}

// a pasted token: the steps, the permissions, the field
async function tokenDialog() {
  const field = h('input', { type: 'password', class: 'git-token', autocomplete: 'off', spellcheck: 'false', style: { width: '100%' } });
  const err = h('div', { class: 'hint git-error git-token-error', style: { minHeight: '16px' } });
  field.addEventListener('input', () => { err.textContent = ''; });
  let who = null;
  const r = await dialog({
    title: 'Sign in with GitHub', width: 540,
    body: h('div', {},
      h('div', {}, 'Sign in with a fine-grained personal access token of your GitHub account:'),
      h('ol', { class: 'git-token-steps', style: { margin: '6px 0', paddingLeft: '20px' } },
        h('li', {}, 'Open GitHub\'s page for a new token:', ' ', h('a', { class: 'git-new-token', href: NEW_TOKEN, target: '_blank', rel: 'noopener noreferrer', 'data-no-i18n': '' }, NEW_TOKEN)),
        h('li', {}, 'Repository access: Only select repositories (the ones to open in Silinx).'),
        h('li', {}, 'Repository permissions: Contents, Read and write (Metadata, Read-only, comes with it).'),
        h('li', {}, 'Account permissions: Gists, Read and write (for Copy Link\'s short links).'),
        h('li', {}, 'Generate the token, copy it and paste it here.')),
      field, err,
      h('div', { class: 'hint', style: { marginTop: '10px' } }, 'The sign-in is kept in this browser only, and sent only to GitHub.')),
    buttons: [{ label: 'Sign In', primary: true, value: () => who, validate: async () => {
      try { who = await api.githubSetToken(field.value); return true; } catch (e) { err.textContent = e.hint ? `${e.message}: ${e.hint}` : e.message; return false; }
    } }, { label: 'Cancel', value: null }],
  });
  field.value = '';
  if (!r) { log('The GitHub sign-in was cancelled.', 'info'); return false; }
  log(`Signed in to GitHub${r.login ? ` as ${r.login}` : ''}: the sign-in is kept in this browser only (Sign out of GitHub forgets it).`, 'ok');
  return true;
}

// the device flow, through the relay
async function deviceDialog() {
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
