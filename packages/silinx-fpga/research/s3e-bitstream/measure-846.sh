#!/bin/bash
# #846: a BUFGMUX_1's setting (DISABLE_ATTR HIGH: its output held high while it switches) on the 24 global buffers of
# the Spartan-3E: the designs of bufgmux1-846.json (gen-sidebufg.mjs: a BUFGMUX_1 on one buffer of each pair, the
# pair's other buffer left free, the main clock's BUFG on another edge) implemented by ISE for the XC3S250E
# (impl-remote.sh); in each routed design DISABLE_ATTR set back to LOW on one buffer at a time (gen-sitevar.mjs, xdl
# + bitgen on the ISE machine: fuzz-remote.sh) and the bits that change found near the buffer's tile
# (ana-sitevar.mjs). The result, the features BUFGMUX_XxYy:DISABLE_ATTR:HIGH of the four clock tiles' types, in
# $W/fix-29-bufgmux1.json (measured/ in the repository). ISE's outputs stay in W, out of the repository.
#   SILINX_FUZZ_HOST=user@host [RWBASE=/Users/Shared/silinx-ise/build] research/s3e-bitstream/measure-846.sh [W]
# (RWBASE: the folder on the ISE machine for the runs' folders, one Docker Desktop shares, #482; default the home)
set -e
cd "$(dirname "$0")"
export W=${1:-${TMPDIR:-/tmp}/silinx-846}; W=${W%/}
export SILINX_FUZZ_HOST=${SILINX_FUZZ_HOST:-$SILINX_ISE_HOST}
R=${RWBASE:+${RWBASE%/}/}
: "${SILINX_FUZZ_HOST:?set SILINX_FUZZ_HOST=user@host}"
DESIGNS=$(node gen-sidebufg.mjs "$W/impl" bufgmux1-846.json)
todo=(); for d in $DESIGNS; do [ -s "$W/impl/$d/top.xdl" ] || todo+=("impl/$d"); done
[ ${#todo[@]} -eq 0 ] || W="$W" RW=${R}silinx-846-impl PART=xc3s250e-cp132-4 bash impl-remote.sh -P 2 "${todo[@]}"
SV=()
for d in $DESIGNS; do
  [ -s "$W/impl/$d/top.xdl" ] || { echo "$d: not implemented (map.log, par.log)"; exit 1; }
  # the base: ISE's design (every BUFGMUX_1 with DISABLE_ATTR HIGH); a variant per buffer, LOW there
  node -e '
    const sites = require("fs").readFileSync(process.argv[1], "utf8").match(/BUFGMUX_X\d+Y\d+/g);
    console.log(JSON.stringify({ type: "BUFGMUX", bases: { H: {} }, variants: sites.map(s => ({ name: `L_${s.slice(8)}`, base: "H", site: s, set: { DISABLE_ATTR: "LOW" } })) }));
  ' "$W/impl/$d/top.ucf" > "$W/sv-$d.json"
  [ -f "$W/sv-$d/key.json" ] || node gen-sitevar.mjs "$W/impl/$d/top.xdl" "$W/sv-$d" "$W/sv-$d.json"
  n=$(ls "$W/sv-$d"/*.xdl | wc -l)
  [ "$(ls "$W/sv-$d" | grep '\.bit$' | grep -vc '\.crc\.bit$')" -ge "$n" ] || SV+=("sv-$d")
done
[ ${#SV[@]} -eq 0 ] || W="$W" RW=${R}silinx-846 bash fuzz-remote.sh -P 3 "${SV[@]}"
for d in $DESIGNS; do PART=xc3s250ecp132-4 node ana-sitevar.mjs "$W/sv-$d" > "$W/sv-$d.out.json" 2> "$W/sv-$d.report.txt"; cat "$W/sv-$d.report.txt"; done
# the features: the bits a variant cleared (the HIGH value's own; LOW sets none), the one pattern of its buffer
node -e '
  const fs = require("fs"), [W, ...designs] = process.argv.slice(1);
  const types = {}, odd = [];
  for (const d of designs) {
    const { feats } = JSON.parse(fs.readFileSync(`${W}/sv-${d}.out.json`, "utf8"));
    for (const [t, vs] of Object.entries(feats)) for (const [v, pats] of Object.entries(vs)) {
      const bits = (pats[0]?.[0] || "").split(" ").filter(Boolean);
      if (pats.length !== 1 || bits.some(b => !b.startsWith("!"))) odd.push(`${d} ${t} ${v}: ${JSON.stringify(pats)}`);
      ((types[t] ||= { features: {} }).features)[`BUFGMUX_${v.slice(2)}:DISABLE_ATTR:HIGH`] = bits.map(b => b.slice(1)).sort();
    }
  }
  if (odd.length) { console.error(`not one pattern of cleared bits:\n${odd.join("\n")}`); process.exit(1); }
  fs.writeFileSync(`${W}/fix-29-bufgmux1.json`, JSON.stringify({ source: "#846 (research/s3e-bitstream/measure-846.sh): a BUFGMUX_1 on each of the 24 global buffers of the XC3S250E (6 designs implemented by ISE from HDL, gen-sidebufg.mjs bufgmux1-846.json), DISABLE_ATTR set back to LOW on one buffer at a time (gen-sitevar.mjs, ana-sitevar.mjs): the bits of DISABLE_ATTR HIGH", types }, null, 1) + "\n");
  console.log(Object.entries(types).map(([t, x]) => `${t}: ${Object.entries(x.features).map(([f, b]) => `${f} ${b.join(" ")}`).join(", ")}`).join("\n"));
' "$W" $DESIGNS
echo "features in $W/fix-29-bufgmux1.json"
