In detail:

- **The local server's token kept off command lines (#2955):** the browser a launcher (or `serve --open`) opens is
  given a one-time code (`…/#code=…`, single use, for a minute), which the page exchanges for the token (POST
  `/api/token`, from the page itself: its Origin required); the address printed in the terminal keeps its token. A
  second launch takes the server on its port for a running Silinx only when it proves it holds the token of its file
  in the configuration folder (an HMAC of a nonce, GET `/api/proof`: the token is not sent to it), and opens it with
  a code of its own; any other server on the port is another program (exit 1). The page replaces the token it keeps
  with an address's `#token=…` only when the server accepts it (server/open-code.js, web/js/api.js).
