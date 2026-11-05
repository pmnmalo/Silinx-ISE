In detail:

- **A design's link, its encoding and the MCP server's tools (#2826, #2829):** `core/design-link.js` puts a whole
  project in a link (`#design=`: its files as JSON, deflate-raw, base64url, the HDL a drawing makes again left out
  and made again on opening: every example back byte for byte, 5 to 25 KB), reads a link's options (`design=`,
  `open=<https zip>`, `open=example:<name>`, `view=try|simulate|emulate`, `top=`, `board=`) and checks that a design
  has the view it opens; the design's files go through the import gate (core/import-gate.js, #2830); an untrusted link is refused with its reason: too long, a decompression bomb (inflated no
  further than its limit), a file outside the project, a name that is not one, a zip address that is not https or is
  of this computer or a local network. The MCP server's `project_link` makes a project's link and `open_link` makes a
  project of a link (never replacing a project that differs; a zip at an address is not fetched).
