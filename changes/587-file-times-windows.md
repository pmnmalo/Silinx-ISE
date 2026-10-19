In detail:

- **The test of each test file's time passes on Windows (#587):** it gave node --test the reporter by an
  absolute path, which Node's module loader on Windows takes for a URL (the scheme `d:`); it now gives it as
  CI does, relative to the repository.
