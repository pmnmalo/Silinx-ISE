// Checks that the repository holds no data that must not be published: personal data (e-mail
// addresses, home folders with a user name, logins such as user@host), computer names and IP, IPv6
// and MAC addresses of a network, network paths, passwords, keys (private, SSH public) and access
// tokens, and Xilinx files (ISE's binary outputs, licences, device reports). Run by
// test/private-data.test.js on every tracked file: the text ones line by line (a long line in chunks), UTF-16
// ones decoded (#3520), the compressed ones (.gz) inflated, the archives' (.zip, .tar, .tgz) files each, another
// archive refused unless allowed, the other binary ones by their readable strings and, for a Xilinx bitstream, by
// its header (#1441). The scanner and its test are scanned too (#3520): their own examples are allowed below.
//
//   node scripts/check-private-data.mjs              the tracked files
//   node scripts/check-private-data.mjs --history    also every line added in the history of HEAD
//                                                    (main, in CI), every binary file added or changed
//                                                    there, and every commit's message, author and
//                                                    committer (#3366); other branches are checked by
//                                                    their own pull requests
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// The maintainer's public commit addresses (#3366), by the SHA-256 of the address in lower case, so that this file
// does not spell them out
const PUBLIC_ADDRESSES = new Set([
  'c6bfb5fcc22e157d3a22267f7a82ab149800fd43e7ccc5a25a89ebe21bb998b6',
  'd48e9c9ebc87c8080a06452cbcafa230ec40c16b1ad77bb2763a3b4bc7c3429e',
  'ac9c234512663d023e0caadb823ea29c7eaae5543be3a8ec7418e833efeb3c03',
]);
export const publicAddress = (text) => PUBLIC_ADDRESSES.has(crypto.createHash('sha256').update(text.toLowerCase()).digest('hex'));

