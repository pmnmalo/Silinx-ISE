#!/usr/bin/env python3
# Silinx - Xilinx XCF0xS Platform Flash (serial PROM) programmer over the Digilent Adept USB
# of the Basys2, built on adepttool's JTAG layer (github.com/mwkmwkmwk/adepttool).
#
# Implements the IEEE 1532 in-system-programming flow described in Xilinx's XCF0xS BSDL/ISC
# files: ISC_ENABLE, ISC_ERASE, ISC_DATA_SHIFT + ISC_ADDRESS_SHIFT + ISC_PROGRAM per 4096-bit
# block (32 frames), ISC_READ for verification, ISC_DISABLE, CONFIG.
# Every ISC wait must clock TCK in Run-Test/Idle (the PROM executes erase/program/read and
# updates its status only while TCK runs): waits are done with chain.clock_rti(), not sleep().
#
# Usage:
#   xcf_prog.py [--device N] info
#   xcf_prog.py [--device N] read  out.bin          read the whole PROM (backup)
#   xcf_prog.py [--device N] erase
#   xcf_prog.py [--device N] program file.bit [--no-verify] [--reconfigure]
#   xcf_prog.py [--device N] verify  file.bit
#   xcf_prog.py [--device N] reconfigure            FPGA reloads from the PROM (needs mode jumper = ROM)
#
# The .bit file for the PROM must be generated with StartUpClk:CCLK.
# GNU AGPL-3.0 licence (same as Silinx).

import argparse
import sys
import time

import usb1
from adepttool.device import get_devices
from adepttool.jtag import Chain, Spartan3, PlatformFlashSerial, byterev

# XCF instructions (8-bit IR)
ISC_ENABLE, ISC_PROGRAM, ISC_ADDRESS_SHIFT, ISC_ERASE = 0xE8, 0xEA, 0xEB, 0xEC
ISC_DATA_SHIFT, CONFIG, ISC_READ, ISC_DISABLE = 0xED, 0xEE, 0xEF, 0xF0
ISCTESTSTATUS, BYPASS = 0xE3, 0xFF
FRAMES_PER_BLOCK = 32
TCK_PER_SEC = 2_000_000        # conservative effective TCK rate of the Adept JTAG port (nominal 4 MHz)


def log(*a):
    print(*a, flush=True)


def parse_bit(path):
    """Return the configuration data of a Xilinx .bit file (and its header fields)."""
    with open(path, 'rb') as f:
        b = f.read()
    n = int.from_bytes(b[0:2], 'big')
    i = 2 + n + 2  # skip magic + 0x0001
    fields = {}
    while i < len(b):
        key = chr(b[i]); i += 1
        if key == 'e':
            ln = int.from_bytes(b[i:i + 4], 'big'); i += 4
            return b[i:i + ln], fields
        ln = int.from_bytes(b[i:i + 2], 'big'); i += 2
        fields[key] = b[i:i + ln].rstrip(b'\0').decode('latin1'); i += ln
    raise ValueError('no configuration data in bit file')


