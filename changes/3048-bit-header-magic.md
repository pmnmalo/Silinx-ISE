In detail:

- **The browser's `.bit` header checks its magic (#3048):** `core/adept.js` bitHeader takes a file as a `.bit` only
  when its length word and its 9 bytes of magic are a Xilinx bitstream's, as the server's parseBitHeader does.
