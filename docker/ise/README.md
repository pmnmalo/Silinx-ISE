# Xilinx ISE 14.7 toolchain for Silinx (Docker builder kit)

Silinx simulates, draws schematics and programs boards on its own, but **synthesis, place & route
and bitstream generation for Spartan-3E need Xilinx ISE 14.7** — there is no open-source
alternative for this family. ISE runs only on x86-64 Linux/Windows, so Silinx runs it inside a
Docker container on every platform.

> **Why there is no ready-made image:** ISE WebPACK is free, but the AMD/Xilinx license agreement
> does not allow redistributing the software or license files. Each user downloads the installer
> with their own AMD account and builds a **private** image with this kit (one command). Never push
> the resulting image to a public registry.

## What you need

1. **Docker**
   | Platform | Install | Notes |
   |---|---|---|
   | Windows 10/11 (x86-64) | Docker Desktop (WSL 2 backend) | native x86-64 |
   | Windows on ARM | Docker Desktop | x86-64 emulation (slow) |
   | macOS Intel | Docker Desktop, OrbStack or Colima | native x86-64 |
   | macOS Apple Silicon | OrbStack (recommended), Docker Desktop with *Use Rosetta for x86_64/amd64 emulation*, or Colima `colima start --vm-type vz --vz-rosetta` | ISE runs under Rosetta; a full build of a small design takes ~5 min |
   | Linux x86-64 | Docker Engine (+ buildx) | native |
   | Linux ARM64 | Docker Engine + `docker run --privileged --rm tonistiigi/binfmt --install amd64` | QEMU emulation (slow) |

   About 30 GB of free disk space during the build (the final image is ~15 GB).

2. **The ISE installer**: on the AMD download site, *ISE Design Suite 14.7 – Full Installer for Linux*,
   file `Xilinx_ISE_DS_Lin_14.7_1015_1.tar` (6.5 GB, MD5 `e8065b2ffb411bb74ae32efa475f9817`).
   Use the Linux installer on every platform, including Windows and macOS.

3. **A free WebPACK license**: on the AMD/Xilinx product licensing site, request an *ISE WebPACK
   License* and download `Xilinx.lic`. WebPACK licenses are `HOSTID=ANY`, so they work in containers.

## Build the image

macOS / Linux:
```bash
docker/ise/build-ise-image.sh --installer ~/Downloads/Xilinx_ISE_DS_Lin_14.7_1015_1.tar --license ~/Downloads/Xilinx.lic
```

Windows (PowerShell):
```powershell
powershell -ExecutionPolicy Bypass -File docker\ise\build-ise-image.ps1 -Installer $HOME\Downloads\Xilinx_ISE_DS_Lin_14.7_1015_1.tar -License $HOME\Downloads\Xilinx.lic
```

The script checks the installer checksum and x86-64 emulation, builds `silinx/ise:14.7`
(20–60 minutes, once), synthesizes a test design to confirm the license works, and configures
Silinx to use the image. Without arguments it looks for both files in `~/Downloads`.

**Image size.** By default the install is trimmed to what the command-line flow uses
(`trim-ise.sh`): EDK, PlanAhead, CORE Generator, SysGen, simulation libraries, documentation and
the GUIs are removed, taking ISE from about 18 GB to about 3 GB while keeping every device family.
Options (`.ps1`: `-Full`, `-Families`):

| Option | Effect |
|---|---|
| *(default)* | trimmed, all device families |
| `--families "spartan3e spartan6"` | trimmed, only these families' device data (the families they depend on are kept) |
| `--full` | complete ISE WebPACK install, including the Project Navigator GUI and CORE Generator |

Then in Silinx: *Process ▸ Implement Top Module* or double-click *Generate Programming File*.

## Using the image directly

```bash
docker run --rm -v "$PWD:/work" silinx/ise:14.7 xst -help          # any ISE command-line tool
docker run --rm -v "$PWD:/work" silinx/ise:14.7 bash run.sh        # a Silinx build directory
```

The image runs under any user ID (`--user`), loads `settings64.sh` automatically and has the
license at `/opt/Xilinx/Xilinx.lic` (`XILINXD_LICENSE_FILE`). Device programming is done by
Silinx on the host (USB), not inside the container.

## Files

| File | Purpose |
|---|---|
| `Dockerfile` | Ubuntu 14.04 + ISE 14.7 WebPACK installed with `batchxsetup`; the installer is bind-mounted (never stored in a layer) |
| `install-config.txt` | unattended-install options (WebPACK, no cable drivers) |
| `entrypoint.sh` | sets up `$HOME`, sources `settings64.sh`, runs the command |
| `trim-ise.sh` | removes what the command-line flow does not use (run during the build unless `--full`) |
| `build-ise-image.sh` / `.ps1` | build + test + configure Silinx (macOS/Linux / Windows) |
