# Device descriptions shipped with Silinx

`<part>.json.gz`: the routing graph of a device (its tiles, sites, wires and routing switches) in
Silinx's own packed format (`core/fpga/device.js`, `packDevice`), used by the Silinx toolchain's
placer, router and bitstream writer (`core/fpga/`).

| File | Device | Board |
|---|---|---|
| `xc3s100ecp132-4.json.gz` | XC3S100E, CP132 package (any speed grade) | Digilent Basys2-100 |
| `xc3s250ecp132-4.json.gz` | XC3S250E, CP132 package (any speed grade) | Digilent Basys2-250 |
| `xc3s500efg320-4.json.gz` | XC3S500E, FG320 package (any speed grade) | Digilent Nexys2-500, Xilinx Spartan-3E Starter Kit |
| `xc3s1200efg320-4.json.gz` | XC3S1200E, FG320 package (any speed grade) | Digilent Nexys2-1200 |
| `xc6slx16csg324-3.json.gz` | XC6SLX16, CSG324 package (any speed grade) | Digilent Nexys3 (the Spartan-6 toolchain under development, #1) |
| `xc6slx45csg324-3.json.gz` | XC6SLX45, CSG324 package (any speed grade) | Digilent Atlys (the same) |

The Silinx toolchain writes bitstreams for the devices that also have a bit database
(packages/silinx-fpga/bitdb): the four Spartan-3E ones, for these packages. The Spartan-6 ones have none yet
(research/s6/README.md).

Each file was computed by Silinx from the output of ISE 14.7's documented
`xdl -report -pips -all_conns <part>` command (`xdl` P.20131013), with
`research/s3e-route/build-device.mjs`. It is not that report, nor any file of ISE's installation.
For any other device, Silinx builds the description once from the user's own ISE installation and
keeps it in `~/.silinx/devices/`, which takes precedence over the files here. See
[docs/OPEN-TOOLCHAIN.md](../../../docs/OPEN-TOOLCHAIN.md).
