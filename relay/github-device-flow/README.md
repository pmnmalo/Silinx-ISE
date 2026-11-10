# Silinx's GitHub sign-in relay

The browser edition of Silinx (on GitHub Pages) can sign in to GitHub with OAuth's device flow: Silinx shows a code,
and the user enters it at github.com/login/device. GitHub's two device-flow endpoints, `github.com/login/device/code`
and `github.com/login/oauth/access_token`, send no CORS headers, so a web page cannot call them. This relay, a
Cloudflare Worker, calls them for the page (#3196).

What it does, and nothing else:

- It answers `POST /login/device/code` and `POST /login/oauth/access_token` (and their CORS preflight) only.
- It forwards only those endpoints' own fields: `client_id` and `scope`; `client_id`, `device_code` and
  `grant_type`.
- It answers only Silinx's origins: `https://pmnmalo.github.io` unless `ALLOWED_ORIGINS` says otherwise.
- It keeps nothing and logs nothing. It has no storage, no console output and no analytics. The token GitHub gives
  passes through it once, to the page that asked for it.
- With `CLIENT_ID` set, it forwards only requests for that OAuth App.

Without a relay, the browser edition asks for a fine-grained personal access token instead.

## Deploying it (the maintainer)

1. Register Silinx's GitHub OAuth App (github.com ▸ Settings ▸ Developer settings ▸ OAuth Apps ▸ New OAuth App) and
   tick **Enable Device Flow**. Its client ID is public; the device flow uses no secret.
2. Deploy the worker with Cloudflare's command line, from this folder:

   ```bash
   npx wrangler deploy
   ```

3. Optionally, in the worker's settings (Variables), set `CLIENT_ID` to the OAuth App's client ID, and
   `ALLOWED_ORIGINS` to a comma-separated list of origins, if Silinx is served from somewhere else too.
4. In the repository, set `GITHUB_OAUTH_CLIENT_ID` and `GITHUB_DEVICE_RELAY` (the worker's URL, for example
   `https://silinx-github-relay.<account>.workers.dev`) in `web/js/github-app.js`, then build the site again. The
   site's Content-Security-Policy then allows the relay's origin.

The test is `test/github-relay.test.js`.
