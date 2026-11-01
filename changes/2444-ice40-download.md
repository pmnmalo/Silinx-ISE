In detail:
- The iCE40's nextpnr and icepack (`@yowasp/nextpnr-ice40`, 78 MB) are not in the release zip or on the site: the first iCE40 run downloads them from npm's registry, at the version and the SHA-512 of `package-lock.json`, and keeps them (the local server in `~/.silinx/nextpnr/`, the browser in Cache Storage); `https://registry.npmjs.org` joins the pages' `connect-src` (#2444).
