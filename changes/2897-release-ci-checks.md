In detail:

- **The checks the release's CI found broken (#2897).** The browser edition's flow asks the family's profile for the
  Spartan-6's nextpnr bundle (`openFlow.bitDb`), not the family's name; the tab order's Escape handler is `onEscape`, no
  longer taken for an HTML escape of its own; the ASM chart's simulated path's class is a listed safe shape. The tests
  follow a document tab's Show … Beside (the long press's menu, the interfaces' parity: the ISE style's View menu, the
  Silinx interface's tab menu), and on Windows compare cc's output with LF line ends and retry removing their scratch
  folder.
  - **Tests:** test/family-conditions.test.js, test/web-dom.test.js, test/web-markup-interpolations.test.js,
    test/ui/long-press.test.js, test/ui/interface-parity.test.js, test/c-sizeof-const.test.js, test/server-api.test.js.
