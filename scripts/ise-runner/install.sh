#!/bin/sh
# Installs the ISE runner's protections (#482) on the runner's machine (macOS):
#   - job-started.sh as the runner's job-started hook (ACTIONS_RUNNER_HOOK_JOB_STARTED in its .env):
#     every job but ise.yml's and quality.yml's of main fails before its first step;
#   - window.mjs, every 15 minutes and at start: the runner on line only in the ISE and Quality
#     workflows' window.
# The scripts are copied out of the repository (a job's checkout must not change them): run it again
# after they change.
#
# Two ways to run the runner; --system is the one to use (#1442):
#   sudo sh scripts/ise-runner/install.sh --system <user> <the runner's folder>
#       the runner as a dedicated standard user with no keys or tokens (#482): a launchd daemon run as
#       <user>, started and stopped by the window, a daemon of root whose scripts and Node.js are copied
#       where <user> cannot change them. Its jobs' temporary files stay in the runner's folder
#       (TMPDIR), the folder Docker Desktop shares, and they reach Docker through its socket;
#   sh scripts/ise-runner/install.sh <the runner's folder>
#       the runner's service as the logged-in user (svc.sh's launchd agent), the window an agent of the
#       same user: the hook's copy and the runner's .env belong to that user, so a job that does run
#       (main's ise.yml, quality.yml) could change or remove them; a warning says so. For a try, not
#       for the machine that runs the nightly;
#   sh scripts/ise-runner/install.sh --docker-acl <user>
#       run by the user of Docker Desktop: a launchd agent that lets <user> use Docker Desktop's socket,
#       again each time Docker Desktop makes it anew.
#   --uninstall before any of them removes what it installed.
# After a run that looks wrong (a job that should not have run, a design that is not ours), clear the
# runner user's silinx-cache folder (the quality comparison's design corpus, under that user's home: it
# persists from run to run; the next run fetches it anew) and its _work folder, and run install.sh again.
set -eu
uninstall=no
if [ "${1:-}" = --uninstall ]; then uninstall=yes; shift; fi
SRC=$(cd "$(dirname "$0")" && pwd)
LAUNCHCTL=${SILINX_RUNNER_LAUNCHCTL:-launchctl}
LIBRARY=${SILINX_RUNNER_LIBRARY:-/Library}
WINDOW=com.github.pmnmalo.silinx-ise.runner-window
PATHS=/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:/opt/homebrew/bin

# ---------------------------------------------------------------- Docker's socket for the runner's user
if [ "${1:-}" = --docker-acl ]; then
  RUSER=${2:?usage: install.sh [--uninstall] --docker-acl USER}
  SOCK=${SILINX_DOCKER_SOCKET:-$HOME/.docker/run/docker.sock}
  LABEL=com.github.pmnmalo.silinx-ise.docker-acl
  PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
  ACE="user:$RUSER allow read,write"
  $LAUNCHCTL bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  if [ $uninstall = yes ]; then
    rm -f "$PLIST"
    chmod -a "$ACE" "$SOCK" 2>/dev/null || true
    echo "Uninstalled: $RUSER no longer reaches Docker's socket."
    exit 0
  fi
  # it waits for the socket (Docker Desktop's restart removes it, then makes it anew), and runs every 5 minutes too:
  # a run while it was gone and an event launchd dropped left the runner without Docker (#1799). It adds the ACL
  # only when it is missing: removing it to add it again left the runner without Docker for an instant (#2268)
  mkdir -p "$HOME/Library/LaunchAgents"
  cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>/bin/sh</string><string>-c</string><string>i=0; until [ -S '$SOCK' ] || [ \$i -ge 60 ]; do sleep 1; i=\$((i+1)); done; ls -le '$SOCK' | grep -qF '$ACE' || chmod +a '$ACE' '$SOCK'</string></array>
  <key>WatchPaths</key><array><string>$(dirname "$SOCK")</string></array>
  <key>StartInterval</key><integer>300</integer>
  <key>RunAtLoad</key><true/>
</dict>
</plist>
PLIST
  $LAUNCHCTL bootstrap "gui/$(id -u)" "$PLIST"
  echo "Installed: $RUSER may use $SOCK (again after each start of Docker Desktop). Check:"
  echo "  sudo -u $RUSER docker -H unix://$SOCK version"
  exit 0
fi

