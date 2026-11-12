// core/qr.js (#3637): the QR codes of the sharing dialogs' links, decoded back by an independent decoder (jsQR, used
// only here) at every size a link takes, up to the most a QR code holds; a text too long has none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QR_MAX_BYTES, qrBytes, qrCode, qrFits, qrSvg } from '../core/qr.js';
import { decodeModules, decodeSvg, svgModules } from './qr-helpers.js';

const decode = (q, scale) => decodeModules(q.modules, scale);
const linkOf = n => { const base = 'https://silinx.example/#design='; let s = base; for (let i = 0; s.length < n; i++) s += 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'[(i * 37 + 11) % 64]; return s.slice(0, n); };

test('a link decodes back to itself, at every version from 1 to 40', () => {
  const seen = new Set();
  for (const n of [1, 10, 17, 32, 60, 100, 140, 200, 300, 400, 500, 700, 900, 1200, 1500, 1800, 2100, 2400, 2700, 2900, QR_MAX_BYTES]) {
    const text = n < 30 ? 'https://x.example/'.slice(0, n) : linkOf(n);
    const q = qrCode(text);
    assert.ok(q, `${n} bytes`);
    assert.equal(q.size, q.version * 4 + 17);
    assert.equal(q.modules.length, q.size);
    const r = decode(q, q.version > 25 ? 3 : 4);
    assert.ok(r, `decoded: ${n} bytes, version ${q.version}-${q.level}`);
    assert.equal(r.data, text, `${n} bytes, version ${q.version}-${q.level}`);
    assert.equal(r.version, q.version);
    seen.add(q.version);
  }
  assert.ok(seen.has(1) && seen.has(40), [...seen].join(','));
});

test('the smallest version that holds the text, then the highest correction that fits it', () => {
  // version 1 holds 17 bytes at L, 14 at M, 11 at Q, 7 at H
  assert.deepEqual([qrCode('x'.repeat(7)).version, qrCode('x'.repeat(7)).level], [1, 'H']);
  assert.deepEqual([qrCode('x'.repeat(8)).version, qrCode('x'.repeat(8)).level], [1, 'Q']);
  assert.deepEqual([qrCode('x'.repeat(14)).version, qrCode('x'.repeat(14)).level], [1, 'M']);
  assert.deepEqual([qrCode('x'.repeat(17)).version, qrCode('x'.repeat(17)).level], [1, 'L']);
  assert.equal(qrCode('x'.repeat(18)).version, 2);
  // the most: version 40 at L
  const most = qrCode('x'.repeat(QR_MAX_BYTES));
  assert.deepEqual([most.version, most.level], [40, 'L']);
});

test('the mask is the least penalty\'s, and each of the eight decodes (the format bits right)', () => {
  const text = 'https://silinx.example/#gist=0123456789abcdef.KEY', q = qrCode(text);
  assert.ok(q.mask >= 0 && q.mask < 8);
  assert.equal(decode(q).data, text);
  for (const t of [text, linkOf(400)]) for (let mask = 0; mask < 8; mask++) {
    const m = qrCode(t, { mask });
    assert.equal(m.mask, mask);
    assert.equal(decode(m).data, t, `mask ${mask}`);
  }
});

test('a text in UTF-8: its bytes counted, decoded back', () => {
  const text = 'https://silinx.example/#name=Relógio-ação';
  assert.equal(qrBytes(text), text.length + 3);
  assert.equal(decode(qrCode(text)).data, text);
});

test('a text longer than a QR code holds has none', () => {
  assert.equal(qrFits('x'.repeat(QR_MAX_BYTES)), true);
  assert.equal(qrFits('x'.repeat(QR_MAX_BYTES + 1)), false);
  assert.equal(qrCode('x'.repeat(QR_MAX_BYTES + 1)), null);
  assert.equal(qrSvg('x'.repeat(QR_MAX_BYTES + 1)), null);
  // (two-byte characters: 1477 of them are 2954 bytes)
  assert.equal(qrFits('é'.repeat(1476)), true);
  assert.equal(qrFits('é'.repeat(1477)), false);
});

test('the SVG: black on white, its quiet zone, one module a unit', () => {
  const text = 'https://silinx.example/#follow=room.key', q = qrCode(text), svg = qrSvg(text);
  const n = q.size + 8;
  assert.match(svg, new RegExp(`^<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#fff"/><path d="M`));
  const dark = q.modules.flat().filter(Boolean).length;
  assert.equal(svg.match(/h1v1h-1z/g).length, dark);
  assert.deepEqual(svgModules(svg), q.modules);
  assert.equal(decodeSvg(svg), text);
  assert.match(svg, /^<svg[^]*M4,4h1v1h-1z/);   // (the finder's corner, at the quiet zone's edge)
  assert.match(qrSvg(text, { border: 2 }), new RegExp(`viewBox="0 0 ${q.size + 4} ${q.size + 4}"`));
  // nothing of the text in it (no script, no markup of its own)
  assert.ok(!qrSvg('<script>"&').includes('script'));
});
