// web/js/release-url.js (#1444): the update check links only to GitHub's own origins; a URL of GitHub's release
// object (api.github.com, kept in localStorage) that is anything else is not made into an anchor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { safeReleaseUrl } from '../web/js/release-url.js';

test('#1444 safeReleaseUrl: https URLs of github.com, api.github.com and objects.githubusercontent.com, as given', () => {
  for (const u of ['https://github.com/pmnmalo/Silinx/releases/tag/v15.16.0',
    'https://github.com/pmnmalo/Silinx/releases/download/v15.16.0/silinx-15.16.0.zip',
    'https://api.github.com/repos/pmnmalo/Silinx/releases/assets/1',
    'https://objects.githubusercontent.com/github-production-release-asset-2e65be/1/2?X-Amz-Algorithm=x',
    'https://github.com:443/x', ' https://github.com/x']) assert.equal(safeReleaseUrl(u), u, u);   // (a browser trims the space too)
});

test('#1444 safeReleaseUrl: javascript:, data:, http:, other hosts, look-alikes and non-strings are refused', () => {
  for (const u of ['javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'http://github.com/x',
    'https://github.com.evil.test/x', 'https://evil.test/https://github.com/x', 'https://github.com@evil.test/x', 'https://evil.test#https://github.com',
    'https://raw.githubusercontent.com/x', 'ftp://github.com/x', '//github.com/x', '/releases', 'releases', '',
    null, undefined, 42, { href: 'https://github.com/x' }]) assert.equal(safeReleaseUrl(u), null, String(u));
});

test('#1444 wizards.js: every anchor made from the release object goes through safeReleaseUrl', () => {
  const src = fs.readFileSync(new URL('../web/js/wizards.js', import.meta.url), 'utf8');
  assert.match(src, /^import \{ safeReleaseUrl \} from '\.\/release-url\.js';$/m);
  assert.match(src, /^const releaseLink = \(href, text\) => \(safeReleaseUrl\(href\) \? link\(href, text\) : h\('span', \{\}, text\)\);$/m);
  // the release's page and its assets' downloads: never through link() directly
  assert.deepEqual(src.match(/\blink\((?:rel|a)\.\w+/g), null);
  assert.equal(src.match(/releaseLink\((?:rel\.html_url|a\.browser_download_url)/g)?.length, 3);
});