# ---------------------------------------------------------------- the runner as a dedicated user
if [ "${1:-}" = --system ]; then
  RUSER=${2:?usage: install.sh [--uninstall] --system USER RUNNER_FOLDER}
  RUNNER_DIR=$(cd "${3:?usage: install.sh [--uninstall] --system USER RUNNER_FOLDER}" && pwd)
  [ "$LIBRARY" != /Library ] || [ "$(id -u)" = 0 ] || { echo "--system: run it with sudo" >&2; exit 1; }
  [ -f "$RUNNER_DIR/bin/runsvc.sh" ] && [ -f "$RUNNER_DIR/.runner" ] || { echo "$RUNNER_DIR: not a configured runner (no bin/runsvc.sh / .runner)" >&2; exit 1; }
  CHOWN=${SILINX_RUNNER_CHOWN:-chown}
  RHOME=${SILINX_RUNNER_HOME:-$(dscl . -read "/Users/$RUSER" NFSHomeDirectory | sed 's/^NFSHomeDirectory: //')}
  # no whitespace in the path: the runner runs its hook unquoted (#891)
  DEST="$LIBRARY/Silinx-ISE-runner"
  OLD="$LIBRARY/Application Support/Silinx-ISE-runner"
  RUNNER=com.github.pmnmalo.silinx-ise.runner
  RPLIST="$LIBRARY/LaunchDaemons/$RUNNER.plist"
  WPLIST="$LIBRARY/LaunchDaemons/$WINDOW.plist"
  ENVF="$RUNNER_DIR/.env"
  $LAUNCHCTL bootout "system/$WINDOW" 2>/dev/null || true
  $LAUNCHCTL bootout "system/$RUNNER" 2>/dev/null || true
  touch "$ENVF"
  grep -v -E '^(ACTIONS_RUNNER_HOOK_JOB_STARTED|TMPDIR|DOCKER_HOST)=' "$ENVF" > "$ENVF.tmp" || true
  mv "$ENVF.tmp" "$ENVF"
  rm -rf "$OLD"
  if [ $uninstall = yes ]; then
    rm -f "$RPLIST" "$WPLIST"
    rm -rf "$DEST"
    echo "Uninstalled: the runner's daemon and the window removed."
    exit 0
  fi
  # root's copies: neither the runner's user nor a job can change what root runs
  node=$(ls -d "$RUNNER_DIR"/externals/node*/bin/node 2>/dev/null | sort -V | tail -n 1)
  [ -n "$node" ] || { echo "$RUNNER_DIR: no externals/node*/bin/node" >&2; exit 1; }
  mkdir -p "$DEST" "$LIBRARY/LaunchDaemons"
  cp "$SRC/job-started.sh" "$SRC/window.sh" "$SRC/window.mjs" "$node" "$DEST/"
  chmod 755 "$DEST" "$DEST/job-started.sh" "$DEST/window.sh" "$DEST/node"
  chmod 644 "$DEST/window.mjs"
  $CHOWN -R root:wheel "$DEST"
  # the service's script, as svc.sh install makes it (svc.sh's own agent is not used)
  [ -f "$RUNNER_DIR/runsvc.sh" ] || { cp "$RUNNER_DIR/bin/runsvc.sh" "$RUNNER_DIR/runsvc.sh"; chmod 755 "$RUNNER_DIR/runsvc.sh"; }
  # the PATH runsvc.sh exports to the runner (config.sh run with sudo leaves sudo's, without Docker's CLI, #904)
  echo "$PATHS" > "$RUNNER_DIR/.path"
  mkdir -p "$RUNNER_DIR/_tmp" "$RUNNER_DIR/_diag"
  $CHOWN "$RUSER" "$RUNNER_DIR/_tmp" "$RUNNER_DIR/_diag" "$RUNNER_DIR/runsvc.sh" "$RUNNER_DIR/.path" "$ENVF"
  {
    echo "ACTIONS_RUNNER_HOOK_JOB_STARTED=$DEST/job-started.sh"
    echo "TMPDIR=$RUNNER_DIR/_tmp"
    echo "DOCKER_HOST=unix://${SILINX_DOCKER_SOCKET:-/var/run/docker.sock}"
  } >> "$ENVF"
  cat > "$RPLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$RUNNER</string>
  <key>UserName</key><string>$RUSER</string>
  <key>GroupName</key><string>staff</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$RUNNER_DIR/runsvc.sh</string></array>
  <key>WorkingDirectory</key><string>$RUNNER_DIR</string>
  <key>EnvironmentVariables</key>
  <dict><key>HOME</key><string>$RHOME</string><key>PATH</key><string>$PATHS</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>StandardOutPath</key><string>$RUNNER_DIR/_diag/launchd.log</string>
  <key>StandardErrorPath</key><string>$RUNNER_DIR/_diag/launchd.log</string>
