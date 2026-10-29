#!/usr/bin/env node
// silinx-fpga's command line (#1679): packages/silinx-fpga/src/cli.js
import { main } from '../src/cli.js';

process.exitCode = await main(process.argv.slice(2));
