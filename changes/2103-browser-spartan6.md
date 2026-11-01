In short:

- The browser edition builds for the Nexys3 and the Atlys too: Implement Design and Generate Programming File run the
  Silinx toolchain's Spartan-6 flow in the browser, with no server.

In detail:

- **The Spartan-6 in the browser edition (#2103):** the site publishes the Spartan-6's bit databases
  (`assets/<version>/bitdb/s6/`, a folder the build did not copy) beside the XC6SLX16's and XC6SLX45's device
  descriptions, and keeps them in Cache Storage as the other assets. `web/js/open-flow-browser.js` takes the Nexys3's and
  the Atlys's parts with the steps the server has for them (another step is refused, as the server refuses it), and the
  flow's worker fetches the part's bit databases (`fetchBitDbS6`): the same object as the server's, and the same
  bitstream. The Spartan-6 uses the Silinx engine in the browser.
  - **Tests:** test/s6-bitdb-browser.test.js, test/web-open-flow-browser.test.js, test/asset-cache.test.js,
    test/ui/standalone-boards.test.js.
