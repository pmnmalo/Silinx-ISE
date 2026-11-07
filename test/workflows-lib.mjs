// The workflow files the tests check (#1438): GitHub runs .github/workflows/*.yml and *.yaml both, so the tests
// of the workflows (their permissions, the self-hosted runner's guard, the pinning of the actions) must list both,
// or a *.yaml file would escape every rule.
import fs from 'node:fs';

/** Whether a file of .github/workflows is a workflow GitHub runs: a .yml or .yaml file. */
export const isWorkflowFile = (name) => /\.ya?ml$/.test(name);

/** The workflow files of a folder, sorted. */
export const workflowFiles = (dir) => fs.readdirSync(dir).filter(isWorkflowFile).sort();

/** The jobs of a workflow: { name: its text (the lines under its two-space key) }. */
export function jobsOf(yml) {
  const out = {};
  for (const part of yml.slice(yml.indexOf('\njobs:\n') + 7).split(/\n(?= {2}[\w-]+:\n)/)) {
    const m = /^ {2}([\w-]+):\n([\s\S]*)$/.exec(part);
    if (m) out[m[1]] = m[2].split('\n').filter(l => /^ {4}/.test(l)).join('\n') + '\n';
  }
  return out;
}

/** The steps of a job's text, each its text from its "- ". */
export const stepsOf = (job) => job.slice(job.indexOf('    steps:\n')).split(/\n(?= {6}- )/).slice(1);

/** The permissions a job's token has: its own block, else the workflow's (top-level), as { name: level }. */
export function jobPermissions(yml, job) {
  const block = /\n {4}permissions:\n((?: {6}.*\n)+)/.exec('\n' + job)?.[1] ?? /\npermissions:\n((?: {2}\S.*\n)+)/.exec(yml)?.[1] ?? '';
  return Object.fromEntries([...block.replace(/ *#.*$/gm, '').matchAll(/^\s+([\w-]+): (\w+)$/gm)].map(m => [m[1], m[2]]));
}

/**
 * A pull request's job that checks out both sides: { base, head } (each checkout's path, '' the workspace's root;
 * the base's the one of the base's commit), and clean: a step `test ! -e <the base's folder>/node_modules` before the
 * job's first node command, so that no bare import of the base's scripts resolves into a tree nobody checked (#3038).
 */
export function checkoutLayout(job) {
  const out = { base: null, head: null, clean: false };
  let tested = false;
  for (const step of stepsOf(job.endsWith('\n') ? job : job + '\n')) {
    if (/uses: actions\/checkout@/.test(step)) {
      const at = /\n\s+path: (\S+)/.exec(step)?.[1] ?? '';
      if (/\n\s+ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/.test(step)) out.base = at; else out.head = at;
    } else if (out.base !== null && step.split('\n').some(l => l.trim() === `- run: test ! -e ${out.base ? out.base + '/' : ''}node_modules`)) tested = true;
    else if (/\brun: (.*[;&|] *)?node /.test(step)) { out.clean = tested; break; }
  }
  return out;
}
