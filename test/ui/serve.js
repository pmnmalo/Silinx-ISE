// Child process used by the UI tests: the Silinx server on a free port. The workspace and the
// configuration directory come from SILINX_WORKSPACE / SILINX_CONFIG_DIR (temp dirs set by the
// harness); the chosen port is printed as "SILINX_PORT <n>".
import { createApp } from '../../server/server.js';

const app = await createApp({ host: '127.0.0.1' });
const srv = app.listen(0, '127.0.0.1', () => {
  process.stdout.write(`SILINX_PORT ${srv.address().port}\n`);
});
const stop = () => { srv.closeAllConnections?.(); srv.close(() => process.exit(0)); setTimeout(() => process.exit(0), 500).unref(); };
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
// exit with the parent (the test process) even when it is killed
process.stdin.on('end', stop);
process.stdin.resume();
