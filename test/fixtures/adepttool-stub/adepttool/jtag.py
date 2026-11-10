# a stand-in for adepttool.jtag (test/fixtures/adepttool-stub/README.md): the chain's FPGA (a Spartan3) and PROM; the
# FPGA's USER1 register the logic analyzer's core as test/ila-lib.mjs CoreModel has it: a scan's command runs at the next
# scan's capture, the arm acknowledged at the next capture, the capture complete `fill` captures after the arm
from adepttool.stubcfg import stub_config

USER1 = 0x02


class JtagDev:
    def __init__(self, name):
        self.name = name
        self.cur_cmd = None


class Spartan3(JtagDev):
    def __init__(self):
        super().__init__('xc3s250e')
        c = stub_config()
        self.samples = [int(s, 16) for s in c['samples']]
        self.width, self.depth, self.fill = c['width'], c['depth'], c.get('fill', 3)
        self.cmd = self.arm_t = self.ack = self.armed = self.triggered = self.done = self.raddr = self.captures = 0
        self.since = None
        self.log = c.get('log')

    def prep_cmd(self, cmd):
        self.cur_cmd = cmd

    def status(self):
        a = self.depth.bit_length() - 1
        return self.armed | self.triggered << 1 | self.done << 2 | self.arm_t << 3 | self.ack << 4 | a << 5 | (self.width - 1) << 10

    def shift_dr_num(self, num, length):
        if self.cur_cmd != USER1:
            raise RuntimeError('a scan of instruction {} (not USER1)'.format(self.cur_cmd))
        self.captures += 1
        if self.since is not None:
            n = self.captures - self.since
            if n >= 1:
                self.ack, self.armed = self.arm_t, 1
            if n >= self.fill:
                self.armed, self.triggered, self.done = 0, 1, 1
        if self.cmd == 1:
            self.arm_t ^= 1
            self.since = self.captures
            self.armed = self.triggered = self.done = 0
            word = self.status()
        elif self.cmd == 2:
            word = self.samples[self.raddr] if self.raddr < len(self.samples) else 0
            self.raddr += 1
        elif self.cmd == 3:
            self.raddr = 0
            word = self.status()
        else:
            word = self.status()
        if self.log:
            with open(self.log, 'a') as f:
                f.write('{} {}\n'.format(length, num & 3))
        self.cmd = num & 3
        return word


class PlatformFlashSerial(JtagDev):
    def __init__(self):
        super().__init__('xcf02s')


class Chain:
    def __init__(self, port):
        self.port = port

    def init(self):
        self.devices = [PlatformFlashSerial(), Spartan3()]

    def close(self):
        pass
