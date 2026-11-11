// What the workflows' report scripts write on GitHub, kept the bot's own (#3417):
//   - the issue or comment a script updates is the one the workflow's bot wrote (byBot): an issue of the same title, or
//     a comment that starts the same way, by anyone else is not taken;
//   - text from outside (a job's log, an artifact a pull request's dependencies made) is written inert: in a code span
//     (code) or a code block (codeBlock) that no backtick of the text closes, where GitHub renders no markup and
//     notifies no @mention.

/** The login of the GitHub Actions bot, the author of what the workflows write with their GITHUB_TOKEN. */
export const BOT = 'github-actions[bot]';

/** Whether an issue or a comment (GitHub's REST API's object) was written by the workflows' bot. */
export const byBot = x => x?.user?.login === BOT;

// the longest run of backticks in s
const ticks = s => Math.max(0, ...(String(s).match(/`+/g) || []).map(r => r.length));

/** Text as an inline code span: one line, fenced by more backticks than any run of them it holds. */
export function code(s) {
  const t = String(s ?? '').replace(/[\r\n]+/g, ' ');
  const f = '`'.repeat(ticks(t) + 1);
  // (a space inside the fence when the text starts or ends with a backtick, which GitHub strips)
  const pad = /^`|`$/.test(t) || /^ .* $/.test(t) ? ' ' : '';
  return `${f}${pad}${t}${pad}${f}`;
}

/** Lines as a code block ([lines]), fenced by more backticks than any run of them its lines hold (at least three). */
export function codeBlock(lines) {
  const f = '`'.repeat(Math.max(3, ticks(lines.join('\n')) + 1));
  return [f, ...lines, f];
}

/** The bot's open issue of this title among issues (GitHub's REST API's objects), or null. */
export const ownIssue = (issues, title) => issues.find(i => i.title === title && byBot(i)) || null;

/** The bot's comment that starts with mark among comments, or null. */
export const ownComment = (comments, mark) => comments.find(c => byBot(c) && String(c.body || '').startsWith(mark)) || null;
