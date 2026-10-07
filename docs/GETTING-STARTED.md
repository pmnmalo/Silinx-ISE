# Getting started with Silinx ISE (step by step)

No programming tools or git needed. Pick **one** of the two ways below.

| I want to… | Use |
|---|---|
| write VHDL/Verilog, draw schematics and state machines, **simulate** | **Way 1**: one file, nothing to install |
| also **synthesize** and **program a real board** (Basys2, Nexys, …) | **Way 2**: the full app (installs Node.js once) |

> Português: [COMECAR.md](COMECAR.md)

---

## Way 1: the single file (simplest)

1. Open the **[latest release](https://github.com/pmnmalo/Silinx-ISE/releases/latest)**.
2. Under **Assets**, click **`Silinx-ISE.html`** to download it.
3. Double-click the downloaded file. It opens in your browser (Chrome, Edge, Firefox or Safari).
4. On the Start page click **Open Example (blinky)** or **New Project…**.

That's all. Things to know:

- Your projects are saved **inside this browser** on this computer. To keep a copy or move it to
  another computer use **File ▸ Download Project Bundle** (and **File ▸ Open Project Bundle** to
  load it back). Clearing the browser's data deletes them.
- Synthesis and board programming are not available in this edition (they need Way 2).

---

## Way 2: the full app

### Step 1: install Node.js (once)

Silinx runs on **Node.js**, a free program.

1. Go to **https://nodejs.org** and download the version marked **LTS**.
2. Run the installer and accept the defaults (Next, Next, Install).
   - **Windows:** keep the option *Add to PATH* ticked (it is by default). You do **not** need the
     extra "Tools for native modules".
   - **macOS:** open the downloaded `.pkg` and follow the steps.
   - **Linux:** use your package manager (Ubuntu/Debian: `sudo apt install nodejs npm`) or the
     installer from nodejs.org. Version 18 or newer is needed.

### Step 2: download Silinx

1. Open the **[latest release](https://github.com/pmnmalo/Silinx-ISE/releases/latest)**.
2. Under **Assets**, download **`silinx-ise-<version>.zip`** (for example `silinx-ise-0.2.0.zip`).
   - Don't use the green **Code ▸ Download ZIP** button or "Source code": that version does not
     include everything Silinx needs (it still works, but the first start needs Internet to
     download the missing parts).
3. **Unzip it** (extract it) to a folder you will find again, e.g. *Documents*:
   - **Windows:** right-click the zip ▸ **Extract All…** ▸ Extract. Don't run it from inside the zip.
   - **macOS:** double-click the zip.
   - You get a folder called **`silinx-ise`**.

### Step 3: start Silinx

Open the `silinx-ise` folder and double-click the launcher for your system:

| System | Double-click |
|---|---|
| Windows | **`Start Silinx-ISE.bat`** |
| macOS | **`Start Silinx-ISE.command`** |
| Linux | **`start-silinx-ise.sh`** (or run `./start-silinx-ise.sh` in a terminal) |

A black window (the Silinx server) opens and then your browser shows Silinx at
**http://127.0.0.1:8642**.

- **Keep the black window open** while you work. Closing it stops Silinx.
- Opened the browser tab by mistake? Just go to http://127.0.0.1:8642 again while the window is open.
- Double-clicking the launcher when Silinx is already running just opens the browser again.

**First time only, you may see:**

- **Windows: "Windows protected your PC"**: click **More info ▸ Run anyway**.
- **Windows Firewall** asks about Node.js: click **Allow** (Silinx only listens on your own computer).
- **macOS: "cannot be opened because it is from an unidentified developer"**: right-click
  (or Ctrl-click) `Start Silinx-ISE.command` ▸ **Open** ▸ **Open**. Next time a double-click is enough.

### Step 4: use it

- Start page ▸ **Open Example (blinky)** to explore a complete design, or **New Project…**.
- Your projects are saved as normal folders in **`Silinx-projects`** in your user folder
  (Windows: `C:\Users\<you>\Silinx-projects`, macOS: `/Users/<you>/Silinx-projects`).
  You can copy them, back them up, or zip them to hand in.
- **File ▸ Export ISE Project (.zip)** produces a zip that also opens in Xilinx ISE 14.7.

### Updating Silinx

Download the new `silinx-ise-<version>.zip`, unzip it and use the new folder (you can delete the old
one). **Your projects are not inside that folder**, so they are kept.

---

## Synthesis and programming a board (optional)

These need two more things. Your teacher may provide them already set up.

1. **Xilinx ISE 14.7** (free WebPACK licence) to synthesize and generate the bitstream. On any
   computer it runs inside **Docker**:
   - install [Docker Desktop](https://www.docker.com/products/docker-desktop/) (on Apple Silicon
     Macs, OrbStack is a faster alternative);
   - download `silinx-ise-docker-kit-<version>.zip` from the release and follow its `ise/README.md`:
     you download the ISE installer and licence with your own free AMD account and run one script
     (it takes 20–60 minutes, once). ISE cannot be shared, so everyone builds their own copy.
2. **The board's USB driver** to program it:
   - **Windows:** install Digilent **Adept 2** (Runtime + Utilities) from digilent.com.
   - **macOS (Basys2):** in a Terminal, inside the `silinx-ise` folder, run
     `brew install libusb python` and `./scripts/install-adepttool.sh` (needs [Homebrew](https://brew.sh)).
   - **Linux:** Digilent Adept, or openFPGALoader from your package manager.

In Silinx, **Tools ▸ Toolchain Settings** shows what was found.

---

## Problems?

| What you see | What to do |
|---|---|
| The launcher says **Node.js is not installed** | Install it (Step 1). Then close the window and double-click the launcher again. |
| Browser: **"This site can't be reached"** | The Silinx window was closed: double-click the launcher again. |
| **"Port 8642 is used by another program"** | Another program uses that port. Open a terminal in the `silinx-ise` folder and run `node bin/silinx-ise.js serve --port 8643 --open`. |
| Console: **"the Silinx server is not running"** | Same as above: start Silinx again. Your unsaved changes are saved as soon as it is back. |
| macOS: the `.command` file **opens in a text editor** | Right-click it ▸ Open With ▸ Terminal. |
| The window flashes and closes | Open a terminal in the `silinx-ise` folder and run `node bin/silinx-ise.js serve --open` to read the message. |

**Opening a terminal in a folder:** Windows: open the folder, click the address bar, type `cmd`
and press Enter. macOS: right-click the folder ▸ *New Terminal at Folder* (or open Terminal, type
`cd `, drag the folder into the window and press Enter).

---

## For those who use git

```bash
git clone https://github.com/pmnmalo/Silinx-ISE.git
cd Silinx-ISE
npm install
npm start            # http://127.0.0.1:8642
```
