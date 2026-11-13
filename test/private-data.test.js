// No data that must not be published in the repository (scripts/check-private-data.mjs): personal
// data, computer names and network addresses, logins, passwords, keys and tokens, Xilinx files.
// The examples below are built at run time, so that this file does not hold what it looks for.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import zlib from 'node:zlib';
import { scanRepo, scanHistory, scanText, scanBuffer, isXilinxBitstream, publicAddress, SELF } from '../scripts/check-private-data.mjs';

const kinds = (file, text) => scanText(file, text).map((x) => `${x.kind}: ${x.text}`);
const at = '@', dot = (...p) => p.join('.');

test('the tracked files hold no private data, secrets or Xilinx files', () => {
  const found = scanRepo();
  // (the scanner and this file are scanned too, #3520: their examples of what is looked for allowed by their own entries)
  assert.deepEqual(SELF, ['scripts/check-private-data.mjs', 'test/private-data.test.js']);   // and nothing else
  assert.deepEqual(found.map((x) => `${x.file}${x.line ? `:${x.line}` : ''}: ${x.kind}: ${x.text}`), [],
    'remove these (or, for a harmless match, add it with its reason to ALLOW in scripts/check-private-data.mjs)');
});

// #3121: #2962's special-purpose ranges are allowed in its fragment and in CHANGELOG.md, where a release moves it, and in #3123's commit message (#3129)
test("#2962's special-purpose addresses: allowed in its fragment and the CHANGELOG, not elsewhere (#3121)", () => {
  const c = (...p) => p.join(':');
  const text = `NAT64 \`${c('64', 'ff9b', '')}:/96\` and \`${c('64', 'ff9b', '1', '')}:/48\`, \`${dot(198, 18, 0, 0)}/15\`, \`${dot(192, 0, 0, 0)}/24\``;
  for (const f of ['changes/2962-link-addresses.md', 'CHANGELOG.md']) assert.deepEqual(kinds(f, text), [], f);
  assert.equal(kinds('README.md', text).length, 4);
  // #3129: #3123's commit message names two of them, and main's history stays as it is
  const msg = `${dot(198, 18, 0, 0)}/15, ${dot(192, 0, 0, 0)}/24`;
  assert.deepEqual(kinds('(message of e37c940)', msg), []);
  assert.deepEqual(kinds('(message of 0000000)', msg), [`IP address: ${dot(198, 18, 0, 0)}`, `IP address: ${dot(192, 0, 0, 0)}`]);
});

test('personal data: e-mail addresses, home folders with a user name, logins', () => {
  assert.deepEqual(kinds('a.md', `write to jane.doe${at}${dot('mail', 'pt')}`), [`e-mail address: jane.doe${at}mail.pt`]);
  assert.deepEqual(kinds('a.md', `jane${at}${dot('example', 'com')} and bot${at}${dot('lab', 'test')}`), []);   // example domains
  assert.deepEqual(kinds('THIRD-PARTY-NOTICES.md', `Copyright (c) Some Author <a${at}${dot('b', 'org')}>`), []);   // licence texts
  assert.deepEqual(kinds('packages/silinx-fpga/THIRD-PARTY-NOTICES.md', `Copyright (c) Some Author <a${at}${dot('b', 'org')}>`), []);   // silinx-fpga's (#1681)
  assert.equal(kinds('packages/silinx-fpga/README.md', `Copyright (c) Some Author <a${at}${dot('b', 'org')}>`).length, 1);
  assert.deepEqual(kinds('a.js', `const p = '${['', 'Users', 'alice', 'x.v'].join('/')}';`), [`home folder with a user name: /Users/alice`]);
  assert.deepEqual(kinds('a.js', `cd ${['', 'home', 'bob', 'proj'].join('/')}`), [`home folder with a user name: /home/bob`]);
  assert.deepEqual(kinds('a.md', `C:${'\\'}Users${'\\'}carol${'\\'}Desktop`), [`home folder with a user name: C:${'\\'}Users${'\\'}carol`]);
  assert.deepEqual(kinds('a.md', `${['', 'Users', '<you>', 'x'].join('/')} ${['', 'home', '$USER'].join('/')} ${['', 'home', 'runner', 'work'].join('/')}`), []);   // placeholders
  assert.deepEqual(kinds('a.sh', `ssh pi${at}${dot(10, 1, 2, 3)}`), [`IP address: ${dot(10, 1, 2, 3)}`, `login (user${at}address): pi${at}${dot(10, 1, 2, 3)}`]);
});

