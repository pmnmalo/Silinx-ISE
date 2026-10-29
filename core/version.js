// Product name and version, shown in the UI (title bar, About, Design Summary).
// VERSION is kept equal to package.json by scripts/sync-version.mjs (run by `npm version`).
export const PRODUCT = 'Silinx ISE';
export const PRODUCT_FULL = 'Silinx ISE (Integrated Synthesis Environment)';
export const VERSION = '15.20.0';
// the commit of a development build (scripts/build-standalone.mjs defines __SILINX_BUILD__ when the
// commit built is not the release's tag, #135): { commit }, else null (a release, or the server)
/* global __SILINX_BUILD__ */
export const BUILD = typeof __SILINX_BUILD__ !== 'undefined' ? __SILINX_BUILD__ : null;
export const versionLabel = (build = BUILD, version = VERSION) => (build ? `dev:${build.commit}${build.date ? ` (${build.date})` : ''}` : version);
export const VERSION_LABEL = versionLabel();
export const REPOSITORY = 'pmnmalo/Silinx-ISE';   // GitHub owner/name (About, Check for Updates)

/** Compare dotted versions ("15.3.0" vs "v15.10.1"): negative, 0 or positive. */
export function compareVersions(a, b) {
  const p = (v) => String(v).replace(/^v/i, '').split(/[.+-]/).map((x) => parseInt(x, 10) || 0);
  const A = p(a), B = p(b);
  for (let i = 0; i < Math.max(A.length, B.length); i++) if ((A[i] || 0) !== (B[i] || 0)) return (A[i] || 0) - (B[i] || 0);
  return 0;
}
