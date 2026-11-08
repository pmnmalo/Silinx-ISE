In detail:

- **The private-data check allows #2962's special-purpose addresses in CHANGELOG.md (#3121):** the NAT64 and reserved
  ranges that a link's zip address is checked against were allowed in their fragment only, so the release that moved
  the fragment into CHANGELOG.md failed its CI.