test('computer names and network addresses; versions and local addresses are fine', () => {
  assert.deepEqual(kinds('a.md', `the server at ${dot(192, 168, 1, 20)}`), [`IP address: ${dot(192, 168, 1, 20)}`]);
  assert.deepEqual(kinds('a.md', `public ${dot(8, 8, 4, 4)}`), [`IP address: ${dot(8, 8, 4, 4)}`]);
  // a product's version after its name and a slash (a User-Agent string) is not an address; one after :// or a path's
  // slash is (#1027, #1080)
  assert.deepEqual(kinds('a.json', `"ua": "Mozilla/5.0 (X11) AppleWebKit/537.36 Chrome/${dot(156, 0, 0, 0)} Safari/537.36"`), []);
  assert.deepEqual(kinds('a.md', `http://${dot(8, 8, 4, 4)}/x and /${dot(8, 8, 4, 4)}`), [`IP address: ${dot(8, 8, 4, 4)}`, `IP address: ${dot(8, 8, 4, 4)}`]);
  assert.deepEqual(kinds('a.md', `${dot(127, 0, 0, 1)}:8642 ${dot(0, 0, 0, 0)} ${dot(192, 0, 2, 7)} v${dot(1, 2, 3, 4)} ${dot(1, 2, 3, 4, 5)} 15.10.1`), []);
  assert.deepEqual(kinds('a.md', `open http://${'Janes-MacBook-Pro'}.local:8642`), ['computer name: Janes-MacBook-Pro.local']);
  assert.deepEqual(kinds('a.js', 'const local = p.local; x.local = 1;'), []);   // code, not names
});

test('IPv6 and MAC addresses, bare computer names, network paths (#1441); loopback, documentation and code are fine', () => {
  const c = (...p) => p.join(':');
  assert.deepEqual(kinds('a.md', `ssh to ${c('fe80', '', '1')}%en0 and ${c('2a01', '4f8', 'c2c', '7b1', '', '1')}`), [`IPv6 address: ${c('fe80', '', '1')}`, `IPv6 address: ${c('2a01', '4f8', 'c2c', '7b1', '', '1')}`]);
  assert.deepEqual(kinds('a.md', `[${c('2001', '0db8', '85a3', '0000', '0000', '8a2e', '0370', '7334')}]:8080`), []);   // documentation prefix (RFC 3849)
  assert.deepEqual(kinds('a.md', `[${c('2a01', '0db8', '85a3', '0000', '0000', '8a2e', '0370', '7334')}]:8080`).length, 1);   // the full form
  assert.deepEqual(kinds('a.js', `['::1', '[::1]', '::'] at 08:13:55; std::string; cfg " A::B "; /^::ffff:127\\./`), []);
  const mac = c('a4', '83', 'e7', '01', '23', '45');
  assert.deepEqual(kinds('a.md', `ether ${mac} and ${mac.replaceAll(':', '-')} and ${c('00', '00', '00', '00', '00', '00')} ${c('ff', 'ff', 'ff', 'ff', 'ff', 'ff')}`), [`MAC address: ${mac}`, `MAC address: ${mac.replaceAll(':', '-')}`]);
  assert.deepEqual(kinds('a.md', `at 12:30:45:00:00:00:1 or ${c('a4', '83', 'e7', '01', '23', '45', '67')}`), []);   // longer than a MAC
  // a name on its own: under .lan / .home.arpa, or with a hyphen or a digit under .local / .internal
  const h = (...p) => p.join('.');
  assert.deepEqual(kinds('a.md', `ssh ${h('nas', 'lan')}; open http://${h('mini', 'home', 'arpa')}/ and ${h('pc2', 'local')}, "${h('build', 'corp-x', 'internal')}"`),
    [`computer name: ${h('nas', 'lan')}`, `computer name: ${h('mini', 'home', 'arpa')}`, `computer name: ${h('pc2', 'local')}`, `computer name: ${h('build', 'corp-x', 'internal')}`]);
  assert.deepEqual(kinds('a.js', `const l = p.local; this.local = 1; x.internal(); help: HELP.local, tc.HELP.local; a.lan.b; mini.local.txt`), []);
  assert.deepEqual(kinds('test/server-api.test.js', `host: '${h('box', 'lan')}'`), []);   // the made-up name of the ssh settings' test
  // a network path, in text; in JavaScript \\ is an escaped backslash (Verilog's escaped identifiers)
  const unc = `${'\\\\'}${'nas-01'}${'\\'}share${'\\'}x.bit`;
  assert.deepEqual(kinds('a.md', `copy ${unc} here, not ${'\\\\'}server${'\\'}share or ${'\\\\'}?${'\\'}C:`), [`network path: ${unc.slice(0, unc.lastIndexOf('\\'))}`]);   // the server and its share
  assert.deepEqual(kinds('a.js', `'module ${'\\\\'}top${'\\'}n  wire ${'\\\\'}keep${'\\'}nend'; ${unc}`), []);
});

