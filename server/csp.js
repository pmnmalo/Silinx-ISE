// The Content-Security-Policy of the Silinx pages, one policy for every edition (#487): the local
// server sends it as a header (server/server.js pageCsp), the static editions carry it in a <meta>
// (scripts/build-standalone.mjs: the single file and the GitHub Pages site; scripts/site-analytics.mjs
// adds the usage counter's script to it). Scripts only from the page's origin, the assets' site and the
// page's own inline scripts by their hashes: a script injected into a page cannot run.
import crypto from 'node:crypto';

// an inline <script> (no src): its text, as the browser hashes it
const INLINE = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
/** The CSP hash source of a script's text ('sha256-…'). */
export const scriptHash = text => `'sha256-${crypto.createHash('sha256').update(text).digest('base64')}'`;
/** The hash sources of every inline script of a page. */
export const inlineScriptHashes = html => [...html.matchAll(INLINE)].map(m => scriptHash(m[1]));

/**
 * The policy: `hashes` (the inline scripts), `scripts` (other origins scripts load from: the assets'
 * site of a single file), `connect` (other origins fetched), `meta` (in a <meta> element: without the
 * directives a <meta> cannot carry, which the browser reports as errors: frame-ancestors).
 */
export function contentSecurityPolicy({ hashes = [], scripts = [], connect = [], meta = false } = {}) {
  return [
    "default-src 'self'",
    // 'unsafe-eval': the compiled simulator (core/compiled-sim.js, #384) runs the JavaScript it writes
    // for the design (new Function); 'wasm-unsafe-eval': Yosys in WebAssembly; a script injected into a
    // page still cannot run
    ["script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'", ...scripts, ...hashes].join(' '),
    // the Silinx toolchain, Yosys and the board emulator run in workers started from Blobs
    "worker-src 'self' blob:",
    // the update check (GitHub's releases and the CHANGELOG), the iCE40's nextpnr from npm's registry (#2444), the assets of a single file
    ["connect-src 'self' https://api.github.com https://raw.githubusercontent.com https://registry.npmjs.org", ...connect].join(' '),
    "img-src 'self' data: blob:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'none'",
    ...(meta ? [] : ["frame-ancestors 'none'"]),
    "form-action 'self'",
  ].join('; ');
}

const META = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/;
/** The policy of a page's <meta> (null: none). */
export const metaCsp = html => html.match(META)?.[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&') ?? null;
/** The page with its <meta> policy (put first in <head>, before any script: a policy applies to what follows it). */
export function withMetaCsp(html, csp) {
  const tag = `<meta http-equiv="Content-Security-Policy" content="${csp.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">`;
  if (META.test(html)) return html.replace(META, () => tag);
  const at = html.indexOf('<meta charset="utf-8">');
  if (at < 0) throw new Error('no <meta charset="utf-8"> in the page');
  const end = at + '<meta charset="utf-8">'.length;
  return `${html.slice(0, end)}\n${tag}${html.slice(end)}`;
}
/** A directive's sources added to a policy ("script-src", ["'sha256-…'", "https://…"]). */
export function addSources(csp, directive, sources) {
  return csp.split('; ').map(d => (d.split(' ')[0] === directive ? [d, ...sources.filter(s => !d.split(' ').includes(s))].join(' ') : d)).join('; ');
}
