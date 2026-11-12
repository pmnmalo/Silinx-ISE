// The QR codes of core/qr.js read back (#3637): a symbol's modules, or its SVG, drawn as an image and decoded by jsQR,
// an independent decoder used only in the tests.
import jsQR from 'jsqr';

/** The text of a QR code's modules (rows of booleans, true dark), or null; `scale` pixels a module, a quiet zone of 4. */
export function decodeModules(modules, scale = 4) {
  const size = modules.length, n = (size + 8) * scale, px = new Uint8ClampedArray(n * n * 4).fill(255);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (!modules[y][x]) continue;
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const o = (((y + 4) * scale + dy) * n + (x + 4) * scale + dx) * 4;
      px[o] = px[o + 1] = px[o + 2] = 0;
    }
  }
  return jsQR(px, n, n, { inversionAttempts: 'dontInvert' });
}

/** The modules of qrSvg's SVG (its viewBox, its quiet zone `border`, each dark module an `Mx,yh1v1h-1z`). */
export function svgModules(svg, border = 4) {
  const n = Number(/viewBox="0 0 (\d+) \1"/.exec(svg)[1]), size = n - 2 * border;
  const m = Array.from({ length: size }, () => new Array(size).fill(false));
  for (const [, x, y] of svg.matchAll(/M(\d+),(\d+)h1v1h-1z/g)) m[y - border][x - border] = true;
  return m;
}
/** The text of qrSvg's SVG, or null. */
export const decodeSvg = (svg, scale = 4) => decodeModules(svgModules(svg), scale)?.data ?? null;