test('passwords, keys and access tokens', () => {
  assert.deepEqual(kinds('a.js', `const password = "${'hunter'}2x";`), [`password or secret: password = "hunter2x"`]);
  assert.deepEqual(kinds('a.json', `{"api_key": "${'k3y'}Value9"}`), [`password or secret: api_key": "k3yValue9"`]);
  assert.deepEqual(kinds('a.md', `password: "<your password>", secret = "\${SECRET}", token: "xxxx"`), []);   // placeholders
  assert.deepEqual(kinds('a.md', `git clone https://me:${'s3cr3t'}${at}example.org/r.git`).map((k) => k.split(':')[0]), ['credentials in a URL']);
  assert.deepEqual(kinds('id', `-----BEGIN ${'OPENSSH'} PRIVATE KEY-----`).map((k) => k.split(':')[0]), ['private key']);
  for (const tok of ['gh' + 'p_' + 'A'.repeat(36), 'github_' + 'pat_' + 'B'.repeat(40), 'AK' + 'IA' + 'ABCDEFGHIJKLMNOP', 'sk-' + 'ant-' + 'x'.repeat(30), 'xo' + 'xb-' + '1234567890-abc', 'xo' + 'xp-' + '1234567890-abc']) {
    assert.deepEqual(kinds('a.txt', `token ${tok} end`).map((k) => k.split(':')[0]), ['access token'], tok.slice(0, 4));
  }
  // #1441: an SSH public key, a PGP or PuTTY private key, an AWS secret key as a value, a bearer token written out
  const pub = `ssh-${'ed25519'} AAAA${'C3NzaC1lZDI1NTE5AAAAIGb7'}x`;
  assert.deepEqual(kinds('authorized_keys', `${pub} me@laptop`).map((k) => k.split(':')[0]), ['SSH public key']);
  assert.deepEqual(kinds('known_hosts', `ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAI`).map((k) => k.split(':')[0]), ['SSH public key']);
  assert.deepEqual(kinds('a.md', `ssh-ed25519 is a key type; AAAA records`), []);
  assert.deepEqual(kinds('k.asc', `-----BEGIN PGP ${'PRIVATE'} KEY BLOCK-----`).map((k) => k.split(':')[0]), ['private key']);
  assert.deepEqual(kinds('k.ppk', `PuTTY-User-Key-File-${3}: ssh-rsa`).map((k) => k.split(':')[0]), ['private key']);
  const aws = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
  assert.deepEqual(kinds('a.ini', `aws_secret_${'access_key'} = ${aws}`), [`access token: ${aws}`]);
  assert.deepEqual(kinds('a.md', `AWS_SECRET_${'ACCESS_KEY'}: <your key>; aws_secret_access_key = \${AWS_SECRET}`), []);
  assert.deepEqual(kinds('a.sh', `curl -H "Authorization: Bearer ${'eyJhbGci'}OiJIUzI1NiJ9abc.def"`), [`access token: Bearer ${'eyJhbGci'}OiJI…`]);
  assert.deepEqual(kinds('a.js', `headers: { Authorization: \`Bearer \${token}\` }; 'Bearer <token>'; "Bearer $GITHUB_TOKEN"; Bearer TOKEN_FROM_THE_ENVIRONMENT`), []);
});

// a Xilinx bitstream's header, then a design's name field, as bitgen writes it
const BIT = Buffer.concat([Buffer.from('00090ff00ff00ff00ff000000001', 'hex'), Buffer.from('6100', 'hex'), Buffer.from('top.ncd\0'), Buffer.alloc(64)]);

