In detail:

- **The UI test of a project hosted by the owner's page, on a Mac behind a VPN (#3567):** its two pages, with no STUN
  server, offered each other only an mDNS name (.local, which this Mac's Chrome did not resolve) or, without it, only
  the default route's address (a VPN's tunnel, which never reaches itself), and never connected: the test timed out
  waiting for the hosted project. The UI tests' Chrome takes `webrtc: true` (setupUi), as if the pages had the
  camera's permission, so their candidates are every interface's address, and they connect on any machine.
