// A reporter of node --test (#573): how long each test file took, in seconds, as JSON
// ({ "test/x.test.js": 12.3, … }), for the unit tests' parts to be balanced by time (scripts/test-shard.mjs).
// A file's time is the sum of its top-level tests' (a file's tests run one after another, in their own
// process). Used beside the usual reporter:
//
//   node --test --test-reporter=spec --test-reporter-destination=stdout \
//     --test-reporter=./scripts/test-times-reporter.mjs --test-reporter-destination=test-times.json …
import path from 'node:path';

/** The file's path relative to the working directory, with '/' (the same on Windows). */
export const relative = file => path.relative(process.cwd(), file).split(path.sep).join('/');

export default async function* testTimes(source) {
  const times = {};
  for await (const { type, data } of source) {
    if ((type === 'test:pass' || type === 'test:fail') && data.nesting === 0 && data.file && data.details?.duration_ms != null) {
      const f = relative(data.file);
      times[f] = (times[f] ?? 0) + data.details.duration_ms / 1000;
    }
  }
  const out = Object.fromEntries(Object.keys(times).sort().map(f => [f, Math.round(times[f] * 10) / 10]));
  yield `${JSON.stringify(out, null, 2)}\n`;
}
