// The toolchain configuration test/vivado/examples.test.js builds the examples with (#1649), as test/ise-examples-config.mjs
// is ISE's: over ssh the builds go to a folder of their own in the configured one (SILINX_ISE_REMOTE_DIR, else the user's
// ssh.remoteDir: Docker on the ISE machine shares only some folders, #482), else ~/silinx-vivado; Vivado in its image.
// Called before the test points SILINX_CONFIG_DIR at its own configuration.
import { iseWorkBase } from '../server/toolchain.js';

/** host: null for the image on this machine (SILINX_ISE_HOST=local), else { user, host }. */
export function vivadoExamplesConfig({ host, image, env = process.env }) {
  if (!host) return { mode: 'silinx', docker: { platform: 'linux/amd64' }, vivado: { mode: 'docker', image } };
  const base = iseWorkBase('', env);
  const remoteDir = base ? `${base}/silinx-vivado` : 'silinx-vivado';
  return { mode: 'silinx', ssh: { host: host.host, user: host.user || '', remoteDir }, vivado: { mode: 'ssh', image } };
}

/** Vivado's warnings of a run's log (CRITICAL WARNING and WARNING, its own: "[Synth 8-7129] …"), once each, sorted. */
export const vivadoWarnings = lines => [...new Set(lines.filter(l => /^(CRITICAL WARNING|WARNING): \[/.test(l))
  .map(l => l.replace(/\s+/g, ' ').trim()))].sort();