test('binary files (#1441): a Xilinx bitstream by its header under any name, their strings by the rules; compressed files inflated', () => {
  assert.ok(isXilinxBitstream(BIT));
  assert.ok(isXilinxBitstream(Buffer.concat([Buffer.alloc(16), Buffer.from('ffffffffaa995566', 'hex'), Buffer.alloc(100)])));   // a raw bitstream's sync word
  assert.ok(!isXilinxBitstream(Buffer.from('\x89PNG\r\n\x1a\n' + '\0'.repeat(64), 'latin1')));
  assert.deepEqual(scanBuffer('build/top.bin', BIT).map((x) => `${x.line}: ${x.kind}: ${x.text}`), ['0: Xilinx bitstream (by its header): top.bin']);
  assert.deepEqual(scanBuffer('build/top.bit', BIT).map((x) => x.kind), ['Xilinx bitstream (by its header)']);   // once, not also by its name
  assert.deepEqual(scanBuffer('x.dat', BIT).map((x) => x.kind), ['Xilinx bitstream (by its header)']);
  // another binary file: the readable strings in it are scanned (a path with a user name here), the rest is not
  const png = Buffer.concat([Buffer.from('\x89PNG\r\n\x1a\n\0\0\0\rIHDR', 'latin1'), Buffer.from(`tEXtSource ${['', 'Users', 'alice', 'x.png'].join('/')}\0`), Buffer.alloc(32)]);
  assert.deepEqual(scanBuffer('img.png', png).map((x) => `${x.kind}: ${x.text}`), ['home folder with a user name: /Users/alice']);
  assert.deepEqual(scanBuffer('img.png', Buffer.concat([Buffer.from('\x89PNG\r\n\x1a\n', 'latin1'), Buffer.alloc(200, 7)])), []);
  // a text file as bytes: as scanText; a compressed one: what it holds, reported under the .gz name
  assert.deepEqual(scanBuffer('a.md', Buffer.from(`mail jane${at}${dot('mail', 'pt')}\n`)).map((x) => `${x.line}: ${x.kind}`), ['1: e-mail address']);
  const gz = zlib.gzipSync(Buffer.from(`line one\nssh pi${at}${dot(10, 1, 2, 3)}\n`));
  assert.deepEqual(scanBuffer('logs/a.txt.gz', gz).map((x) => `${x.file}:${x.line}: ${x.kind}: ${x.text}`), [`logs/a.txt.gz:2: IP address: ${dot(10, 1, 2, 3)}`, `logs/a.txt.gz:2: login (user${at}address): pi${at}${dot(10, 1, 2, 3)}`]);
  const banner = `Release 14.7 par P.20131013 (lin64)\nCopyright (c) 1995-2013 ${'Xilinx'}, Inc.  All rights reserved.\n`;
  assert.deepEqual(scanBuffer('build/top.par.gz', zlib.gzipSync(Buffer.from(banner))).map((x) => x.kind), ['file written by Xilinx ISE']);   // by the name it holds
  assert.deepEqual(scanBuffer('build/top.bit.gz', zlib.gzipSync(BIT)).map((x) => x.kind), ['Xilinx bitstream (by its header)']);
  assert.deepEqual(scanBuffer('a.gz', Buffer.from('not gzip at all\0\0')), []);   // not gzip: as bytes
});

test('a long line is scanned in chunks (#1441), each match once', () => {
  const home = ['', 'Users', 'alice', 'x'].join('/');
  const line = `${'x'.repeat(19990)}${home} ${'y'.repeat(30000)}${home} ${'z'.repeat(25000)} bob${at}${dot('mail', 'pt')}`;
  assert.ok(line.length > 60000);
  assert.deepEqual(kinds('data.json', `{"a": 1}\n${line}\n`), ['home folder with a user name: /Users/alice', `e-mail address: bob${at}mail.pt`]);
  assert.deepEqual(scanText('data.json', `{"a": 1}\n${line}\n`).map((x) => x.line), [2, 2]);
  assert.deepEqual(kinds('data.json', 'x'.repeat(70000)), []);
});

test('files that must not be in the repository: Xilinx outputs and licences, keys, environments', () => {
  for (const f of ['build/top.bit', 'build/top.ncd', 'x/main.ngc', 'Xilinx.lic', 'ssh/id_ed25519', 'cert.pem', '.env', 'config/.env.local', '.npmrc']) {
    assert.equal(scanText(f, '').length, 1, f);
  }
  for (const f of ['src/top.vhd', 'constraints/top.ucf', 'web/js/bitstream.js', 'environment.md']) assert.deepEqual(scanText(f, ''), [], f);
  // a text file written by ISE (its banner); hand-made files in ISE's format and the allowed fixtures are fine
  const banner = `Release 14.7 par P.20131013 (lin64)\nCopyright (c) 1995-2013 ${'Xilinx'}, Inc.  All rights reserved.\n`;
  assert.deepEqual(kinds('build/top.par', banner).map((k) => k.split(':')[0]), ['file written by Xilinx ISE']);
  assert.deepEqual(kinds('test/fixtures/ise/top.par', banner), []);
  assert.deepEqual(kinds('test/fixtures/fpga/d.xdlrc', `# XDL REPORT MODE\n# (a small hand-made device in the format of xdl -report)\n`), []);
});

test('the allow-list (#3345): the made-up local address of a refused link in link-hash\'s UI test, as design-link\'s, not elsewhere', () => {
  const line = `['open=https://${dot(192, 168, 1, 1)}/a.zip', 'refused']`;
  assert.deepEqual(kinds('test/ui/link-hash.test.js', line), []);
  assert.deepEqual(kinds('test/ui/design-link.test.js', line), []);
  assert.deepEqual(kinds('test/ui/other.test.js', line), [`IP address: ${dot(192, 168, 1, 1)}`]);
});

test('the allow-list (#3365): two made-up values in the history, in their files only', () => {
  assert.deepEqual(kinds('test/collab-host.test.js', `candidate ${dot(192, 168, 1, 20)} 54321`), []);
  assert.deepEqual(kinds('test/other.test.js', `candidate ${dot(192, 168, 1, 20)} 54321`), [`IP address: ${dot(192, 168, 1, 20)}`]);
  const url = `// e.g. https://user:token${at}${dot('github', 'com')}`;
  assert.deepEqual(kinds('server/git.js', url), []);
  assert.equal(kinds('server/other.js', url).length, 2);
});

