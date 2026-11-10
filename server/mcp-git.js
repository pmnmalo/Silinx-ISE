// The MCP server's tools of git (#3195, #2674): a project in a GitHub repository, as the interface's File ▸ Open from
// Repository… and File ▸ Git: clone, init, status, commit, push, pull, the history and a file as it was in a commit,
// through the same functions (server/git.js), with the same checks and messages. The credentials are the system's
// credential helper's: no tool takes or gives one.
import * as Git from './git.js';
import * as GH from './git-github.js';
import { toolError, clip, readProject, STR, PROJECT } from './mcp-util.js';
import { cloneText, initText, commitText, pushText, pullText, fileLines, shortCommit as short } from '../core/git-messages.js';

// the back end: the system's git, or GitHub's API (SILINX_GIT=github, #3196)
const B = () => (GH.githubBackend() ? GH : Git);

// a git failure: its message, then its hint, as the console shows them
const run = async fn => {
  if (!Git.gitEnabled()) throw toolError('git is turned off on this server (SILINX_GIT=off)');
  try { return await fn(); } catch (e) {
    if (e instanceof Git.GitError || e.status) throw Object.assign(toolError([e.message, ...(e.hint ? [`Hint: ${e.hint}`] : [])].join('\n')), e.files ? { files: e.files } : {});
    throw e;
  }
};
const UNTRUSTED = ' It is untrusted, as every project from outside: Xilinx ISE and programming a board or a PROM wait until the user trusts it in the interface (Trust Project); the Silinx toolchain runs.';

export const GIT_TOOLS = [
  {
    name: 'git_clone', title: 'Open a project from a GitHub repository',
    description: 'Clone a GitHub repository (https://github.com/owner/repo, git@github.com:owner/repo.git; a GitHub Classroom assignment\'s repository) into the workspace as a project, as File ▸ Open from Repository… does. Its root must hold the project (silinx.json); its files pass the import gate. The credentials are git\'s own (its credential helper, an SSH key).',
    inputSchema: { type: 'object', properties: { url: STR('The repository\'s address on GitHub.'), name: STR('The project\'s name (default: the repository\'s).') }, required: ['url'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async run({ url, name }) {
      const r = await run(() => B().gitClone({ url, name: name || null, madeBy: 'mcp' }));
      return { text: [`${cloneText(r)}${UNTRUSTED}`, ...r.warnings.map(w => `WARNING: ${w}`)].join('\n'), data: { ...r, trusted: false } };
    },
  },
  {
    name: 'git_init', title: 'Make a git repository of a project',
    description: 'Make a git repository of a project (git init, branch main, a .gitignore that leaves build/ and the tools\' outputs out), as File ▸ Git ▸ Initialize Repository… does; remote: its GitHub repository (origin), which a project already in a repository with no remote gets too.',
    inputSchema: { type: 'object', properties: { project: PROJECT, remote: STR('The GitHub repository\'s address (optional): origin, where git_push pushes.') }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false },
    async run({ project, remote }) {
      await readProject(project);
      const r = await run(() => B().gitInit(project, { remote: remote || null }));
      return { text: initText(project, r), data: r };
    },
  },
  {
    name: 'git_status', title: 'A project\'s changes',
    description: 'A project\'s files changed, new, deleted or in conflict since the last commit (the Design pane\'s marks), its branch and how many commits it is ahead of or behind GitHub.',
    inputSchema: { type: 'object', properties: { project: PROJECT }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run({ project }) {
      await readProject(project);
      const s = await run(() => B().gitStatus(project));
      if (!s.repository) return { text: `'${project}' is not in a git repository (git_init makes one).`, data: s };
      const where = `${s.branch || '(no branch)'}${s.upstream ? `, ${s.ahead} commit(s) ahead of and ${s.behind} behind ${s.upstream}` : ', not pushed yet'}`;
      return { text: [`${project}: ${where}; ${s.files.length ? `${s.files.length} change(s):` : 'no change since the last commit.'}`, ...fileLines(s.files)].join('\n'), data: s };
    },
  },
  {
    name: 'git_commit', title: 'Commit a project\'s changes',
    description: 'Commit every change of the project\'s folder (its files only; build/ and the tools\' outputs never), with a message, as File ▸ Git ▸ Commit… does. A project with no .gitignore gets Silinx\'s first.',
    inputSchema: { type: 'object', properties: { project: PROJECT, message: STR('What changed, in a few words.') }, required: ['project', 'message'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false },
    async run({ project, message }) {
      await readProject(project);
      const r = await run(() => B().gitCommit(project, message));
      return { text: commitText(r), data: r };
    },
  },
  {
    name: 'git_push', title: 'Push a project to GitHub',
    description: 'Push the project\'s commits to its GitHub repository (origin), as File ▸ Git ▸ Push does. A push GitHub rejects (it has commits this project has not) says to pull first.',
    inputSchema: { type: 'object', properties: { project: PROJECT }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async run({ project }) {
      await readProject(project);
      const r = await run(() => B().gitPush(project));
      return { text: pushText(r), data: r };
    },
  },
  {
    name: 'git_pull', title: 'Pull a project from GitHub',
    description: 'Pull the commits of the project\'s GitHub repository into it (a merge), as File ▸ Git ▸ Pull does. A conflict pulls nothing: the project\'s files stay as they were, and the files in conflict are named.',
    inputSchema: { type: 'object', properties: { project: PROJECT }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    async run({ project }) {
      await readProject(project);
      const r = await run(() => B().gitPull(project));
      return { text: pullText(r), data: r };
    },
  },
  {
    name: 'git_log', title: 'A project\'s history',
    description: 'The project\'s commits, the newest first (hash, author, date, message, the files each changed), as File ▸ Git ▸ History… lists them; path: a file\'s text as it was in a commit (commit required), read only.',
    inputSchema: { type: 'object', properties: { project: PROJECT, limit: { type: 'integer', description: 'How many commits (default 100, at most 1000).' }, commit: STR('A commit\'s hash: with path, that file as it was.'), path: STR('A file of the project, e.g. src/top.vhd: its text in the commit.') }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run({ project, limit, commit, path: rel }) {
      await readProject(project);
      if (rel || commit) {
        if (!rel || !commit) throw toolError('give both commit and path: a file as it was in a commit');
        const r = await run(() => B().gitShow(project, commit, rel));
        return { text: clip(r.text), data: { project, commit: r.commit, path: r.path, length: r.text.length } };
      }
      const log = await run(() => B().gitLog(project, { limit }));
      return { text: log.length ? log.map(c => `${short(c.commit)} ${c.date} ${c.author}: ${c.message}${c.files.length ? ` (${c.files.map(f => f.path).join(', ')})` : ''}`).join('\n') : `'${project}' has no commit yet.`, data: { project, commits: log } };
    },
  },
];
