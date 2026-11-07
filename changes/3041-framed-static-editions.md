In short:

- **Not inside another site's page:** the browser edition (the site, the single file) shown in a frame of another
  page does not start; it says so, with a link that opens it in a tab of its own.

In detail:

- **The static editions refuse a frame (#3041):** their `<meta>` policy cannot carry `frame-ancestors` (the local
  server's header refuses a frame already), so another site could frame the page with a link (`#open=`, `#design=`)
  and put its own content over its buttons; `web/index.html`'s first script, in a frame, stops the page (the app
  never starts, the link is not opened) and shows a notice with a link to the same address in a new tab (noopener),
  in English or Portuguese by the language preference or the browser's; test: `test/ui/framed.test.js` (the site
  framed, in both languages; not framed, it starts), in both interfaces.