class Xcf:
    def __init__(self, chain, dev):
        self.chain, self.dev = chain, dev
        code = (dev.idcode >> 12) & 0xFF
        if code not in (0x44, 0x45, 0x46):
            raise SystemExit('unsupported Platform Flash IDCODE %08x' % dev.idcode)
        self.size = {0x44: 1 << 20, 0x45: 2 << 20, 0x46: 4 << 20}[code]  # bits
        self.block = 2048 if code == 0x44 else 4096                     # bits per block
        for d in chain.devices:                                          # everything else in BYPASS
            d.cur_cmd = (1 << d.IR_LEN) - 1

    def ir(self, cmd):
        self.dev.cur_cmd = cmd
        return self.chain.shift_ir()[self.chain.devices.index(self.dev)]

    def dr_num(self, value, bits):
        return self.dev.shift_dr_num(value, bits)

    def dr_bytes(self, data, bits):
        return self.dev.shift_dr_bytes(data, bits)

    def wait(self, seconds, min_tck=1):
        """Stay in Run-Test/Idle clocking TCK for at least `seconds` (and `min_tck` cycles)."""
        self.chain.clock_rti(max(min_tck, int(seconds * TCK_PER_SEC)))

    def status(self):
        self.ir(ISCTESTSTATUS)
        self.wait(0, 1)
        return self.dr_num(0, 8)

    def wait_ready(self, step, timeout, what):
        """Poll the ISC status 'done' bit (0x04), clocking TCK between polls."""
        t = 0.0
        while t < timeout:
            self.wait(step)
            t += step
            if self.status() & 0x04:
                return
        raise SystemExit('%s did not complete (timeout %.1f s)' % (what, timeout))

    def enable(self, code=0x37):
        self.ir(ISC_ENABLE)
        self.dr_num(code, 6)
        self.wait(0, 1)

    def disable(self):
        self.ir(ISC_DISABLE)
        self.wait(0.11)
        self.ir(BYPASS)
        self.wait(0, 1)

    def address(self, frame):
        self.ir(ISC_ADDRESS_SHIFT)
        self.wait(0, 1)
        self.dr_num(frame, 16)
        self.wait(0, 1)

    def write_protected(self):
        self.ir(ISC_DISABLE)
        self.wait(0.11)
        cap = self.ir(BYPASS)
        return bool(cap & 0x08)

    def erase(self):
        if self.write_protected():
            raise SystemExit('the PROM is write protected')
        self.enable()
        self.address(1)
        self.ir(ISC_ERASE)
        self.wait_ready(0.1, 20.0, 'erase')     # typically ~4 s on an XCF02S
        self.disable()

    def blocks(self, nbits):
        return (nbits + self.block - 1) // self.block

    def program(self, data):
        nbits = len(data) * 8
        if nbits > self.size:
            raise SystemExit('bitstream (%d bits) does not fit the PROM (%d bits)' % (nbits, self.size))
        bpb = self.block // 8
        image = byterev(data) + b'\xff' * (self.blocks(nbits) * bpb - len(data))
        self.ir(ISC_DISABLE)
        self.wait(0.001)
        self.enable()
        n = self.blocks(nbits)
        for i in range(n):
            self.ir(ISC_DATA_SHIFT)
            self.dr_bytes(image[i * bpb:(i + 1) * bpb], self.block)
            self.address(i * FRAMES_PER_BLOCK)
            self.ir(ISC_PROGRAM)
            self.wait_ready(0.0005, 0.05, 'programming block %d' % i)
            if i % 16 == 0 or i == n - 1:
                log('  programmed block %d/%d' % (i + 1, n))
        self.disable()

    def read(self, nbits):
        bpb = self.block // 8
        out = b''
        self.enable(0x34)
        for i in range(self.blocks(nbits)):
            self.address(i * FRAMES_PER_BLOCK)
            self.ir(ISC_READ)
            self.wait(0.00005, 1)          # the read happens during these TCK cycles
            out += bytes(self.dr_bytes(bytes(bpb), self.block))
        self.disable()
        return out[:(nbits + 7) // 8]

    def verify(self, data):
        got = self.read(len(data) * 8)
        want = byterev(data)
        for i in range(len(want)):
            if got[i] != want[i]:
                raise SystemExit('verify FAILED at byte %d (block %d): read %02x expected %02x' % (i, i * 8 // self.block, got[i], want[i]))

    def reconfigure(self):
        self.ir(CONFIG)
        self.wait(0.001, 1)
        self.ir(BYPASS)
        self.wait(0, 1)


def main():
    ap = argparse.ArgumentParser(description='Program the XCF0xS Platform Flash of a Digilent Adept board (Basys2).')
    ap.add_argument('--device', type=int, default=0, help='USB board index')
    ap.add_argument('op', choices=['info', 'read', 'erase', 'program', 'verify', 'reconfigure'])
    ap.add_argument('file', nargs='?')
    ap.add_argument('--no-verify', action='store_true')
    ap.add_argument('--reconfigure', action='store_true', help='after programming, make the FPGA load from the PROM and check DONE')
    a = ap.parse_args()
    if a.op in ('read', 'program', 'verify') and not a.file:
        ap.error('%s needs a file' % a.op)

    with usb1.USBContext() as ctx:
        devs = get_devices(ctx)
        if a.device >= len(devs):
            raise SystemExit('no Digilent Adept board found' if not devs else 'invalid board index')
        dev = devs[a.device]
        dev.start()
        chain = Chain(dev.djtg_ports[0])
        chain.init()
        prom = next((d for d in chain.devices if isinstance(d, PlatformFlashSerial)), None)
        fpga = next((d for d in chain.devices if isinstance(d, Spartan3)), None)
        log('JTAG chain: ' + ', '.join('%s(%08x)' % (d.name, d.idcode) for d in chain.devices))
        if not prom:
            raise SystemExit('no XCF Platform Flash in the JTAG chain')
        x = Xcf(chain, prom)
        log('PROM %s: %d Kbit, %d-bit blocks%s' % (prom.name, x.size // 1024, x.block, ', WRITE PROTECTED' if x.write_protected() else ''))
        try:
            if a.op == 'read':
                data = x.read(x.size)
                with open(a.file, 'wb') as f:
                    f.write(byterev(data))
                used = len(data.rstrip(b'\xff'))
                log('read %d bytes (%d bytes before the erased tail) -> %s' % (len(data), used, a.file))
            elif a.op == 'erase':
                log('erasing...'); x.erase(); log('erased')
            elif a.op in ('program', 'verify'):
                data, hdr = parse_bit(a.file)
                log('bitstream: design %s part %s %s %s, %d bytes' % (hdr.get('a', '?'), hdr.get('b', '?'), hdr.get('c', ''), hdr.get('d', ''), len(data)))
                if a.op == 'program':
                    log('erasing...'); x.erase()
                    log('programming...'); x.program(data)
                if a.op == 'verify' or not a.no_verify:
                    log('verifying...'); x.verify(data); log('verify OK')
            if a.op == 'reconfigure' or a.reconfigure:
                log('reconfiguring the FPGA from the PROM...')
                x.reconfigure()
                ok = False
                if fpga:
                    for d in chain.devices:
                        d.cur_cmd = (1 << d.IR_LEN) - 1
                    t0 = time.time()
                    while time.time() - t0 < 5:
                        time.sleep(0.2)
                        if fpga.get_status() & 0x20:
                            ok = True
                            break
                log('STATUS: DONE' if ok else 'STATUS: FPGA did not assert DONE (is the mode jumper set to ROM, and was the bitstream built with StartUpClk:CCLK?)')
                if not ok:
                    sys.exit(3)
        finally:
            chain.close()


if __name__ == '__main__':
    main()
