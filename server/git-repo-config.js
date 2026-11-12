// A repository's own configuration, checked before git runs in it (#3523). Silinx turns off a repository's hooks and
// its fsmonitor (server/git.js), but a repository's .git/config can name other programs git runs during a status, a
// commit, a pull or a push: content filters, merge and diff drivers (which an attributes file only names: their
// commands are the configuration's), a signing program, a credential helper, a remote's helper; and files to include, or addresses rewritten (url.*.insteadOf). A folder that
// came with its own .git (copied into the workspace by hand) is from outside: its configuration holds only the settings
// a plain clone, Silinx and the usual tools write (ALLOWED), or git does not run in it.

// section.key in lower case, the subsection (a remote's or a branch's name) as *
const ALLOWED = new Set([
  'core.repositoryformatversion', 'core.filemode', 'core.bare', 'core.logallrefupdates', 'core.ignorecase', 'core.precomposeunicode',
  'core.symlinks', 'core.sparsecheckout', 'core.sparsecheckoutcone', 'core.autocrlf', 'core.eol', 'core.safecrlf',
  'extensions.worktreeconfig', 'extensions.objectformat', 'index.sparse', 'init.defaultbranch',
  'remote.*.url', 'remote.*.pushurl', 'remote.*.fetch', 'remote.*.tagopt', 'remote.*.prune', 'remote.*.gh-resolved',
  'user.name', 'user.email', 'user.signingkey', 'commit.gpgsign', 'tag.gpgsign', 'gpg.format',
  'pull.rebase', 'pull.ff', 'push.default', 'push.autosetupremote', 'merge.ff', 'merge.conflictstyle',
  // (what server/git.js turns off whatever the repository says: its hooks' folder, its fsmonitor, git-lfs's filter)
  'core.hookspath', 'core.fsmonitor',
  'filter.lfs.clean', 'filter.lfs.smudge', 'filter.lfs.process', 'filter.lfs.required', 'lfs.repositoryformatversion',
]);
// (no key of a branch's section names a program: its remote, its merge ref, a description, an editor's notes)
const allowed = key => ALLOWED.has(key) || /^branch\..*\.[a-z0-9-]+$/.test(key);

// 'remote.origin.url' -> 'remote.*.url' (the section and the key in lower case as git lists them, the subsection as it is)
function general(key) {
  const first = key.indexOf('.'), last = key.lastIndexOf('.');
  return first === last ? key : `${key.slice(0, first)}.*${key.slice(last)}`;
}

/** The first setting of a `git config --list -z` output that is not among the allowed ones (null: none). */
export function refusedSetting(listZ) {
  for (const entry of String(listZ).split('\0')) {
    const key = entry.split('\n')[0].trim();
    if (!key) continue;
    const g = general(key);
    if (!allowed(g) && !allowed(key)) return key;
  }
  return null;
}

/** The setting that stops git from running in a repository (null: none). `list(scope)` gives
 *  `git config --<scope> --no-includes --list -z`'s output ('' on a failure). */
export async function repoConfigProblem(list) {
  for (const scope of ['local', 'worktree']) {
    const setting = refusedSetting(await list(scope));
    if (setting) return setting;
  }
  return null;
}
