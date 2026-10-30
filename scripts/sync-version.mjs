// Copies package.json's version into core/version.js (npm runs this in `npm version`). With --package <name>
// (#1681): checks a workspace's version against its own changelog (packages/<name>), and writes nothing.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { readFragments, changelogOf, packageArg } = await import('./changelog-release.mjs');
const pkg = packageArg(process.argv);
const where = changelogOf(pkg);
const { version } = JSON.parse(fs.readFileSync(path.join(path.dirname(where.file), 'package.json'), 'utf8'));
// a release needs its notes: CHANGELOG.md must have a "## <version>" section
const { changesOf } = await import('../core/changelog.js');
if (!fs.existsSync(where.file) || !changesOf(fs.readFileSync(where.file, 'utf8'), version)) {
  console.error(`${where.changelog} has no "## ${version}" section: write what changed in ${version} before releasing it.`);
  process.exit(1);
}
// and every changelog fragment in it (#519)
const left = readFragments(where.dir).map(f => f.name);
if (left.length) {
  console.error(`${where.changes} has fragments not in ${where.changelog} (${left.join(', ')}): run node scripts/changelog-release.mjs ${version}${pkg ? ` --package ${pkg}` : ''} first.`);
  process.exit(1);
}
if (pkg) {
  console.log(`${pkg} ${version}: ${where.changelog} has its section, no fragment left`);
} else {
  const f = path.join(ROOT, 'core', 'version.js');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/VERSION = '[^']*'/, `VERSION = '${version}'`));
  console.log(`core/version.js: ${version}`);
}
