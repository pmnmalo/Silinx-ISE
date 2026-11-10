#!/usr/bin/env python3
# Silinx - the logic analyzer's scans (#3176) on a Digilent Adept board (Basys2, Nexys2), built on adepttool's JTAG
# layer (github.com/mwkmwkmwk/adepttool), for the application's server (server/ila-board.js): the board opened, the
# Spartan-3E's instruction set to the user register (USER1, the capture core's BSCAN_SPARTAN3), then one JSON line a
# request on stdin, its answer a JSON line on stdout:
#   in:  {"scan": ["<hex>", ...]}    the words to shift through the register (bits bits each, the command first)
#   out: {"words": ["<hex>", ...]}   what each scan read out (core/ila-link.js: the previous scan's command's word)
#   in:  {"close": true}             the board released, the script ends (also at the end of stdin)
# The first line out is {"ready": true, "product": ..., "fpga": ...}, or {"error": "..."} (the script then ends with 1).
#
# Usage: ila-scan.py --bits R [--device N] [--ir 2]
# GNU AGPL-3.0 licence (same as Silinx).

import argparse
import json
import sys

import usb1
from adepttool.device import get_devices
from adepttool.jtag import Chain, Spartan3


def out(msg):
    sys.stdout.write(json.dumps(msg) + '\n')
    sys.stdout.flush()


def main():
    p = argparse.ArgumentParser(description="The logic analyzer's scans through the FPGA's user register.")
    p.add_argument('--device', type=int, default=0, help='the Adept device index')
    p.add_argument('--bits', type=int, required=True, help="the register's length")
    p.add_argument('--ir', type=int, default=0x02, help='the user instruction (USER1)')
    a = p.parse_args()
    with usb1.USBContext() as ctx:
        devs = get_devices(ctx)
        if a.device >= len(devs):
            out({'error': 'no Digilent Adept board found: is it connected and powered on?' if not devs else
                 'no Adept board {} (the last is {})'.format(a.device, len(devs) - 1)})
            return 1
        dev = devs[a.device]
        dev.start()
        chain = Chain(dev.djtg_ports[0])
        chain.init()
        try:
            fpga = next((d for d in chain.devices if isinstance(d, Spartan3)), None)
            if fpga is None:
                out({'error': 'no Spartan-3E FPGA on the JTAG chain (found {})'.format(', '.join(d.name for d in chain.devices))})
                return 1
            fpga.prep_cmd(a.ir)
            out({'ready': True, 'product': getattr(dev, 'product_name', None), 'fpga': fpga.name})
            for line in sys.stdin:
                if not line.strip():
                    continue
                msg = json.loads(line)
                if msg.get('close'):
                    break
                words = [fpga.shift_dr_num(int(w, 16), a.bits) for w in msg['scan']]
                out({'words': ['{:x}'.format(w) for w in words]})
        finally:
            chain.close()
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as e:   # (the board unplugged, in use…: said, as the other scripts' errors)
        out({'error': str(e)})
        sys.exit(1)
