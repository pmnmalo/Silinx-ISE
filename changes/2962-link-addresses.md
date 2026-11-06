In detail:

- **Opening from a link: more local and reserved addresses refused, a redirection checked (#2962):** `privateHost`
  (`core/design-link.js`) reads an IPv6 host as its eight groups (every spelling of an address, one that is not an
  address refused) and refuses the forms that carry an IPv4 address (IPv4-compatible `::a.b.c.d` and all of `::/16`,
  mapped, NAT64 `64:ff9b::/96` and `64:ff9b:1::/48`, 6to4 of a private IPv4 address), site-local, multicast,
  discard-only and documentation IPv6 addresses, and the reserved IPv4 ranges (`198.18.0.0/15`, `192.0.0.0/24`, the
  documentation ranges); the zip's fetch checks the address it ends at after a redirection as the link's own (https,
  not local), else refuses it in the console.
