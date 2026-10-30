# silinx-fpga's changelog fragments

What changed in silinx-fpga since its last release, one file per change, in the format of Silinx ISE's
fragments ([changes/README.md](../../../changes/README.md): `<issue>-<slug>.md`, an optional "In short:" for
what the package's users notice, the "In detail:" items naming the issue). A pull request that changes the
package (`packages/silinx-fpga`) adds its fragment here; it adds one to Silinx ISE's `changes/` too when the
IDE's users notice the change.

A release of the package assembles them into [CHANGELOG.md](../CHANGELOG.md) and deletes them:
`node scripts/changelog-release.mjs <version> --package silinx-fpga`, then
`npm version <version> -w silinx-fpga --no-git-tag-version` and
`node scripts/sync-version.mjs --package silinx-fpga` (it refuses a version with no section or with fragments
left). `test/changelog-fragments.test.js` checks the fragments here too.
