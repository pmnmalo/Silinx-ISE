// The scripts' sourcing of ISE's settings (ISE_SETTINGS, settings64.sh) when a tool of ISE is not on the PATH: never a
// file of the build folder (its files come from the project, #3032), its real path checked with every link followed.
// The ISE flow's run.sh (server/ise.js) and the device report's (server/open-flow.js, #3407) share it.

/** The bash lines that source ISE's settings when `tool` is not found (the script runs in its build folder). */
export function sourceSettingsSh(tool, defaultSettings) {
  return `if ! command -v ${tool} >/dev/null 2>&1; then
  ISE_SETTINGS="\${ISE_SETTINGS:-${defaultSettings}}"
  if [ -f "$ISE_SETTINGS" ]; then
    # never a file of the build folder (its files come from the project, #3032): its real path,
    # every link followed, outside this folder's real path
    real_path() {
      f="$1"; n=0
      while :; do
        d="$(cd -P "$(dirname "$f")" 2>/dev/null && pwd -P)" || return 1
        f="$d/$(basename "$f")"
        [ -L "$f" ] || break
        l="$(readlink "$f")" || return 1
        case "$l" in /*) f="$l" ;; *) f="$d/$l" ;; esac
        n=$((n + 1)); [ "$n" -lt 40 ] || return 1
      done
      printf '%s\\n' "$f"
    }
    here="$(pwd -P)"
    real="$(real_path "$ISE_SETTINGS")" || real=""
    case "$real" in
      ""|"$here"/*)
        echo "ERROR: ISE_SETTINGS ($ISE_SETTINGS) is a file of the build folder: not sourced." >&2
        exit 126 ;;
    esac
    # settings64.sh takes $1 as the install dir: source it with no positional arguments.
    set --
    # shellcheck disable=SC1090
    . "$ISE_SETTINGS" >/dev/null 2>&1
  fi
fi`;
}
