# the stand-in board's settings (test/fixtures/adepttool-stub/README.md): SILINX_ILA_STUB (JSON), else the file
# ila-stub.json of the configuration folder (SILINX_CONFIG_DIR: the UI tests', whose server is already running)
import json
import os


def stub_config():
    if os.environ.get('SILINX_ILA_STUB'):
        return json.loads(os.environ['SILINX_ILA_STUB'])
    f = os.path.join(os.environ.get('SILINX_CONFIG_DIR', ''), 'ila-stub.json')
    with open(f) as fh:
        return json.load(fh)