test('GitHub\'s hosted runners\' accounts are no one\'s home folder (#3726): runneradmin, its short name RUNNER~1', () => {
  const msg = `git reports ${['C:', 'Users', 'runneradmin', 'AppData'].join('/')} for C:\\Users\\RUNNER~1\\AppData, ${['', 'Users', 'runneradmin', 'work'].join('/')} on macOS`;
  assert.deepEqual(kinds('(message of 00201b6)', msg), []);
  assert.deepEqual(kinds('test/git.test.js', msg), []);
  // a user name like them is still found
  const mac = ['', 'Users', 'runneradmin2'].join('/'), win = ['C:', 'Users', 'RUNNER~2'].join('\\');
  assert.deepEqual(kinds('a.md', `${mac} ${win}`), [`home folder with a user name: ${mac}`, `home folder with a user name: ${win}`]);
});

test('the allow-list (#3407): build-settings\' made-up remote folder and computer name, in that file only', () => {
  const line = `remoteDir: '${['', 'home', 'u', 'build'].join('/')}', host: '${dot('build-box', 'local')}'`;
  assert.deepEqual(kinds('test/build-settings.test.js', line), []);
  assert.equal(kinds('test/other.test.js', line).length, 2);
});

test('the allow-list (#498): XPower\'s section numbers in the history, read as addresses, and nowhere else', () => {
  const sections = `sections ${dot(3, 3, 1, 1)} and ${dot(3, 3, 1, 2)} of the report`;
  assert.deepEqual(kinds('scripts/measure-power.mjs', sections), []);
  assert.deepEqual(kinds('(message of fda526c)', sections), [`IP address: ${dot(3, 3, 1, 2)}`]);   // one number, two messages
  assert.deepEqual(kinds('(message of dc20cc0)', `see ${dot(3, 3, 1, 1)}`), []);
  assert.deepEqual(kinds('(message of 0000000)', `see ${dot(3, 3, 1, 1)}`), [`IP address: ${dot(3, 3, 1, 1)}`]);
  assert.deepEqual(kinds('scripts/measure.mjs', sections), [`IP address: ${dot(3, 3, 1, 1)}`, `IP address: ${dot(3, 3, 1, 2)}`]);
  assert.deepEqual(kinds('scripts/measure-power.mjs', `at ${dot(3, 3, 1, 3)}`), [`IP address: ${dot(3, 3, 1, 3)}`]);
  // #545's made-up path, in its history (#555); a real user name in that file is still found
  const home = (u) => `href: 'file://${['', 'Users', u, 'Downloads', 'Silinx.html'].join('/')}'`;
  assert.deepEqual(kinds('test/static-editions.test.js', home('x')), []);
  assert.deepEqual(kinds('test/static-editions.test.js', home('alice')), ['home folder with a user name: /Users/alice']);
  assert.deepEqual(kinds('test/other.test.js', home('x')), ['home folder with a user name: /Users/x']);
});

