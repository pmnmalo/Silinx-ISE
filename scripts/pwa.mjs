// The site's edition installable as an app (#1051), for scripts/build-standalone.mjs --site: beside its
// index.html the web app manifest (manifest.webmanifest), its icons (web/icons, drawn by
// scripts/pwa-icons.mjs) and the service worker (sw.js: web/js/sw.js bundled, the build's label in it);
// the page links the manifest (web/js/pwa.js registers the worker it finds beside it). Only the site's
// index.html: the downloaded Silinx-ISE.html has none of it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHELL } from '../web/js/sw-policy.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const THEME = '#a5121a';
export const ICONS = [
  { src: 'icons/silinx-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: 'icons/silinx-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: 'icons/silinx-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
];

/** The manifest of an edition (dev: the development edition, an app of its own beside the stable one). Its
 *  URLs are relative to its own: the edition's folder, its start and its scope. */
export function webManifest({ dev = false } = {}) {
  return {
    id: './',
    name: dev ? 'Silinx (development)' : 'Silinx',
    short_name: dev ? 'Silinx dev' : 'Silinx',
    description: 'An ISE-like FPGA IDE for teaching digital systems: design, simulate and implement for Spartan-3E boards, in the browser.',
    lang: 'en',
    start_url: './',
    scope: './',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: THEME,
    icons: ICONS,
  };
}

/** The page with its manifest (and the colour of its window's title bar) linked, at the end of <head>. */
export function withManifestLink(html) {
  if (html.includes('<link rel="manifest"')) return html;
  const i = html.indexOf('</head>');
  if (i < 0) throw new Error('no </head> in the page');
  return `${html.slice(0, i)}<link rel="manifest" href="manifest.webmanifest">\n<meta name="theme-color" content="${THEME}">\n${html.slice(i)}`;
}

/** Into the site's folder: the manifest, the icons and the worker (bundled with esbuild, label: the build's). */
export async function writePwa(site, { esbuild, label, dev }) {
  fs.writeFileSync(path.join(site, 'manifest.webmanifest'), `${JSON.stringify(webManifest({ dev }), null, 2)}\n`);
  fs.mkdirSync(path.join(site, 'icons'), { recursive: true });
  for (const { src } of ICONS) fs.copyFileSync(path.join(ROOT, 'web', src), path.join(site, src));
  const missing = SHELL.filter(f => !fs.existsSync(path.join(site, f)));
  if (missing.length) throw new Error(`the service worker keeps files the site does not have: ${missing.join(', ')}`);
  const res = await esbuild.build({
    entryPoints: [path.join(ROOT, 'web/js/sw.js')], bundle: true, format: 'iife', minify: true, write: false, target: 'es2022',
    logLevel: 'warning', platform: 'browser', define: { SILINX_SW_BUILD: JSON.stringify(label) },
  });
  fs.writeFileSync(path.join(site, 'sw.js'), res.outputFiles[0].text);
}
