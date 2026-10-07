// Copies package.json's version into core/version.js (npm runs this in `npm version`).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const f = path.join(ROOT, 'core', 'version.js');
fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/VERSION = '[^']*'/, `VERSION = '${version}'`));
console.log(`core/version.js: ${version}`);
