In detail:

- **`install.sh --docker-acl` says what the socket gives the runner (#3033):** after setting the ACL it notes that
  through Docker Desktop's socket the runner's user may mount every folder Docker Desktop shares (by default
  `/Users`), and that its file sharing must be restricted to the runner's work and cache folders (Docker Desktop ▸
  Settings ▸ Resources ▸ File sharing). What it configures is unchanged.