test('the history scan (#3366): the commits\' authors and committers, the binary files added or changed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-private-'));
  const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
  const git = (who, ...args) => execFileSync('git', ['-c', `user.name=${who[0]}`, '-c', `user.email=${who[1]}`, '-c', 'commit.gpgsign=false', ...args], { cwd: dir, encoding: 'utf8', env });
  const t = ['T', `t${at}${dot('example', 'com')}`];
  const commit = (who, file, data, msg) => { fs.writeFileSync(path.join(dir, file), data); git(who, 'add', file); git(who, 'commit', '-q', '-m', msg); return git(who, 'rev-parse', 'HEAD').trim().slice(0, 7); };
  const report = () => scanHistory(dir).map((x) => `${x.commit} ${x.file}${x.line ? `:${x.line}` : ''}: ${x.kind}: ${x.text}`);
  try {
    git(t, 'init', '-q', '-b', 'main');
    commit(t, 'a.md', 'nothing private\n', 'first');
    // the bots' and GitHub's addresses are no one's
    commit(['dependabot[bot]', `49699333+dependabot[bot]${at}${dot('users', 'noreply', 'github', 'com')}`], 'b.md', 'b\n', 'bump');
    commit(['GitHub', `noreply${at}${dot('github', 'com')}`], 'c.md', 'c\n', 'web');
    commit(['Claude', `noreply${at}${dot('anthropic', 'com')}`], 'd.md', 'd\n', 'co');
    assert.deepEqual(report(), []);   // no warnings
    // a person's address, in the author and the committer fields; a computer's name in a committer's
    const ana = commit(['Ana', `ana${at}${dot('mail', 'pt')}`], 'e.md', 'e\n', 'by Ana');
    const host = ['', 'Mac-mini-de-Ana', 'local'].join('.').slice(1);
    const runner = commit(['runner', `ana${at}${host}`], 'f.md', 'f\n', 'on a runner');
    // a binary file (a NUL byte) and a compressed one hold what a text would show; deleted since, they are in the history only
    const bin = commit(t, 'g.bin', Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from(`file://${['', 'Users', 'carol', 'x.v'].join('/')}\0`)]), 'a binary file');
    const gz = commit(t, 'h.json.gz', zlib.gzipSync(`{"by": "bob${at}${dot('mail', 'pt')}"}`), 'a compressed file');
    git(t, 'rm', '-q', 'g.bin', 'h.json.gz'); git(t, 'commit', '-q', '-m', 'gone');
    assert.deepEqual(report(), [
      `${runner} (author of ${runner}):1: e-mail address: ana${at}${host}`,
      `${runner} (author of ${runner}):1: computer name: ${host}`,
      `${runner} (committer of ${runner}):1: e-mail address: ana${at}${host}`,
      `${runner} (committer of ${runner}):1: computer name: ${host}`,
      `${ana} (author of ${ana}):1: e-mail address: ana${at}mail.pt`,
      `${ana} (committer of ${ana}):1: e-mail address: ana${at}mail.pt`,
      `${gz} h.json.gz:1: e-mail address: bob${at}mail.pt`,
      `${bin} g.bin:1: home folder with a user name: /Users/carol`,
    ]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the allow-list (#3366): the maintainer\'s public addresses by their hash, the two runner commits, GitHub\'s address', () => {
  const someone = `Ana <ana${at}${dot('mail', 'pt')}>`;
  assert.deepEqual(kinds('(author of 0000000)', someone), [`e-mail address: ana${at}mail.pt`]);
  assert.deepEqual(kinds('(committer of 0000000)', `GitHub <noreply${at}${dot('github', 'com')}>`), []);
  // the runner's two commits, by their committer only
  const runner = `u <u${at}${['', 'Mac-mini-de-U', 'local'].join('.').slice(1)}>`;
  assert.deepEqual(kinds('(committer of 4525058)', runner), []);
  assert.deepEqual(kinds('(committer of 7e935ac)', runner), []);
  assert.equal(kinds('(author of 4525058)', runner).length, 2);
  assert.equal(kinds('(committer of 0000000)', runner).length, 2);
  assert.equal(publicAddress(`ana${at}${dot('mail', 'pt')}`), false);
});

