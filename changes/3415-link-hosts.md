In detail:

- **A link's `open=` refuses more local hosts (#3415):** a host with several trailing dots (`localhost..`,
  a private address followed by two dots) or an empty label, a Teredo address (`2001::/32`, which carries an IPv4 address) and the names of a
  private network (`.corp`, `.svc`, `.intranet`, `.private`, `.localdomain`) or that never resolve (`.test`,
  `.invalid`, `.example`) are refused as an address of this computer or of a local network; another internal name is the
  user's call in the dialog that names the address (SECURITY.md).
