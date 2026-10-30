// Checks that the repository holds no data that must not be published: personal data (e-mail
// addresses, home folders with a user name, logins such as user@host), computer names and IP, IPv6
// and MAC addresses of a network, network paths, passwords, keys (private, SSH public) and access
// tokens, and Xilinx files (ISE's binary outputs, licences, device reports). Run by
// test/private-data.test.js on every tracked file: the text ones line by line (a long line in chunks),
// the compressed ones (.gz) inflated, the other binary ones by their readable strings and, for a Xilinx
// bitstream, by its header (#1441).
//
//   node scripts/check-private-data.mjs              the tracked files
//   node scripts/check-private-data.mjs --history    also every line added in the history of HEAD
//                                                    (main, in CI) and every commit message; other
//                                                    branches are checked by their own pull requests
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// Known, harmless matches: [file (or a RegExp of files), the matched text (or a RegExp), why]
const ALLOW = [
  [/^((packages\/silinx-fpga\/)?THIRD-PARTY-NOTICES\.md|scripts\/licences\/[^/]+\.txt)$/, /@/, 'the licence texts of the third-party packages name their authors'],
  [/./, /^(127\.\d+\.\d+\.\d+|0\.0\.0\.0|255\.255\.255\.255)$/, 'loopback / any address / broadcast'],
  [/./, /^(192\.0\.2|198\.51\.100|203\.0\.113)\.\d+$/, 'documentation addresses (RFC 5737)'],
  [/./, /^(::1|::|::[fF]{4}:(127|0)|2001:0?[dD][bB]8:.*)$/, 'IPv6 loopback / any address (also mapped), the documentation prefix (RFC 3849)'],
  [/./, /^(00[:-]00[:-]00[:-]00[:-]00[:-]00|[fF]{2}([:-][fF]{2}){5})$/, 'the MAC address of no card, the broadcast address'],
  [/./, /@(example\.(com|org|net)|[\w.-]+\.(example|test|invalid))$/, 'example domains (RFC 2606)'],
  [/./, /^(noreply@anthropic\.com|[\w.+-]+@users\.noreply\.github\.com)$/, 'no-reply addresses (the Co-Authored-By line of commits)'],
  ['test/corpus/vloghammer-gen.mjs', 'claire@yosyshq.com', 'the copyright notice of VlogHammer (ISC licence), which a port must keep'],
  ['test/lang-vhdl-types.test.js', '6.4.2.3', 'a section of the VHDL standard'],
  ['test/server-api.test.js', /^(fpga-lab\.local|box\.lan)$/, 'made-up computer names: the Host header test, the ssh settings'],
  ['test/impl.test.js', /^(dev@)?10\.0\.0\.2$/, 'a made-up address of an example (in the history only)'],
  ['test/impl.test.js', '/Users/Me', "a made-up macOS home folder of the ssh settings script's test (#1244, #1336)"],
  ['test/report-failure.test.js', /^(dev|me)@(192\.0\.2|203\.0\.113)\.\d+$/, 'made-up logins on documentation addresses (RFC 5737): the cleaning of a log line is tested on them (#251)'],
  ['scripts/measure-power.mjs', /^3\.3\.1\.[12]$/, "XPower's section numbers (in the history only)"],
  ['test/static-editions.test.js', '/Users/x', 'a made-up file:// path of a downloaded edition (in the history only, #555)'],
  ['research/ink-models/serve.mjs', /^(10\.0\.0\.0|172\.16\.0\.0|192\.168\.0\.0|255\.(0|240|255)\.0\.0)$/, 'the private networks\' ranges and masks: the name constraints of the spike\'s local certificate authority (#1060)'],
  [/^\(message of (fda526c|dc20cc0)\)$/, '3.3.1.1', "XPower's section number in two commit messages"],
  [/^\(message of e22948b\)$/, '/Users/Me', "the made-up macOS home folder of test/impl.test.js (#1336), named in its commit's message"],
  ['CHANGELOG.md', '/Users/Me', "the same, named in 15.14.0's section for one commit (in the history only, #1336)"],
  // ISE's text reports and simulation models of our own test designs (no personal data in them):
  // the fixtures of the report parsers and of the netgen simulation
  [/^test\/fixtures\/(ise|netgen)\//, 'Xilinx file', 'ISE reports / netgen models of test designs, kept as parser fixtures'],
];

// the rules themselves and their tests hold examples of what they look for
export const SELF = ['scripts/check-private-data.mjs', 'test/private-data.test.js'];

const allowed = (file, text) => ALLOW.some(([f, t]) =>
  (typeof f === 'string' ? f === file : f.test(file)) && (typeof t === 'string' ? t === text : t.test(text)));

// placeholders that may follow /Users/, /home/ or C:\Users\ in documentation
const PLACEHOLDER_USERS = /^(<[^>]+>|\$\w+|\$\{\w+\}|%\w+%|you|me|user|username|name|runner|USER|USERNAME|\.\.\.|…)$/;

/** Private / link-local IPv4 ranges (a home or office network). */
const isNetworkIp = (ip) => { const [a, b] = ip.split('.').map(Number); return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127); };

