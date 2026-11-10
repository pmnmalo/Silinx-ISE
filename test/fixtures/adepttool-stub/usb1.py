# a stand-in for python-libusb1 (test/fixtures/adepttool-stub/README.md)
class USBContext:
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False
