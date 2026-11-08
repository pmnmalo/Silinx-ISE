In detail:

- **A second launch opens only a one-time code of the server's form (#3014):** the launcher that finds Silinx already
  running puts the code its server gave into the address it opens only when it is a code of the form the server
  issues (`server/open-code.js` `openCodeUrl`), else it opens the server's address alone; tests:
  server-open-code (the codes kept, every other answer dropped, the launcher using it).