test('the history scan (#555): the history of HEAD (main), not the other branches', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-private-'));
  const git = (...args) => execFileSync('git', ['-c', 'user.name=T', `-c`, `user.email=t${at}${dot('example', 'com')}`, '-c', 'commit.gpgsign=false', ...args], { cwd: dir, encoding: 'utf8' });
  const commit = (file, text, msg) => { fs.writeFileSync(path.join(dir, file), text); git('add', file); git('commit', '-q', '-m', msg); return git('rev-parse', 'HEAD').trim().slice(0, 7); };
  const report = (rev) => scanHistory(dir, ...(rev ? [rev] : [])).map((x) => `${x.commit} ${x.file}${x.line ? `:${x.line}` : ''}: ${x.kind}: ${x.text}`);
  try {
    git('init', '-q', '-b', 'main');
    commit('a.md', 'nothing private\n', 'first');
    assert.deepEqual(report(), []);   // no warnings
    git('checkout', '-q', '-b', 'feature');
    const onBranch = commit('b.js', `const p = '${['', 'Users', 'alice', 'x.v'].join('/')}';\n`, 'on a branch');
    git('checkout', '-q', 'main');
    assert.deepEqual(report(), []);   // an open branch's commit is not main's
    assert.deepEqual(report('feature'), [`${onBranch} b.js:1: home folder with a user name: /Users/alice`]);   // its own scan finds it
    const onMain = commit('c.md', `ask bob${at}${dot('mail', 'pt')}\n`, `from ${['', 'home', 'carol'].join('/')}`);
    assert.deepEqual(report(), [
      `${onMain} (message of ${onMain}):1: home folder with a user name: /home/carol`,
      `${onMain} c.md:1: e-mail address: bob${at}mail.pt`,
    ]);
    // the branch's pull request merged (rebased, fast-forward): now main's history
    git('checkout', '-q', 'feature'); git('rebase', '-q', 'main'); git('checkout', '-q', 'main'); git('merge', '-q', '--ff-only', 'feature');
    const merged = git('rev-parse', 'HEAD').trim().slice(0, 7);
    assert.deepEqual(report(), [
      `${merged} b.js:1: home folder with a user name: /Users/alice`,
      `${onMain} (message of ${onMain}):1: home folder with a user name: /home/carol`,
      `${onMain} c.md:1: e-mail address: bob${at}mail.pt`,
    ]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the allow-list (#3494): #3415\'s commit message names a made-up local address, in that message only', () => {
  const msg = `so localhost.. and ${dot(192, 168, 1, 1)}.. passed`;
  assert.deepEqual(kinds('(message of 9973e11)', msg), []);
  assert.deepEqual(kinds('(message of 0000000)', msg), [`IP address: ${dot(192, 168, 1, 1)}`]);
});

// #3520: what the checks missed, each on made-up values
test('names and logins (#3520): a tailnet\'s name, a bare .local name in quotes or as a value, a login on a computer with no domain', () => {
  const ts = dot('mini', 'tail0000', 'ts', 'net');
  assert.deepEqual(kinds('a.md', `ssh to ${ts} (MagicDNS)`), [`computer name: ${ts}`]);
  const box = dot('labbox', 'local');
  for (const line of [`host: "${box}"`, `const h = '${box}';`, `HOST=${box}`, `{"host":"${box}"}`, `  host: ${box}`])
    assert.deepEqual(kinds('a.yml', line), [`computer name: ${box}`], line);
  assert.deepEqual(kinds('a.js', 'const local = p.local; x.local = 1; if (a.internal) f(this.local);'), []);   // code, as before
  const login = ['ana', 'labbox'].join(at);
  for (const line of [`ssh ${login}`, `scp -P 22 f ${login}:x`, `rsync -a d/ ${login}:d/`, `ssh://${login}/x`, `  host: ${login}`])
    assert.deepEqual(kinds('a.sh', line), [`login (user${at}name): ${login}`], line);
  // a package's or an action's version, a test's name, an e-mail field of a test, git's own address: not logins
  for (const line of [`npm i playwright${at}latest`, `uses: actions/checkout${at}v4`, `tb${at}synth`, `user.email=t${at}t`, `ssh ${['user', 'host'].join(at)}`, `ssh://git${at}github\\.com`])
    assert.deepEqual(kinds('a.sh', line), [], line);
});

test('contents (#3520): UTF-16 text decoded; a zip\'s, a tar\'s and a tgz\'s files scanned; another archive refused unless allowed', () => {
  const secret = `write to jane${at}${dot('mail', 'pt')}`;
  const found = [`e-mail address: jane${at}mail.pt`];
  const k = (file, buf) => scanBuffer(file, buf).map((x) => `${x.file} ${x.kind}: ${x.text}`);
  // UTF-16, with and without its byte order mark, both byte orders
  const le = Buffer.from(secret, 'utf16le');
  for (const [name, buf] of [['bom-le.txt', Buffer.concat([Buffer.from([0xff, 0xfe]), le])], ['le.txt', le], ['be.txt', Buffer.from(le).swap16()],
    ['bom-be.txt', Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(le).swap16()])]])
    assert.deepEqual(k(name, buf), [`${name} ${found[0]}`], name);
  // a zip (stored and deflated), a tar, a tgz: each file under archive:name
  const zip = (entries) => {
    const parts = [], dir = [];
    let at = 0;
    for (const [name, data, deflate] of entries) {
      const body = deflate ? zlib.deflateRawSync(data) : data, n = Buffer.from(name);
      const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(deflate ? 8 : 0, 8); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(n.length, 26);
      const cen = Buffer.alloc(46); cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(deflate ? 8 : 0, 10); cen.writeUInt32LE(body.length, 20); cen.writeUInt32LE(data.length, 24); cen.writeUInt16LE(n.length, 28); cen.writeUInt32LE(at, 42);
      parts.push(local, n, body); dir.push(cen, n); at += 30 + n.length + body.length;
    }
    const cd = Buffer.concat(dir), end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(at, 16);
    return Buffer.concat([...parts, cd, end]);
  };
  const z = zip([['a/clean.txt', Buffer.from('nothing\n'), false], ['a/notes.md', Buffer.from(secret), true], ['b.txt', Buffer.from(secret), false]]);
  assert.deepEqual(k('x.zip', z), [`x.zip:a/notes.md ${found[0]}`, `x.zip:b.txt ${found[0]}`]);
  assert.deepEqual(k('x.docx', z).length, 2);
  const tar = (entries) => Buffer.concat([...entries.flatMap(([name, data]) => {
    const h = Buffer.alloc(512); h.write(name, 0); h.write(data.length.toString(8).padStart(11, '0'), 124); h.write('0', 156); h.write('ustar', 257);
    return [h, data, Buffer.alloc((512 - (data.length % 512)) % 512)];
  }), Buffer.alloc(1024)]);
  const t = tar([['clean.txt', Buffer.from('nothing\n')], ['src/notes.md', Buffer.from(secret)]]);
  assert.deepEqual(k('x.tar', t), [`x.tar:src/notes.md ${found[0]}`]);
  assert.deepEqual(k('x.tgz', zlib.gzipSync(t)), [`x.tgz:src/notes.md ${found[0]}`]);
  assert.deepEqual(k('x.tar.gz', zlib.gzipSync(t)), [`x.tar.gz:src/notes.md ${found[0]}`]);
  assert.deepEqual(k('clean.zip', zip([['a.txt', Buffer.from('nothing\n'), true]])), []);   // no warnings
  // another kind of archive, or one that cannot be read: refused
  assert.deepEqual(k('x.7z', Buffer.from('7z\xbc\xaf\x27\x1c', 'latin1')), ['x.7z archive not read: x.7z']);
  assert.deepEqual(k('bad.zip', Buffer.from('PK not a zip')), ['bad.zip archive not read: bad.zip']);
});

