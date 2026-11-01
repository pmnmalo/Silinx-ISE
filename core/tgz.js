// A package's tarball in memory (#2444), in Node and in the browser: its npm integrity checked, its .tgz read into its files.
// npm's tarballs only: regular files, each under the folder "package/", which is left out of their paths.

/** Throws unless the bytes are those of the SHA-512 of an npm `integrity` ('sha512-<base64>'). */
export async function checkIntegrity(bytes, integrity) {
  const m = /^sha512-(.+)$/.exec(String(integrity || ''));
  if (!m) throw new Error(`not a SHA-512 integrity: ${integrity}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-512', bytes));
  if (btoa(String.fromCharCode(...digest)) !== m[1]) throw new Error('its SHA-512 is not the one of package-lock.json');
}

const text = (b, from, n) => { const s = new TextDecoder().decode(b.subarray(from, from + n)); const z = s.indexOf('\0'); return z < 0 ? s : s.slice(0, z); };

/** The files of a tar's bytes: { path: Uint8Array }, its first folder left out; a path out of the package throws. */
export function untar(tar) {
  const files = {};
  let long = null;
  for (let at = 0; at + 512 <= tar.length;) {
    if (tar[at] === 0) break;   // (the end: blocks of zeros)
    const size = parseInt(text(tar, at + 124, 12).trim() || '0', 8), type = String.fromCharCode(tar[at + 156]);
    const body = at + 512;
    if (type === 'x' || type === 'L') {
      // (a long name: a pax header's path, GNU's next name)
      const s = text(tar, body, size);
      long = type === 'L' ? s : (/(?:^|\n)\d+ path=([^\n]*)\n/.exec(s)?.[1] ?? long);
    } else {
      const prefix = text(tar, at + 345, 155), name = long ?? (prefix ? `${prefix}/${text(tar, at, 100)}` : text(tar, at, 100));
      long = null;
      if (type === '0' || type === '\0') {
        const parts = name.split('/');
        if (name.startsWith('/') || parts.includes('..')) throw new Error(`a path out of the package: ${name}`);
        files[parts.slice(1).join('/')] = tar.slice(body, body + size);
      }
    }
    at = body + Math.ceil(size / 512) * 512;
  }
  return files;
}

/** The files of a .tgz's bytes. */
export async function untgz(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return untar(new Uint8Array(await new Response(stream).arrayBuffer()));
}
