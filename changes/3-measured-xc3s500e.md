In detail:

- **Device measurements, the XC3S500E measured (#3):** `data/xc3s500e/` holds the measurements of the XC3S500E-FG320
  (Nexys2-500) and the description built from them alone; `test/s3e-device.test.js` rebuilds it byte for byte. Against
  the shipped graph: no merged node, no split node a short can come from, every valid test's verdict and every probe's
  answer agreeing (four clock tests whose own route drove the other end are marked invalid). The 7 examples routed by
  the open flow on it pass ISE (DRC 0 / 0, `.bit` byte-identical with CRC on and off). The shipped graph is unchanged.