test('contents (#3682): a .tgz with no tar inside scanned as its gzip\'s content; a .tar with no header refused; a real tarball as before', () => {
  const secret = `write to jane${at}${dot('mail', 'pt')}`;
  const found = `e-mail address: jane${at}mail.pt`;
  const k = (file, buf) => scanBuffer(file, buf).map((x) => `${x.file} ${x.kind}: ${x.text}`);
  // a plain gzip named .tgz: found, as the same bytes named .gz are
  assert.deepEqual(k('b.gz', zlib.gzipSync(secret)), [`b.gz ${found}`]);
  assert.deepEqual(k('b.tgz', zlib.gzipSync(secret)), [`b.tgz ${found}`]);
  assert.deepEqual(k('b.tgz', zlib.gzipSync(secret + '\n'.repeat(600))), [`b.tgz ${found}`]);   // (longer than a tar's block)
  assert.deepEqual(k('clean.tgz', zlib.gzipSync('nothing\n')), []);   // no warnings
  // a .tgz that is no gzip: its bytes
  assert.deepEqual(k('raw.tgz', Buffer.from(secret)), [`raw.tgz ${found}`]);
  // a .tar that is none: refused, not passed as empty
  assert.deepEqual(k('x.tar', Buffer.from(secret)), ['x.tar archive not read: x.tar']);
  // a real tarball, and an empty one (its end's blocks only)
  const h = Buffer.alloc(512); h.write('src/notes.md', 0); h.write(Buffer.byteLength(secret).toString(8).padStart(11, '0'), 124); h.write('0', 156); h.write('ustar', 257);
  const t = Buffer.concat([h, Buffer.from(secret), Buffer.alloc(512 - Buffer.byteLength(secret)), Buffer.alloc(1024)]);
  assert.deepEqual(k('x.tgz', zlib.gzipSync(t)), [`x.tgz:src/notes.md ${found}`]);
  assert.deepEqual(k('empty.tgz', zlib.gzipSync(Buffer.alloc(1024))), []);
  assert.deepEqual(k('empty.tar', Buffer.alloc(1024)), []);
});

test('the scanner and its test are scanned too (#3520): their own examples allowed, nothing else', () => {
  assert.deepEqual(SELF, ['scripts/check-private-data.mjs', 'test/private-data.test.js']);
  const mail = `write to jane${at}${dot('mail', 'pt')}`;
  for (const f of SELF) {
    assert.deepEqual(kinds(f, mail), [`e-mail address: jane${at}mail.pt`], f);
    assert.deepEqual(scanText(f, fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8')), [], f);
  }
});

// (" and a backslash are no characters of a Windows file's name: the case on the other systems, #3616)
test('the history scan (#3520): a file whose path git quotes is read under its own name', { skip: process.platform === 'win32' && 'a name with " and \\ cannot be made on Windows' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-private-'));
  const git = (...args) => execFileSync('git', ['-c', 'user.name=T', `-c`, `user.email=t${at}${dot('example', 'com')}`, '-c', 'commit.gpgsign=false', ...args], { cwd: dir, encoding: 'utf8' });
  const report = () => scanHistory(dir).map((x) => `${x.file}${x.line ? `:${x.line}` : ''}: ${x.kind}: ${x.text}`);
  try {
    git('init', '-q', '-b', 'main');
    // the file before it in the commit is one the allow-list allows: its lines were filed under it, and allowed
    const allowedFile = 'test/server-api.test.js', quoted = 'docs/a"b\\c.md';
    fs.mkdirSync(path.join(dir, 'test')); fs.mkdirSync(path.join(dir, 'docs'));
    fs.writeFileSync(path.join(dir, allowedFile), 'x\n');
    fs.writeFileSync(path.join(dir, ...quoted.split('/')), `ssh to ${dot('fpga-lab', 'local')}\n`);
    fs.writeFileSync(path.join(dir, 'docs', 'bin"x.dat'), Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from(` mail jane${at}${dot('mail', 'pt')} `)]));
    git('add', '.'); git('commit', '-q', '-m', 'files');
    assert.deepEqual(report(), [
      `${quoted}:1: computer name: ${dot('fpga-lab', 'local')}`,
      `docs/bin"x.dat:1: e-mail address: jane${at}mail.pt`,
    ]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
