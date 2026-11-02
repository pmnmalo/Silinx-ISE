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
