// The toolchain configuration test/ise/examples.test.js builds the examples with (#1916): Docker on the ISE machine shares
// only some folders (#482), so over ssh the builds go to a folder of their own in the configured one (SILINX_ISE_REMOTE_DIR,
// else the user's ssh.remoteDir), as scripts/check-open-flow.mjs does; else ~/silinx-ise-examples.
// Called before the test points SILINX_CONFIG_DIR at its own configuration.
import { iseWorkBase } from '../server/toolchain.js';

export const ISE_SETTINGS = '/opt/Xilinx/14.7/ISE_DS/settings64.sh';

/** host: null for the image on this machine (SILINX_ISE_HOST=local), else { user, host }. */
export function iseExamplesConfig({ host, image, env = process.env }) {
  if (!host) return { mode: 'docker', docker: { image, platform: 'linux/amd64', settings: ISE_SETTINGS } };
  const base = iseWorkBase('', env);
  const remoteDir = base ? `${base}/silinx-ise-examples` : 'silinx-ise-examples';
  return { mode: 'ssh', ssh: { host: host.host, user: host.user || '', remoteDir, image, settings: ISE_SETTINGS } };
}
