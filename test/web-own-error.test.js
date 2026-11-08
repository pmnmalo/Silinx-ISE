// web/js/own-error.js (#997): whether an unhandled rejection comes from Silinx's own code (said in the
// Console) or from another script of the page (an extension's, a host's: left to the browser's console).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isOwnFailure, isOwnUrl, stackFrames } from '../web/js/own-error.js';

const SERVER = { href: 'http://localhost:8080/', origin: 'http://localhost:8080' };
const SITE = { href: 'https://example.github.io/Silinx/dev/?p=1#x', origin: 'https://example.github.io' };
const FILE = { href: 'file:///Users/me/Downloads/Silinx.html', origin: 'null' };
const withStack = (msg, stack, E = Error) => { const e = new E(msg); e.stack = stack; return e; };

test('a Silinx stack: Chrome, Firefox and Safari frames on the page\'s origin', () => {
  const chrome = withStack('boom', 'Error: boom\n    at openProjectNow (http://localhost:8080/js/project.js:52:11)\n    at async http://localhost:8080/js/app.js:941:5');
  const firefox = withStack('boom', 'openProjectNow@http://localhost:8080/js/project.js:52:11\n@http://localhost:8080/js/app.js:941:5\n');
  const safari = withStack('boom', 'openProjectNow@http://localhost:8080/js/project.js:52:11\nmodule code@http://localhost:8080/js/app.js:941:5');
  for (const e of [chrome, firefox, safari]) assert.equal(isOwnFailure(e, SERVER), true);
  assert.deepEqual(stackFrames(chrome).urls, ['http://localhost:8080/js/project.js', 'http://localhost:8080/js/app.js']);
  // a foreign frame on top (a wrapped fetch) and Silinx's below: Silinx's
  assert.equal(isOwnFailure(withStack('x', 'Error: x\n    at chrome-extension://abc/inject.js:1:2\n    at http://localhost:8080/js/api.js:10:3'), SERVER), true);
});

test('the published site, the standalone single file (file://) and the workers\' blobs', () => {
  assert.equal(isOwnFailure(withStack('b', 'Error: b\n    at https://example.github.io/Silinx/dev/:3:100'), SITE), true);
  assert.equal(isOwnFailure(withStack('b', 'f@file:///Users/me/Downloads/Silinx.html:12:3400'), FILE), true);
  assert.equal(isOwnFailure(withStack('b', 'Error: b\n    at blob:null/1f2e-33:1:20'), FILE), true);
  assert.equal(isOwnUrl('blob:http://localhost:8080/9a8b', SERVER), true);
  assert.equal(isOwnUrl('blob:https://evil.example/9a8b', SERVER), false);
  // another origin, another folder of file://
  assert.equal(isOwnUrl('https://localhost:8080.evil.example/x.js', SERVER), false);
  assert.equal(isOwnUrl('file:///Users/me/other/x.js', FILE), false);
  assert.equal(isOwnUrl('file:///Users/me/Downloads/x.js', FILE), true);
});

test('an extension\'s or an injected script\'s stack is foreign', () => {
  const sse = 'func sseError not found';
  assert.equal(isOwnFailure(withStack(sse, `Error: ${sse}\n    at Object.call (chrome-extension://abcdefgh/content.js:1:2049)\n    at EventSource.<anonymous> (chrome-extension://abcdefgh/content.js:1:880)`), SERVER), false);
  assert.equal(isOwnFailure(withStack(sse, 'call@moz-extension://1234-5678/content.js:1:2049\n'), SERVER), false);
  assert.equal(isOwnFailure(withStack(sse, 'call@safari-web-extension://ABCD/content.js:1:2049\nglobal code'), SERVER), false);
  assert.equal(isOwnFailure(withStack(sse, 'call@webkit-masked-url://hidden/:1:2049'), SERVER), false);
  // a script with no URL (injected by the host: evaluated code), a data: URL, another site's script
  assert.equal(isOwnFailure(withStack(sse, `Error: ${sse}\n    at <anonymous>:1:30`), SERVER), false);
  assert.equal(isOwnFailure(withStack(sse, '@debugger eval code:1:30'), SERVER), false);
  assert.equal(isOwnFailure(withStack(sse, 'Error: x\n    at data:text/javascript,Promise.reject(1):1:9'), SERVER), false);
  assert.equal(isOwnFailure(withStack(sse, 'Error: x\n    at https://cdn.example.com/sdk.js:1:9'), SERVER), false);
  // a URL in the message is not a frame
  assert.equal(isOwnFailure(withStack('cannot load http://localhost:8080/x', 'Error: cannot load http://localhost:8080/x\n    at <anonymous>:1:1'), SERVER), false);
});

test('a reason with no stack: an Error the browser made is reported; a non-Error reason is not', () => {
  assert.equal(isOwnFailure(withStack('Failed to fetch', '', TypeError), SERVER), true);
  assert.equal(isOwnFailure(withStack('Failed to fetch', 'TypeError: Failed to fetch', TypeError), SERVER), true);
  const noStack = new Error('x'); delete noStack.stack; Object.defineProperty(noStack, 'stack', { value: undefined });
  assert.equal(isOwnFailure(noStack, SERVER), true);
  // (IndexedDB's errors: a DOMException with no frames)
  const dom = new DOMException('The transaction was aborted', 'AbortError');
  Object.defineProperty(dom, 'stack', { value: 'AbortError: The transaction was aborted' });
  assert.equal(isOwnFailure(dom, SERVER), true);
  for (const r of ['func sseError not found', undefined, null, 42, { message: 'x' }, { message: 'x', stack: 'at http://localhost:8080/js/app.js:1:1' }]) {
    assert.equal(isOwnFailure(r, SERVER), false, String(r));
  }
});

test('a real Error made here: its frames are this file\'s (file://), the page\'s folder decides', () => {
  const e = new Error('here');
  const here = new URL('.', import.meta.url).href;
  assert.equal(isOwnFailure(e, { href: `${here}page.html`, origin: 'null' }), true);
  assert.equal(isOwnFailure(e, SERVER), false);
});
