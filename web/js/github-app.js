// The settings of the browser edition's GitHub sign-in (#3196): Silinx's GitHub OAuth App, registered by the maintainer
// (github.com ▸ Settings ▸ Developer settings ▸ OAuth Apps ▸ New OAuth App, "Enable Device Flow" ticked). Its client ID
// is public (the device flow has no secret); until it is set the sign-in says that no OAuth App is set up, and Open
// from Repository still reads public repositories. A UI test points the page at a stand-in for GitHub instead
// (globalThis.SILINX_GITHUB = { api, login, clientId }: test/fake-github.mjs).

// The placeholder: replace it with the OAuth App's client ID (it starts "Ov23li" or "Iv1."), then build the site again.
export const PLACEHOLDER = 'REPLACE-ME-with-the-client-ID-of-Silinx-GitHub-OAuth-App';
export const GITHUB_OAUTH_CLIENT_ID = PLACEHOLDER;

const own = () => globalThis.SILINX_GITHUB || {};
/** Where the API and the sign-in are, and the client ID ('' while it is the placeholder). */
export function githubSettings() {
  const t = own();
  const id = t.clientId ?? GITHUB_OAUTH_CLIENT_ID;
  return { api: t.api || 'https://api.github.com', login: t.login || 'https://github.com', clientId: id === PLACEHOLDER ? '' : id };
}
