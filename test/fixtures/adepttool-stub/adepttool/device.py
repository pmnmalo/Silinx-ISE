# a stand-in for adepttool.device (test/fixtures/adepttool-stub/README.md): one board, or none (SILINX_ILA_STUB's boards: 0)
from adepttool.stubcfg import stub_config


class Device:
    product_name = 'Digilent Basys2'

    def start(self):
        self.djtg_ports = [object()]


def get_devices(ctx):
    cfg = stub_config()
    return [Device() for _ in range(cfg.get('boards', 1))]
