// web/js/wizards.js split (#405): the New Source wizard in web/js/new-source.js. It lives there only, wizards.js
// still exports every name it exported before (its importers in web/ are unchanged), and what new-source.js takes
// from wizards.js is exported there (read as text: the modules need a page).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = f => fs.readFileSync(new URL(`../web/js/${f}`, import.meta.url), 'utf8');
const wiz = read('wizards.js'), ns = read('new-source.js');
const exportsOf = code => new Set([
  ...[...code.matchAll(/^export (?:async )?(?:function|const|let) (\w+)/gm)].map(m => m[1]),
  ...[...code.matchAll(/^export \{([^}]*)\} from /gm)].flatMap(m => m[1].split(',').map(s => s.trim()).filter(Boolean)),
]);

// wizards.js's exports before the split (but importXiseDialog and importSilinxDialog, one Import Project (.zip)… since
// #3703: web/js/project-zip-dialogs.js)
const BEFORE = ['field', 'select', 'wizard', 'newProjectWizard', 'createTopSource', 'openProjectDialog', 'zipFolderSelection',
  'replaceGuard', 'closeBeforeReplace', 'moduleElsewhere', 'drawnHdlTaken',
  'newSourceWizard', 'addSourceDialog', 'sourceProperties', 'projectProperties', 'implProperties', 'toolchainDialog',
  'aboutDialog', 'GOATCOUNTER_URL', 'WHO_URL', 'whoAreYou', 'updateCheckEnabled', 'setUpdateCheckEnabled',
  'checkUpdatesOnStart', 'checkUpdatesDialog', 'shortcutsDialog'];

test('#405 new-source.js: wizards.js still exports every name it exported before', () => {
  const ex = exportsOf(wiz);
  assert.deepEqual(BEFORE.filter(n => !ex.has(n)), []);
  assert.match(wiz, /^export \{ newSourceWizard \} from '\.\/new-source\.js';$/m);
});

test('#405 new-source.js: the New Source wizard is defined there only', () => {
  const def = name => new RegExp(`^(?:export )?(?:async )?function ${name}\\(`, 'm');
  assert.ok(def('newSourceWizard').test(ns), 'newSourceWizard in new-source.js');
  assert.ok(!def('newSourceWizard').test(wiz), 'newSourceWizard not in wizards.js');
  // (its unit under test moved on to core/uut-info.js, #2674: the server makes a test bench too)
  assert.ok(!def('uutInfo').test(ns) && !def('uutInfo').test(wiz), 'uutInfo in neither');
  assert.match(ns, /^import \{ uutInfo \} from '\/core\/uut-info\.js';$/m);
  assert.match(ns, /^const SOURCE_TYPES = \[/m);
  assert.doesNotMatch(wiz, /SOURCE_TYPES/);
});

test('#405 new-source.js: what it imports from wizards.js is exported there, and read only inside functions', () => {
  const m = /^import \{([^}]*)\} from '\.\/wizards\.js';$/m.exec(ns);
  assert.ok(m, 'imports from wizards.js');
  const names = m[1].split(',').map(s => s.trim()).filter(Boolean);
  const ex = exportsOf(wiz);
  assert.deepEqual(names.filter(n => !ex.has(n)), []);
  // (the two modules import each other: no name of wizards.js is read at new-source.js's load time)
  const top = ns.split('\n').filter(l => /^\S/.test(l) && !/^(import|export (async )?function|\/\/|\}|\])/.test(l));
  for (const n of names) assert.ok(!top.some(l => new RegExp(`\\b${n}\\b`).test(l)), `${n} read at load time`);
});