// Known, harmless matches: [file (or a RegExp of files), the matched text (or a RegExp, or a function of it), why]
const ALLOW = [
  [/^((packages\/silinx-fpga\/)?THIRD-PARTY-NOTICES\.md|scripts\/licences\/[^/]+\.txt)$/, /@/, 'the licence texts of the third-party packages name their authors'],
  [/./, /^(127\.\d+\.\d+\.\d+|0\.0\.0\.0|255\.255\.255\.255)$/, 'loopback / any address / broadcast'],
  [/./, /^(192\.0\.2|198\.51\.100|203\.0\.113)\.\d+$/, 'documentation addresses (RFC 5737)'],
  [/./, /^(::1|::|::[fF]{4}:(127|0)|2001:0?[dD][bB]8:.*)$/, 'IPv6 loopback / any address (also mapped), the documentation prefix (RFC 3849)'],
  [/./, /^(00[:-]00[:-]00[:-]00[:-]00[:-]00|[fF]{2}([:-][fF]{2}){5})$/, 'the MAC address of no card, the broadcast address'],
  [/./, /@(example\.(com|org|net)|[\w.-]+\.(example|test|invalid))$/, 'example domains (RFC 2606)'],
  [/./, /^(noreply@anthropic\.com|[\w.+-]+@users\.noreply\.github\.com)$/, 'no-reply addresses (the Co-Authored-By line of commits)'],
  [/./, 'noreply@github.com', 'GitHub\'s own address: the committer of a commit made on github.com'],
  [/^\((author|committer) of [0-9a-f]+\)$/, publicAddress, 'the maintainer\'s public commit addresses (#3366)'],
  [/^\(committer of (4525058|7e935ac)\)$/, /./, 'two commits of the quality comparison made on the self-hosted runner before '
    + '#486, whose committer was named after the machine\'s local user and name: the history cannot be rewritten (#3366)'],
  [/./, 'git@github.com', 'GitHub\'s ssh login, in a repository\'s ssh address (#3195): no one\'s address'],
  [/^packages\/silinx-fpga\/test\/fixtures\/xc7\/[\w-]+\.bitstream(\.gz)?$/, 'Xilinx bitstream',
    'bitstreams Project X-Ray\'s xc7frames2bit made (ISC), no Xilinx tool\'s: the 7-series writer\'s references (#3144)'],
  [/^test\/git(-core)?\.test\.js$/, /^(https:\/\/x:y@host\/a|ghp_secret@gitlab\.com|tok@github\.com|https:\/\/user:ghp_secret@gitlab\.com\/a\/b|https:\/\/ana:tok@github\.com\/a\/b\/\\?)$/,
    'made-up credentials in URLs, which git\'s messages lose (#3195)'],
  ['test/corpus/vloghammer-gen.mjs', 'claire@yosyshq.com', 'the copyright notice of VlogHammer (ISC licence), which a port must keep'],
  ['test/lang-vhdl-types.test.js', '6.4.2.3', 'a section of the VHDL standard'],
  [/^((core|packages\/silinx-hdl\/src)\/(elab-expr|elaborate)\.js|test\/vhdl-unconstrained-const\.test\.js)$/, '9.3.3.3', 'a section of the VHDL standard (#2559; in the HDL front end package since #1710)'],
  [/^((packages\/silinx-hdl\/)?(src\/vhdl\/interface-refs\.js|changes\/3744-vhdl-interface-default-refs\.md|CHANGELOG\.md)|core\/translate-to-vhdl\.js|test\/(vhdl-interface-refs|translate)\.test\.js)$/, '4.3.2.1',
    'a section of the VHDL standard: interface lists, a default that uses an earlier object of its list (#3744)'],
  ['core/vhdl/actual.js', '4.3.2.2', 'a section of the VHDL standard, which the file named before #2579 (in the history only)'],
  [/^(test\/((ui\/)?(design|mcp)-link|ui\/link-hash)\.test\.js|\(message of 9973e11\))$/, /^(https:\/\/u:p@example\.org\/a\.zip|10\.0\.0\.5|192\.168\.1\.1|172\.(20|32)\.0\.1|169\.254\.169\.254|fd00::1|mac-mini\.local|100\.101\.102\.103|8\.8\.8\.8|192\.169\.0\.1|2606:4700::1111)$/,
    'a link\'s zip address refused or taken (#2829; a link given to a running app, #3316, #3345; named in the message of #3415\'s commit, #3494): made-up local and public addresses, a made-up login'],
  [/^(core\/design-link\.js|test\/(ui\/)?design-link\.test\.js|changes\/2962-link-addresses\.md|CHANGELOG\.md|\(message of e37c940\))$/,
    /^(::[0-9a-f:.]*|64:ff9[ab]:[0-9a-f:]*|2002:[0-9a-f:]+|2001:[0-9a-f:]+|f[b-f][0-9a-f]{2}:[0-9a-f:]*|100::1?|10\.0\.0\.1|198\.(1[89]|20)\.\d+\.\d+|192\.0\.[03]\.\d+|203\.0\.114\.1)$/,
    'the special-purpose ranges a link\'s zip address is checked against, and addresses at their edges (#2962): IPv4-compatible, mapped, NAT64, 6to4, Teredo and its neighbours (#3415), unique and link-local, multicast, discard, benchmarking; also named in the message of #3123\'s commit (#3129)'],
  ['test/server-api.test.js', /^(fpga-lab\.local|box\.lan)$/, 'made-up computer names: the Host header test, the ssh settings'],
  ['test/collab-host.test.js', '192.168.1.20', "a made-up local network address in an SDP fixture, a documentation address since (in the history only, #3365)"],
  ['server/git.js', /^(token@github\.com|https:\/\/user:token@github\.com)$/, "a made-up login in a comment's example of a URL with credentials (in the history only, #3365)"],
  ['test/build-settings.test.js', /^(\/home\/[uU]|build-box\.local)$/, "made-up remote folders and a made-up computer name of the build-settings checks (#3407)"],
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
  ['test/git-core.test.js', 'u@h', 'a made-up ssh login in a URL whose credentials redact takes off (#3195, #3520)'],
  ['test/ise-flow.test.js', 'me@build-box', 'the made-up login and computer of the remote build\'s ssh command test (#3520)'],
  // the scanner and its test (#3520: scanned too): this list names each value it allows (a text, or ^…$ texts) with its
  // reason, and the rules' comments their examples; the test's examples are built at run time, and its expected results
  // name made-up people's folders and made-up secrets
  ['scripts/check-private-data.mjs', (t) => namedHere(t) || /^(Janes-MacBook-Pro\.local|\/Users\/,|-----BEGIN OPENSSH PRIVATE KEY-----|130\.0\.0\.0)$/.test(t),
    'the allow-list\'s own values, each with its reason above, the rules\' examples in their comments, and a Chrome version it allowed '
    + 'in a User-Agent string before #1080 (in the history only) (#3520)'],
  ['test/private-data.test.js', /^(\/(Users|home)\/(alice|bob|carol|x)|Janes-MacBook-Pro\.local|password = \x22hunter2x\x22|api_key\x22: \x22k3yValue9\x22|secret = \x22\\\$\{SECRET\}\x22|ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTIt…)$/,
    'the rules\' tests: made-up people\'s home folders, a made-up computer name and made-up secrets in their expected results (#3520)'],
];
// a text an entry of the allow-list names as such (a text, or an anchored pattern): the list's own values
function namedHere(t) {
  return ALLOW.some(([, a]) => (typeof a === 'string' ? a === t : a instanceof RegExp && a.source.startsWith('^') && a.source.endsWith('$') && a.test(t)));
}

