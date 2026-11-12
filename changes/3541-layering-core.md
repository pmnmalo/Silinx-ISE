In detail:

- **The layers' directions (#3541):** the New Source templates (`templates.js`, `c-templates.js`, out of `web/js/`) and
  the device database, the boards, the `.xise` reader and writer and a drawing's HDL sync (out of `server/`) moved to
  `core/` as they were, their old modules re-exporting them; `server/mcp-new-source.js` and the standalone page's
  `web/js/api-local.js` and `git-browser.js` import them from `core/`. `test/layering.test.js` checks that `server/`
  imports nothing of `web/`, `web/` nothing of `server/`, `core/` neither, and the packages nothing of the IDE.
