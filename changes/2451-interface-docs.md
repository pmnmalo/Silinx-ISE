In detail:

- **The documentation names the interfaces Silinx and ISE style (#2451):** README, docs/ARCHITECTURE.md,
  ONBOARDING.md and CLAUDE.md say "the Silinx interface" and "the ISE style interface", and the tests' command
  `SILINX_UI_INTERFACE=ise`. The test of the old names reads every Markdown file too (not CHANGELOG.md, the
  changelog's fragments nor the research notes, kept as they were written).
