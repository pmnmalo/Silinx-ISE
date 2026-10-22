// A reporter of node --test (#573): how long each test file took, in seconds, as JSON
// ({ "test/x.test.js": 12.3, … }), for the unit and UI tests' parts to be balanced by time (scripts/test-shard.mjs).
// A file's time is its own process's, from the runner's summary of the file (#912: a test's own event names
// the file that called test(), the UI tests' test/ui/harness.js for all of them). Used beside the usual reporter:
//
//   node --test --test-reporter=spec --test-reporter-destination=stdout \
//     --test-reporter=./scripts/test-times-reporter.mjs --test-reporter-destination=test-times.json …
import path from 'node:path';

/** The file's path relative to the working directory, with '/' (the same on Windows). */
export const relative = file => path.relative(process.cwd(), file).split(path.sep).join('/');

/** Adds a reporter event to { file: seconds }: a file's summary (the run's own, with no file, is not one). */
export function addFileTime(times, { type, data }) {
  if (type !== 'test:summary' || !data?.file || data.duration_ms == null) return times;
  const f = relative(data.file);
  times[f] = (times[f] ?? 0) + data.duration_ms / 1000;
  return times;
}

export default async function* testTimes(source) {
  const times = {};
  for await (const event of source) addFileTime(times, event);
  const out = Object.fromEntries(Object.keys(times).sort().map(f => [f, Math.round(times[f] * 10) / 10]));
  yield `${JSON.stringify(out, null, 2)}\n`;
}
