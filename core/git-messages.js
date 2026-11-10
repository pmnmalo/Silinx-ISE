// The messages of git's commands (#3195), the same in the interface's console and in the MCP server's results
// (server/mcp-git.js): what a clone, a commit, a push, a pull, an init did, from their results (server/git.js).
// Isomorphic.

const STATE = { modified: 'changed', new: 'new', deleted: 'deleted', conflict: 'in conflict' };
export const stateWord = s => STATE[s] || s;
export const fileLines = files => files.map(f => `  ${f.path} (${stateWord(f.state)})`);
export const shortCommit = c => String(c || '').slice(0, 7);

export const cloneText = r => `Project '${r.project}' opened from the GitHub repository ${r.repository}.`;
export const initText = (project, r) => (r.created ? `Repository made for '${project}'${r.remote ? `, its remote ${r.remote}` : ''}${r.gitignore ? '; .gitignore written' : ''}.` : `'${project}': its remote is now ${r.remote}.`);
export const commitText = r => [`Committed ${shortCommit(r.commit)} on ${r.branch || '(no branch)'}: ${r.files.length} file(s).`, ...fileLines(r.files)].join('\n');
export const pushText = r => (r.pushed ? `Pushed ${r.branch} to ${r.remote}.` : `Nothing to push: ${r.remote} has every commit of ${r.branch}.`);
export const pullText = r => (r.upToDate ? `Already up to date: ${r.branch} has every commit of GitHub's.` : [`Pulled into ${r.branch}: ${r.files.length} file(s) changed.`, ...r.files.map(f => `  ${f}`)].join('\n'));