// the rules themselves and their tests hold examples of what they look for (scanned all the same, their own ALLOW entries)
export const SELF = ['scripts/check-private-data.mjs', 'test/private-data.test.js'];

const allowed = (file, text) => ALLOW.some(([f, t]) =>
  (typeof f === 'string' ? f === file : f.test(file)) && (typeof t === 'string' ? t === text : typeof t === 'function' ? t(text) : t.test(text)));

// placeholders that may follow /Users/, /home/ or C:\Users\ in documentation, and GitHub's hosted runners' own
// accounts (runner on Linux, runneradmin on macOS and Windows, RUNNER~1 its short 8.3 name: #3611's commits, #3726)
const PLACEHOLDER_USERS = /^(<[^>]+>|\$\w+|\$\{\w+\}|%\w+%|you|me|user|username|name|runner|runneradmin|RUNNER~1|USER|USERNAME|\.\.\.|…)$/;

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
  // a login on a computer named with no domain (user@name, #3520): after ssh / scp / sftp / rsync / mosh, after ://,
  // or as a YAML value (a package's version, pkg@latest, an action's, x/y@v4, a test's name, tb@synth, are none)
  { kind: 'login (user@name)', needs: '@', re: /(?:(?<=\b(?:ssh|scp|sftp|rsync|mosh)\s(?:[^\s|;&]+\s+)*)|(?<=:\/\/)|(?<=^\s*[\w.-]+:\s+["']?))[A-Za-z0-9._-]+@[A-Za-z][A-Za-z0-9-]*(?![\w.@\\-])/gm,
    check: (m) => (/^(user|you|me|name|login|username)@(host|server|machine|name|computer|hostname|address|example)$/i.test(m[0]) ? null : m[0]) },
  // an IPv6 address (#1441): eight groups of hex digits, or a shortened one (::) with two groups at least, a digit
  // and a group of two digits or more (a time, 08:13:55, has no ::; a scope, std::string or A::B, no digit); ::1,
  // :: and the documentation prefix are allowed below, as 127.0.0.1 is
  { kind: 'IPv6 address', needs: ':', re: /(?<![\w:.])(?:(?:[0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4}|(?:[0-9A-Fa-f]{1,4}:){1,6}(?::[0-9A-Fa-f]{1,4}){1,6}|(?:[0-9A-Fa-f]{1,4}:){2,7}:|::(?:[0-9A-Fa-f]{1,4}:){1,6}[0-9A-Fa-f]{1,4})(?![\w:.])/g,
    check: (m) => (/\d/.test(m[0]) && /[0-9A-Fa-f]{2}/.test(m[0]) ? m[0] : null) },
  // a MAC address (#1441), in either notation; all zeros and the broadcast address are allowed below
  { kind: 'MAC address', re: /(?<![\w:-])(?:[0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}(?![\w:])|(?<![\w:-])(?:[0-9A-Fa-f]{2}-){5}[0-9A-Fa-f]{2}(?![\w-])/g },
  // a computer's name: under .local with a hyphen (Janes-MacBook-Pro.local); any name under .local / .lan /
  // .internal / .home.arpa after @ or ://; on its own (#1441), a name under .lan / .home.arpa, or one with a hyphen
  // or a digit under .local / .internal (p.local, this.internal are code's properties); any one under .local /
  // .internal in quotes, right after = or a colon, or as a YAML value (#3520)
  { kind: 'computer name', re: /(?:\b[A-Za-z0-9]+(?:-[A-Za-z0-9]+)+\.local\b|(?:@|:\/\/)[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.(?:local|lan|internal|home\.arpa)\b|(?<=^|[\s"'`(<=[,])(?:[A-Za-z0-9][A-Za-z0-9-]*(?:\.[A-Za-z0-9-]+)*\.(?:lan|home\.arpa)|(?=[A-Za-z0-9.-]*[\d-])[A-Za-z0-9][A-Za-z0-9-]*(?:\.[A-Za-z0-9-]+)*\.(?:local|internal))(?=$|[\s"'`)>\]:,;/]))/gm,
    check: (m) => m[0].replace(/^(@|:\/\/)/, '') },
  { kind: 'computer name', re: /(?:(?<=["'`=:])|(?<=^\s*[\w.-]+:\s+))[A-Za-z]+(?:\.[A-Za-z]+)*\.(?:local|internal)(?=$|["'`\s)>\]:,;/])/gm },
  // a tailnet's name (Tailscale's MagicDNS, #3520): <computer>.<tailnet>.ts.net
  { kind: 'computer name', needs: '.ts.net', re: /\b[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.ts\.net\b/g },
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

// UTF-16 text (#3520): its byte order mark, or one byte of two zero in a text of ASCII characters -> 'utf16le' /
// 'utf16be', or null
function utf16(buf) {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return 'utf16le';
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) return 'utf16be';
  const n = Math.min(buf.length, 8000) & ~1;
  if (n < 8) return null;
  let even = 0, odd = 0;
  for (let k = 0; k < n; k += 2) { if (buf[k] === 0) even++; if (buf[k + 1] === 0) odd++; }
  return odd > n * 0.45 && !even ? 'utf16le' : even > n * 0.45 && !odd ? 'utf16be' : null;
}
const fromUtf16 = (buf, enc) => {
  const b = enc === 'utf16be' ? Buffer.from(buf.subarray(0, buf.length & ~1)).swap16() : buf;
  return b.toString('utf16le').replace(/^﻿/, '');
};

// an archive's files (#3520): a zip's (stored or deflated), a tar's -> [{ name, data }], or null if it cannot be read
function zipFiles(buf) {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0 || end + 22 > buf.length) return null;
  const out = [];
  let at = buf.readUInt32LE(end + 16);
  for (let k = buf.readUInt16LE(end + 10); k > 0; k--) {
    if (at + 46 > buf.length || buf.readUInt32LE(at) !== 0x02014b50) return null;
    const method = buf.readUInt16LE(at + 10), size = buf.readUInt32LE(at + 20), nl = buf.readUInt16LE(at + 28);
    const name = buf.toString('utf8', at + 46, at + 46 + nl), local = buf.readUInt32LE(at + 42);
    at += 46 + nl + buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32);
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) return null;
    const from = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28), raw = buf.subarray(from, from + size);
    if (name.endsWith('/')) continue;
    if (method === 0) out.push({ name, data: raw });
    else if (method === 8) { try { out.push({ name, data: zlib.inflateRawSync(raw) }); } catch { return null; } }
    else return null;
  }
  return out;
}
function tarFiles(buf) {
  const out = [];
  let headers = 0;
  for (let at = 0; at + 512 <= buf.length; headers++) {
    const head = buf.subarray(at, at + 512);
    if (head.every((b) => b === 0)) { headers++; break; }
    const str = (a, n) => head.toString('utf8', a, a + n).replace(/\0.*$/s, '');
    const size = parseInt(str(124, 12).trim() || '0', 8);
    if (!Number.isFinite(size) || head.toString('latin1', 257, 262) !== 'ustar' && !/^[0-7 \0]+$/.test(head.toString('latin1', 124, 136))) return null;
    const name = [str(345, 155), str(0, 100)].filter(Boolean).join('/');
    if ('0\0'.includes(String.fromCharCode(head[156])) || 'xgL'.includes(String.fromCharCode(head[156]))) out.push({ name, data: buf.subarray(at + 512, at + 512 + size) });
    at += 512 + Math.ceil(size / 512) * 512;
  }
  return headers ? out : null;   // (no header, not even the end's: no tar, #3682)
}
// archives no rule reads: refused unless allowed (#3520)
const OTHER_ARCHIVE = /\.(7z|rar|xz|txz|bz2|tbz2?|zst|lz|lzma|z|cab|iso|dmg|apk|deb|rpm)$/i;

/** The problems of one file read as bytes (#1441): a text file by its lines (UTF-16 decoded, #3520); a compressed
 *  one (.gz, a .tgz with no tar inside: #3682) by what it holds, under its name without .gz; an archive (.zip and
 *  the formats built on it, .tar, .tgz) by its files, each under archive:name (#3520), another kind of archive, or one that cannot be read, refused unless
 *  allowed ('archive not read'); a binary one by its header (a Xilinx bitstream under any name) and by its readable
 *  strings (eight characters or more), on which the rules run as on lines. */
export function scanBuffer(file, buf) {
  if (/\.gz$/i.test(file)) {
    const inner = file.replace(/\.gz$/i, '');   // (an archive's file keeps its name after the archive's)
    try { return scanBuffer(inner, zlib.gunzipSync(buf)).map((x) => ({ ...x, file: file + x.file.slice(inner.length) })); } catch { /* not gzip: as bytes */ }
  }
  if (/\.tgz$/i.test(file)) {
    // (a gzip with no tar inside scanned as what it holds, as a .gz's is, #3682)
    let data = null;
    try { data = zlib.gunzipSync(buf); } catch { /* not gzip */ }
    if (data) {
      const inner = tarFiles(data) ? file.replace(/\.tgz$/i, '.tar') : file.replace(/\.tgz$/i, '');
      return scanBuffer(inner, data).map((x) => ({ ...x, file: file + x.file.slice(inner.length) }));
    }
  }
  const members = /\.(zip|jar|docx|xlsx|pptx|odt|ods|odp|epub|whl)$/i.test(file) ? zipFiles(buf) : /\.tar$/i.test(file) ? tarFiles(buf) : undefined;
  if (members !== undefined || OTHER_ARCHIVE.test(file)) {
    if (members) return members.flatMap((m) => scanBuffer(`${file}:${m.name}`, m.data));
    return allowed(file, 'archive not read') ? [] : [{ file, line: 0, kind: 'archive not read', text: path.basename(file) }];
  }
  const wide = isBinary(buf) && utf16(buf);
  if (wide) return scanText(file, fromUtf16(buf, wide));
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
    const p = path.join(root, f);
    if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) continue;
    out.push(...scanBuffer(f, fs.readFileSync(p)));
  }
  return out;
}

/** Every line added in the history of `rev`, every binary file added or changed there (#3366: `git log -p` shows
 *  none of their content), and every commit's message, author and committer (#3366): that branch's history only,
 *  not every branch (#555), so that an open pull request's branch cannot fail main's scan. */
export function scanHistory(root = ROOT, rev = 'HEAD') {
  const out = [];
  const log = execFileSync('git', ['-c', 'core.quotePath=false', 'log', rev, '-p', '--raw', '--no-abbrev', '--no-renames', '--no-color', '--no-ext-diff',
    '--format=@@COMMIT %H%n@@ID %an <%ae>%x00%cn <%ce>%n%B@@END', '--'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 30 });
  let commit = '', file = '', msg = null, blobs = new Map();
  const binaries = new Map();   // blob -> { file, commit }, each blob once
  const tagged = (x) => ({ ...x, commit });
  for (const line of log.split('\n')) {
    if (line.startsWith('@@COMMIT ')) { commit = line.slice(9, 16); msg = []; blobs = new Map(); continue; }
    if (msg && !msg.length && line.startsWith('@@ID ')) {
      const [author, committer] = line.slice(5).split('\0');
      out.push(...scanText(`(author of ${commit})`, author).map(tagged), ...scanText(`(committer of ${commit})`, committer).map(tagged));
      continue;
    }
    // the raw list (before the diff): each file's new blob, for a binary one
    const raw = !msg && /^:\d+ \d+ [0-9a-f]+ ([0-9a-f]+) [AMT]\t(.*)$/.exec(line);
    if (raw) { blobs.set(unquote(raw[2]), raw[1]); continue; }
    const binary = !msg && /^Binary files .* and ("?)b\/(.*)\1 differ$/.exec(line);
    if (binary) {
      binary[1] = unquote(binary[1] ? `"${binary[2]}"` : binary[2]);
      const sha = blobs.get(binary[1]);
      if (sha && !binaries.has(sha)) binaries.set(sha, { file: binary[1], commit });
      continue;
    }
    if (msg) { if (line === '@@END') { out.push(...scanText(`(message of ${commit})`, msg.join('\n')).map((x) => ({ ...x, commit }))); msg = null; } else msg.push(line); continue; }
    // a file's header: its path as git writes it, quoted when it holds a quote, a backslash or a control character
    // (#3520: such a file's lines were filed under the file before it); a file deleted has no line added
    if (line.startsWith('+++ ')) {
      const name = line === '+++ /dev/null' ? null : unquote(line.slice(4));
      file = name && name.startsWith('b/') ? name.slice(2) : name;
      if (file) out.push(...scanText(file, '', { whole: false }).filter((x) => x.line === 0).map((x) => ({ ...x, commit })));
      continue;
    }
    if (line.startsWith('diff --git ')) { file = null; continue; }
    if (file && line.startsWith('+') && !line.startsWith('+++')) out.push(...scanText(file, line.slice(1), { whole: false }).filter((x) => x.line).map((x) => ({ ...x, commit })));
  }
  for (const [sha, b] of binaries) out.push(...scanBuffer(b.file, readBlob(root, sha)).map((x) => ({ ...x, commit: b.commit })));
  // one report per finding
  const seen = new Set();
  return out.filter((x) => { const k = `${x.file}|${x.kind}|${x.text}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

/** A path as git writes it: as it is, or in quotes with C's escapes (\", \\, \t, \n, \ooo for a byte). */
function unquote(p) {
  if (!p.startsWith('"') || !p.endsWith('"') || p.length < 2) return p;
  const body = Buffer.from(p.slice(1, -1), 'utf8'), bytes = [];
  const esc = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, '"': 34, '\\': 92 };
  for (let k = 0; k < body.length; k++) {
    if (body[k] !== 0x5c) { bytes.push(body[k]); continue; }
    const o = /^[0-7]{3}/.exec(body.toString('latin1', k + 1, k + 4));
    if (o) { bytes.push(parseInt(o[0], 8)); k += 3; } else { k++; const c = String.fromCharCode(body[k]); bytes.push(esc[c] ?? body[k]); }
  }
  return Buffer.from(bytes).toString('utf8');
}

/** A blob's bytes. */
const readBlob = (root, sha) => execFileSync('git', ['cat-file', 'blob', sha], { cwd: root, maxBuffer: 1 << 30 });

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const found = [...scanRepo(), ...(process.argv.includes('--history') ? scanHistory() : [])];
  for (const x of found) console.log(`${x.commit ? `${x.commit} ` : ''}${x.file}${x.line ? `:${x.line}` : ''}: ${x.kind}: ${x.text}`);
  console.log(found.length ? `${found.length} problem(s)` : 'no private data found');
  process.exit(found.length ? 1 : 0);
}
