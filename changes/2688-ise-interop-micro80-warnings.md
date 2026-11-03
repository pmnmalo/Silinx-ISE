In detail:

- **The ISE interoperability test expects micro80's warnings (#2688):** test/ise/xise-interop.test.js expected no
  warning from ISE's project flow on the micro80 example, which gives the light8080 processor's (the accepted ones of
  #2544). It now expects, on the Basys2-250, the same 41 warnings of XST test/ise/examples.test.js expects (one list,
  in test/ise-micro80-warnings.mjs, shared by both, the top's VHDL path its parameter), and on the Nexys3 the
  Spartan-6's 26 of XST, map and par. Test: test/ise-micro80-warnings.test.js.