/** The rules: { kind, re, check?(match) -> the text to report or null, not?: the files the rule does not apply to, needs?: a
 *  text every match holds (a line without it is not searched: the e-mail rule alone took seconds on a long line) }. */
const RULES = [
  { kind: 'e-mail address', needs: '@', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/g },
  // an IPv4 address (not part of a longer dotted number such as a version, nor a product's version after its name and a
  // slash, as in a User-Agent string: Chrome/1.2.3.4, #1080)
  { kind: 'IP address', re: /(?<![\w.]|[A-Za-z]\/)(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?![\w.]*\d)/g },
  { kind: 'login (user@address)', needs: '@', re: /\b[A-Za-z0-9._-]+@(?:\d{1,3}\.){3}\d{1,3}\b/g },
  // an IPv6 address (#1441): eight groups of hex digits, or a shortened one (::) with two groups at least, a digit
  // and a group of two digits or more (a time, 08:13:55, has no ::; a scope, std::string or A::B, no digit); ::1,
  // :: and the documentation prefix are allowed below, as 127.0.0.1 is
  { kind: 'IPv6 address', needs: ':', re: /(?<![\w:.])(?:(?:[0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4}|(?:[0-9A-Fa-f]{1,4}:){1,6}(?::[0-9A-Fa-f]{1,4}){1,6}|(?:[0-9A-Fa-f]{1,4}:){2,7}:|::(?:[0-9A-Fa-f]{1,4}:){1,6}[0-9A-Fa-f]{1,4})(?![\w:.])/g,
    check: (m) => (/\d/.test(m[0]) && /[0-9A-Fa-f]{2}/.test(m[0]) ? m[0] : null) },
  // a MAC address (#1441), in either notation; all zeros and the broadcast address are allowed below
  { kind: 'MAC address', re: /(?<![\w:-])(?:[0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}(?![\w:])|(?<![\w:-])(?:[0-9A-Fa-f]{2}-){5}[0-9A-Fa-f]{2}(?![\w-])/g },
  // a computer's name: under .local with a hyphen (Janes-MacBook-Pro.local); any name under .local / .lan /
  // .internal / .home.arpa after @ or ://; on its own (#1441), a name under .lan / .home.arpa, or one with a hyphen
  // or a digit under .local / .internal (p.local, this.internal are code's properties)
  { kind: 'computer name', re: /(?:\b[A-Za-z0-9]+(?:-[A-Za-z0-9]+)+\.local\b|(?:@|:\/\/)[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.(?:local|lan|internal|home\.arpa)\b|(?<=^|[\s"'`(<=[,])(?:[A-Za-z0-9][A-Za-z0-9-]*(?:\.[A-Za-z0-9-]+)*\.(?:lan|home\.arpa)|(?=[A-Za-z0-9.-]*[\d-])[A-Za-z0-9][A-Za-z0-9-]*(?:\.[A-Za-z0-9-]+)*\.(?:local|internal))(?=$|[\s"'`)>\]:,;/]))/gm,
    check: (m) => m[0].replace(/^(@|:\/\/)/, '') },
  // a network path, \\server\share (#1441), in text (in JavaScript, \\ is a string's one backslash: Verilog's
  // escaped identifiers, a regular expression)
  { kind: 'network path', re: /(?<![\\\w])\\\\(?![\\?.])([A-Za-z0-9][\w.-]*)\\[\w$][^\\\s"']*/g, not: /\.(m?js|cjs|ts|html?)$/i,
    check: (m) => (/^(server|host|<[^>]+>|\$\w+|%\w+%)$/i.test(m[1]) ? null : m[0]) },
  { kind: 'home folder with a user name', re: /(?:\/Users\/|\/home\/|[A-Za-z]:\\+(?:Users|Documents and Settings)\\+)([^/\\\s"'`)<>]+)/g,
    check: (m) => (PLACEHOLDER_USERS.test(m[1]) || /^Shared$/i.test(m[1]) ? null : m[0]) },
  { kind: 'credentials in a URL', needs: '://', re: /\b[a-z][a-z0-9+.-]*:\/\/[^/\s:@'"]+:[^/\s@'"]+@[^\s'"]+/gi },
  { kind: 'private key', re: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY(?: BLOCK)?-----|-----BEGIN OPENSSH PRIVATE KEY-----|PuTTY-User-Key-File-\d/g },
  // an SSH public key (#1441): the key's type, then its base64 (an authorized_keys / known_hosts line)
  { kind: 'SSH public key', re: /\b(?:ssh-(?:rsa|dss|ed25519)|ecdsa-sha2-nistp(?:256|384|521)|sk-(?:ssh-ed25519|ecdsa-sha2-nistp256)@openssh\.com)\s+AAAA[A-Za-z0-9+/]{20,}/g,
    check: (m) => `${m[0].slice(0, 40)}…` },
  // an access token: a provider's (its prefix), an AWS secret key as a value, or any bearer token written out (#1441)
  { kind: 'access token', re: /\b(?:AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,}|xox[abprs]-[A-Za-z0-9-]{10,}|sk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{35}|glpat-[A-Za-z0-9_-]{20,}|npm_[A-Za-z0-9]{36})\b/g },
  { kind: 'access token', re: /\baws[_-]?secret(?:[_-]?access)?[_-]?key\b["']?\s*[:=]\s*["']?([A-Za-z0-9/+]{40})(?![A-Za-z0-9/+])/gi,
    check: (m) => m[1] },
  { kind: 'access token', re: /\bBearer\s+([A-Za-z0-9._~+/=-]{20,})/g,
    check: (m) => (/^(<[^>]+>|x+|\.\.\.|…|(?:your|my|the)[_-]\w+|token|TOKEN|[A-Z_]+)$/.test(m[1]) ? null : `Bearer ${m[1].slice(0, 12)}…`) },
  { kind: 'JSON web token', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  // a password / secret written as a value (not a placeholder, an empty value or code)
  { kind: 'password or secret', re: /\b(?:password|passwd|pwd|passphrase|secret|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret)\b["']?\s*[:=]\s*["']([^"'\s]{4,})["']/gi,
    check: (m) => (/^(<[^>]+>|\*+|x+|\.\.\.|…|changeme|password|secret|your[_-]?\w*|example\w*|test\w*|dummy\w*|fake\w*|\$\{?\w+\}?)$/i.test(m[1]) ? null : m[0]) },
];

// files that must never be in the repository: ISE's binary outputs and licences, keys, environments
const FORBIDDEN_FILES = [
  [/\.(bit|ncd|ngd|ngc|ngm|ncd|bld|pcf|mcs|prm|ace|svf|jed|isc)$/i, 'Xilinx binary / programming file'],
  [/(^|\/)Xilinx\.lic$|\.lic$/i, 'licence file'],
  [/(^|\/)(id_rsa|id_ecdsa|id_ed25519|id_dsa)(\.pub)?$|\.(pem|key|p12|pfx|keychain|kdbx)$/i, 'key or keychain'],
  [/(^|\/)\.env(\.|$)|(^|\/)\.netrc$|(^|\/)\.npmrc$|(^|\/)\.pgpass$|(^|\/)credentials(\.json)?$/i, 'environment / credentials file'],
];
// text files written by ISE: they start with ISE's banner; only the allowed fixtures may
const ISE_BANNER = /Copyright \(c\) 1995-20\d\d Xilinx, Inc\.\s+All rights reserved|^XDL REPORT MODE|^# XDL REPORT MODE/m;
// a Xilinx bitstream, whatever its name (#1441): a .bit file's header, or the raw bitstream's dummy and sync words
// (Spartan-3 / Spartan-6: ffffffff aa995566) near its start
const BIT_HEADER = Buffer.from('00090ff00ff00ff00ff000000001', 'hex');
const BIT_SYNC = Buffer.from('ffffffffaa995566', 'hex');
export const isXilinxBitstream = (buf) => buf.subarray(0, 64).includes(BIT_HEADER) || buf.subarray(0, 512).includes(BIT_SYNC);

// a line longer than this (minified code, a data line) is scanned in chunks of it, each overlapping the next by a
// match's largest length (#1441: it was skipped)
const CHUNK = 20000, OVERLAP = 512;

/** The rules' matches in one line: [{ kind, text }], every occurrence (once each in a line scanned in chunks: the
 *  overlap would report a match twice). */
function matchesIn(file, line) {
  const out = [], seen = new Set(), chunked = line.length > CHUNK;
  for (let at = 0; at === 0 || at < line.length; at += CHUNK) {
    const chunk = chunked ? line.slice(at, at + CHUNK + OVERLAP) : line;
    for (const r of RULES) {
      if ((r.not && r.not.test(file)) || (r.needs && !chunk.includes(r.needs))) continue;
      for (const m of chunk.matchAll(r.re)) {
        const t = r.check ? r.check(m) : m[0];
        if (!t) continue;
        if (r.kind === 'IP address' && !isNetworkIp(t) && allowed(file, t)) continue;
        if (allowed(file, t)) continue;
        const k = `${r.kind}|${t}`;
        if (chunked && seen.has(k)) continue;
        seen.add(k);
        out.push({ kind: r.kind, text: t });
      }
    }
    if (!chunked) break;
  }
  return out;
}

/** The problems of one file: [{ file, line, kind, text }]. `whole`: text is the whole file (not a line
 *  of a diff), so that a file written by ISE can be recognized by its banner. */
export function scanText(file, text, { whole = true } = {}) {
  const out = [];
  for (const [re, kind] of FORBIDDEN_FILES) if (re.test(file)) { out.push({ file, line: 0, kind, text: path.basename(file) }); break; }
  if (whole && /\.(xdlrc|xdl|syr|srp|par|twr|mrp|map|vhd|v)$/i.test(file) && ISE_BANNER.test(text.slice(0, 4000))
      && !/hand-made|made-up/i.test(text.slice(0, 600)) && !allowed(file, 'Xilinx file')) {
    out.push({ file, line: 1, kind: 'file written by Xilinx ISE', text: text.slice(0, 80).split('\n')[0] });
  }
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) for (const m of matchesIn(file, lines[i])) out.push({ file, line: i + 1, ...m });
  return out;
}

const isBinary = (buf) => buf.subarray(0, 8000).includes(0);

/** The problems of one file read as bytes (#1441): a text file by its lines; a compressed one (.gz) by what it
 *  holds, under its name without .gz; a binary one by its header (a Xilinx bitstream under any name) and by its
 *  readable strings (eight characters or more), on which the rules run as on lines. */
export function scanBuffer(file, buf) {
  if (/\.gz$/i.test(file)) {
    try { return scanBuffer(file.replace(/\.gz$/i, ''), zlib.gunzipSync(buf)).map((x) => ({ ...x, file })); } catch { /* not gzip: as bytes */ }
  }
  if (!isBinary(buf)) return scanText(file, buf.toString('utf8'));
  const out = [];
  if (isXilinxBitstream(buf) && !allowed(file, 'Xilinx bitstream')) out.push({ file, line: 0, kind: 'Xilinx bitstream (by its header)', text: path.basename(file) });
  else for (const [re, kind] of FORBIDDEN_FILES) if (re.test(file)) { out.push({ file, line: 0, kind, text: path.basename(file) }); break; }
  const strings = buf.toString('latin1').match(/[\x20-\x7e]{8,}/g) || [];
  for (const s of strings) for (const m of matchesIn(file, s)) out.push({ file, line: 1, ...m });
  return out;
}

/** Every tracked file of the repository (git ls-files). */
export function scanRepo(root = ROOT) {
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 }).split('\0').filter(Boolean);
  const out = [];
  for (const f of files) {
    if (SELF.includes(f)) continue;
    const p = path.join(root, f);
    if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) continue;
    out.push(...scanBuffer(f, fs.readFileSync(p)));
  }
  return out;
}

/** Every line added in the history of `rev` and every commit message: that branch's history only, not
 *  every branch (#555), so that an open pull request's branch cannot fail main's scan. */
export function scanHistory(root = ROOT, rev = 'HEAD') {
  const out = [];
  const log = execFileSync('git', ['log', rev, '-p', '--no-color', '--no-ext-diff', '--format=@@COMMIT %H%n%B@@END', '--'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 30 });
  let commit = '', file = '', msg = null;
  for (const line of log.split('\n')) {
    if (line.startsWith('@@COMMIT ')) { commit = line.slice(9, 16); msg = []; continue; }
    if (msg) { if (line === '@@END') { out.push(...scanText(`(message of ${commit})`, msg.join('\n')).map((x) => ({ ...x, commit }))); msg = null; } else msg.push(line); continue; }
    if (line.startsWith('+++ b/')) { file = SELF.includes(line.slice(6)) ? null : line.slice(6); if (!file) continue; out.push(...scanText(file, '', { whole: false }).filter((x) => x.line === 0).map((x) => ({ ...x, commit }))); continue; }
    if (file && line.startsWith('+') && !line.startsWith('+++')) out.push(...scanText(file, line.slice(1), { whole: false }).filter((x) => x.line).map((x) => ({ ...x, commit })));
  }
  // one report per finding
  const seen = new Set();
  return out.filter((x) => { const k = `${x.file}|${x.kind}|${x.text}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const found = [...scanRepo(), ...(process.argv.includes('--history') ? scanHistory() : [])];
  for (const x of found) console.log(`${x.commit ? `${x.commit} ` : ''}${x.file}${x.line ? `:${x.line}` : ''}: ${x.kind}: ${x.text}`);
  console.log(found.length ? `${found.length} problem(s)` : 'no private data found');
  process.exit(found.length ? 1 : 0);
}
