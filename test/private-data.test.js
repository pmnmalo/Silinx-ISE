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
import { scanRepo, scanHistory, scanText, scanBuffer, isXilinxBitstream, SELF } from '../scripts/check-private-data.mjs';

const kinds = (file, text) => scanText(file, text).map((x) => `${x.kind}: ${x.text}`);
const at = '@', dot = (...p) => p.join('.');

test('the tracked files hold no private data, secrets or Xilinx files', () => {
  const found = scanRepo();
  // (the scanner and this file are left out: they hold examples of what is looked for)
  assert.deepEqual(SELF, ['scripts/check-private-data.mjs', 'test/private-data.test.js']);   // and nothing else
  assert.deepEqual(found.map((x) => `${x.file}${x.line ? `:${x.line}` : ''}: ${x.kind}: ${x.text}`), [],
    'remove these (or, for a harmless match, add it with its reason to ALLOW in scripts/check-private-data.mjs)');
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

test('the allow-list (#498): XPower\'s section numbers in the history, read as addresses, and nowhere else', () => {
  const sections = `sections ${dot(3, 3, 1, 1)} and ${dot(3, 3, 1, 2)} of the report`;
  assert.deepEqual(kinds('scripts/measure-power.mjs', sections), []);
  assert.deepEqual(kinds('(message of fda526c)', sections), [`IP address: ${dot(3, 3, 1, 2)}`]);   // one number, two messages
  assert.deepEqual(kinds('(message of dc20cc0)', `see ${dot(3, 3, 1, 1)}`), []);
  assert.deepEqual(kinds('(message of 0000000)', `see ${dot(3, 3, 1, 1)}`), [`IP address: ${dot(3, 3, 1, 1)}`]);
  assert.deepEqual(kinds('scripts/measure.mjs', sections), [`IP address: ${dot(3, 3, 1, 1)}`, `IP address: ${dot(3, 3, 1, 2)}`]);
  assert.deepEqual(kinds('scripts/measure-power.mjs', `at ${dot(3, 3, 1, 3)}`), [`IP address: ${dot(3, 3, 1, 3)}`]);
  // #545's made-up path, in its history (#555); a real user name in that file is still found
  const home = (u) => `href: 'file://${['', 'Users', u, 'Downloads', 'Silinx-ISE.html'].join('/')}'`;
  assert.deepEqual(kinds('test/static-editions.test.js', home('x')), []);
  assert.deepEqual(kinds('test/static-editions.test.js', home('alice')), ['home folder with a user name: /Users/alice']);
  assert.deepEqual(kinds('test/other.test.js', home('x')), ['home folder with a user name: /Users/x']);
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
