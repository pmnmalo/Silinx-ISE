// The toolchain configuration test/vivado/examples.test.js builds the examples with (#1649), as test/ise-examples-config.mjs
// is ISE's: over ssh the builds go to a folder of their own in the configured one (SILINX_ISE_REMOTE_DIR, else the user's
// ssh.remoteDir: Docker on the ISE machine shares only some folders, #482), else ~/silinx-vivado; Vivado in its image.
// Called before the test points SILINX_CONFIG_DIR at its own configuration.
import { iseWorkBase } from '../server/toolchain.js';
import { EXAMPLES } from './examples-lib.mjs';

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

// the warnings Vivado gives on each example (test/vivado/examples.test.js, the comparison's results #3760), by board: none,
// but synthesis's on an output the design drives with a constant (traffic's unused LEDs, pong's decimal point: as the
// designs mean them; ISE's XST says nothing of them)
const constant = (top, port, v) => `WARNING: [Synth 8-3917] design ${top} has port ${port} driven by constant ${v}`;
const warnings = {
  ...Object.fromEntries(EXAMPLES.map(n => [n, []])),
  traffic: [constant('top', 'led[2]', 0), constant('top', 'led[3]', 0), constant('top', 'led[4]', 0)],
  pong: [constant('pong', 'dp', 1)],
  // the light8080 processor, as it is (#2544): its registers' bits it never reads
  micro80: ['WARNING: [Synth 8-3936] Found unconnected internal register \'IR_reg\' and it is trimmed from \'8\' to \'6\' bits. [/work/src/src/light8080.vhdl:297]',
    'WARNING: [Synth 8-3936] Found unconnected internal register \'daa_res9_reg\' and it is trimmed from \'9\' to \'8\' bits. [/work/src/src/light8080.vhdl:746]'],
};
export const VIVADO_WARNINGS = { basys3: warnings, 'nexys-a7': warnings };
// the design rule check's findings on each example: none, but stopwatch's DSP48 multipliers (its division by constants)
// not pipelined, Vivado's performance advice: [rule, severity, description, checks]
export const VIVADO_DRC = { stopwatch: [['DPIP-1', 'Warning', 'Input pipelining', 3], ['DPOP-2', 'Warning', 'MREG Output pipelining', 3]] };
