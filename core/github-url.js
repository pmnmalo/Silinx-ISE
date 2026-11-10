// A GitHub repository's address (#3195), checked: https or ssh, github.com's only, the owner and the repository by
// GitHub's name rules. The server's git (server/git.js) checks every remote with it; the interface's dialogs check the
// field with it, beside it. Isomorphic (browser and server); its errors carry their hint.

const OWNER = '([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))', REPO = '([A-Za-z0-9._-]{1,100}?)';
const URL_FORMS = [
  new RegExp(`^https://github\\.com/${OWNER}/${REPO}(?:\\.git)?/?$`),
  new RegExp(`^ssh://git@github\\.com(?::22)?/${OWNER}/${REPO}(?:\\.git)?/?$`),
  new RegExp(`^git@github\\.com:${OWNER}/${REPO}(?:\\.git)?$`),
];
export const URL_HINT = 'Give the repository\'s address on GitHub: https://github.com/owner/repository, or git@github.com:owner/repository.git.';

/** A text with its URLs' credentials removed (a user:token@ after the scheme). */
export const redact = s => String(s ?? '').replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^/@\s]+@/gi, '$1');

const urlError = (message, hint) => Object.assign(new Error(message), { hint, status: 400, urlError: true });

/** A remote's URL, checked -> { url, owner, repo }; or an Error (its `hint`). */
export function checkUrl(url) {
  const u = String(url ?? '').trim();
  if (/^https:\/\/classroom\.github\.com\//i.test(u)) throw urlError('a GitHub Classroom invitation, not a repository', 'Accept the assignment on GitHub first, then give its repository\'s address (https://github.com/…).');
  for (const re of URL_FORMS) {
    const m = re.exec(u);
    if (m && m[2] !== '.' && m[2] !== '..') return { url: u, owner: m[1], repo: m[2] };
  }
  throw urlError(`not a GitHub repository's address: ${redact(u) || '(none)'}`, URL_HINT);
}

/** A project's name from a repository's (letters, digits, - and _; a letter first). */
export const nameFromRepo = repo => {
  const n = String(repo).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64);
  return /^[A-Za-z]/.test(n) ? n : `p${n}`.slice(0, 64);
};
