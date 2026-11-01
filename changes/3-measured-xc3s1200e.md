In detail:

- **Device measurements, the XC3S1200E measured (#3):** `data/xc3s1200e/` holds the measurements of the XC3S1200E-FG320
  (Nexys2-1200) and the description built from them alone; `test/s3e-device.test.js` rebuilds it byte for byte. Against
  the shipped graph: no merged node, every valid test's verdict and every probe's answer agreeing. At the long-line
  splitters ISE's routes cannot tell the two halves apart, so there the description defers to the shipped graph, and
  1469 split nodes a short can come from are left (all at the splitters, #2483). The 7 examples and the 45 open-flow
  designs routed by the open flow on it pass ISE (DRC 0 / 0, `.bit` byte-identical with CRC on and off). The shipped
  graph is unchanged.