</dict>
</plist>
PLIST
  cat > "$WPLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$WINDOW</string>
  <key>ProgramArguments</key>
  <array><string>/bin/sh</string><string>$DEST/window.sh</string><string>tick</string></array>
  <key>EnvironmentVariables</key>
  <dict><key>RUNNER_DIR</key><string>$RUNNER_DIR</string><key>RUNNER_DAEMON</key><string>$RPLIST</string><key>STATE_DIR</key><string>$DEST</string><key>PATH</key><string>$PATHS</string></dict>
  <key>StartInterval</key><integer>900</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$DEST/window.log</string>
  <key>StandardErrorPath</key><string>$DEST/window.log</string>
</dict>
</plist>
PLIST
  chmod 644 "$RPLIST" "$WPLIST"
  $CHOWN root:wheel "$RPLIST" "$WPLIST"
  # the window starts the runner's daemon when its window is open
  $LAUNCHCTL bootstrap system "$WPLIST"
  echo "Installed in $DEST, the runner as $RUSER. Check:"
  echo "  sudo RUNNER_DIR=\"$RUNNER_DIR\" RUNNER_DAEMON=\"$RPLIST\" STATE_DIR=\"$DEST\" sh \"$DEST/window.sh\" status"
  echo "  then Actions > ISE > Run workflow: its log says 'Silinx ISE runner: ... allowed' (the hook ran)."
  exit 0
fi

# ---------------------------------------------------------------- the runner as the logged-in user
RUNNER_DIR=$(cd "${1:?usage: install.sh [--uninstall] RUNNER_FOLDER}" && pwd)
[ -x "$RUNNER_DIR/svc.sh" ] && [ -f "$RUNNER_DIR/.runner" ] || { echo "$RUNNER_DIR: not a configured runner (no svc.sh / .runner)" >&2; exit 1; }
# no whitespace in the path: the runner runs its hook unquoted (#891)
DEST="$HOME/Library/Silinx-ISE-runner"
LABEL=$WINDOW
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
ENVF="$RUNNER_DIR/.env"

$LAUNCHCTL bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
rm -rf "$HOME/Library/Application Support/Silinx-ISE-runner"
touch "$ENVF"
grep -v '^ACTIONS_RUNNER_HOOK_JOB_STARTED=' "$ENVF" > "$ENVF.tmp" || true
mv "$ENVF.tmp" "$ENVF"
if [ $uninstall = yes ]; then
  rm -f "$PLIST"
  (cd "$RUNNER_DIR" && ./svc.sh stop >/dev/null 2>&1 || true; ./svc.sh start)
  echo "Uninstalled: the hook and the window removed, the runner on line as before."
  exit 0
fi

# this user owns the hook's copy and .env, as the jobs do (#1442): --system is the mode for the machine that runs the nightly
echo "WARNING: without --system the hook and the runner's .env belong to $(id -un), the user the jobs run as; use 'sudo sh $0 --system <user> <the runner's folder>' (see the header) on the machine that runs the nightly." >&2
mkdir -p "$DEST" "$HOME/Library/LaunchAgents"
cp "$SRC/job-started.sh" "$SRC/window.sh" "$SRC/window.mjs" "$DEST/"
chmod 755 "$DEST/job-started.sh" "$DEST/window.sh"
echo "ACTIONS_RUNNER_HOOK_JOB_STARTED=$DEST/job-started.sh" >> "$ENVF"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>/bin/sh</string><string>$DEST/window.sh</string><string>tick</string></array>
  <key>EnvironmentVariables</key>
  <dict><key>RUNNER_DIR</key><string>$RUNNER_DIR</string><key>PATH</key><string>$PATHS</string></dict>
  <key>StartInterval</key><integer>900</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$DEST/window.log</string>
  <key>StandardErrorPath</key><string>$DEST/window.log</string>
</dict>
</plist>
PLIST
# the runner reads its .env when it starts
(cd "$RUNNER_DIR" && ./svc.sh stop >/dev/null 2>&1 || true; ./svc.sh start)
$LAUNCHCTL bootstrap "gui/$(id -u)" "$PLIST"
echo "Installed in $DEST. Check:"
echo "  RUNNER_DIR=\"$RUNNER_DIR\" sh \"$DEST/window.sh\" status"
echo "  then Actions > ISE > Run workflow: its log says 'Silinx ISE runner: ... allowed' (the hook ran)."
