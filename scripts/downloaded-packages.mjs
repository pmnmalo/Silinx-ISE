// The npm packages Silinx downloads on their first use instead of shipping them (#2444): the iCE40's nextpnr. npm installs
// them all the same (an optional peer of the workspace silinx-fpga, "devOptional" in package-lock.json, which npm ci keeps
// with any --omit, #2570), so the release zip removes them (scripts/package-release.mjs) and the notices mark them
// (scripts/third-party.mjs).
import fs from 'node:fs';
import path from 'node:path';

export const DOWNLOADED_PACKAGES = ['@yowasp/nextpnr-ice40'];

/** Removes the downloaded packages from an app folder's node_modules. */
export function leaveOutDownloaded(app) {
  for (const name of DOWNLOADED_PACKAGES) fs.rmSync(path.join(app, 'node_modules', name), { recursive: true, force: true });
}
