#!/usr/bin/env bash
# Command-level regression for AnnotaMD external open routing.
#
# This exercises the LaunchServices path with `open -a <app> <url>` and checks
# relative window-count changes. It is not a full replacement for Finder manual
# QA, but it catches duplicate-window regressions for repeated same-URL opens.
#
# Usage:
#   scripts/open-request-regression.sh [path/to/AnnotaMD.app]
#
# Optional:
#   ANNOTAMD_RESET_DEFAULTS=1 scripts/open-request-regression.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_PATH="${1:-$ROOT_DIR/AnnotaMD.app}"
APP_PATH="$(cd "$(dirname "$APP_PATH")" && pwd)/$(basename "$APP_PATH")"
BUNDLE_ID="com.xielintao.annotamd"
APP_PROCESS="AnnotaMD"

if [[ ! -d "$APP_PATH" ]]; then
  echo "❌ App bundle not found: $APP_PATH" >&2
  echo "   Build it first, e.g. VERSION_OVERRIDE=2.0.15-open-routing ./build-app.sh" >&2
  exit 1
fi

TMP_DIR="$(mktemp -d /tmp/annotamd-open-regression.XXXXXX)"
cleanup() {
  kill_app
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

cat > "$TMP_DIR/count_annotamd_windows.swift" <<'SWIFT'
import AppKit
import Foundation

let owner = CommandLine.arguments.dropFirst().first ?? "AnnotaMD"
let pid = CommandLine.arguments.dropFirst(2).first.flatMap(Int.init)
let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
let list = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] ?? []
let matches = list.filter { info in
    (info[kCGWindowOwnerName as String] as? String) == owner &&
    ((info[kCGWindowLayer as String] as? Int) ?? -1) == 0 &&
    (pid == nil || (info[kCGWindowOwnerPID as String] as? Int) == pid)
}
print(matches.count)
SWIFT
swiftc "$TMP_DIR/count_annotamd_windows.swift" -o "$TMP_DIR/count_annotamd_windows"

cat > "$TMP_DIR/perform_annotamd_service.swift" <<'SWIFT'
import AppKit
import Foundation

let path = CommandLine.arguments[1]
let serviceNames: [String]
if CommandLine.arguments.count > 2 {
    serviceNames = [CommandLine.arguments[2]]
} else {
    serviceNames = [
        "用 AnnotaMD 打开",
        "Open with AnnotaMD",
        "用 AnnotaMD 開啟"
    ]
}
let pasteboard = NSPasteboard(name: NSPasteboard.Name("AnnotaMDServiceRegression-\(UUID().uuidString)"))
pasteboard.clearContents()
let url = URL(fileURLWithPath: path)
pasteboard.setPropertyList([path], forType: NSPasteboard.PasteboardType("NSFilenamesPboardType"))
guard pasteboard.writeObjects([url as NSURL]) else {
    fputs("failed to write pasteboard\n", stderr)
    exit(2)
}
for serviceName in serviceNames {
    if NSPerformService(serviceName, pasteboard) {
        print("performed: \(serviceName)")
        exit(0)
    }
}
print("not-performed: \(serviceNames.joined(separator: ", "))")
exit(1)
SWIFT
swiftc "$TMP_DIR/perform_annotamd_service.swift" -o "$TMP_DIR/perform_annotamd_service"

current_app_pid() {
  pgrep -nx "$APP_PROCESS" || true
}

count_windows() {
  local pid="${1:-$(current_app_pid)}"
  "$TMP_DIR/count_annotamd_windows" "$APP_PROCESS" "$pid" | tail -n 1 | tr -d '[:space:]'
}

kill_app() {
  pkill -TERM -x "$APP_PROCESS" >/dev/null 2>&1 || true
  for _ in {1..20}; do
    if ! pgrep -x "$APP_PROCESS" >/dev/null 2>&1; then
      return
    fi
    sleep 0.1
  done
  pkill -KILL -x "$APP_PROCESS" >/dev/null 2>&1 || true
  sleep 1.2
}

canonical_path() {
  python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$1"
}

assert_eq() {
  local actual="$1"
  local expected="$2"
  local label="$3"
  if [[ "$actual" != "$expected" ]]; then
    echo "❌ $label: expected $expected, got $actual" >&2
    exit 1
  fi
  echo "✅ $label: $actual"
}

assert_gt() {
  local actual="$1"
  local baseline="$2"
  local label="$3"
  if (( actual <= baseline )); then
    echo "❌ $label: expected > $baseline, got $actual" >&2
    exit 1
  fi
  echo "✅ $label: $actual (> $baseline)"
}

mkdir -p "$TMP_DIR/folder"
printf '# A\n' > "$TMP_DIR/a.md"
printf '# B\n' > "$TMP_DIR/b.md"
printf '# Folder file\n' > "$TMP_DIR/folder/index.md"
mkdir -p "$TMP_DIR/restore-a" "$TMP_DIR/cold-folder-b"
printf '# Restored A\n' > "$TMP_DIR/restore-a/index.md"
printf '# Cold Folder B\n' > "$TMP_DIR/cold-folder-b/index.md"
printf '# Delayed B\n' > "$TMP_DIR/delayed-b.md"

kill_app

if [[ "${ANNOTAMD_RESET_DEFAULTS:-0}" == "1" ]]; then
  /usr/bin/defaults delete "$BUNDLE_ID" >/dev/null 2>&1 || true
fi

LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
"$LSREGISTER" -f "$APP_PATH"
/System/Library/CoreServices/pbs -flush >/dev/null 2>&1 || true

# Validate the Services contract generated into the app bundle.
service_types=$(/usr/libexec/PlistBuddy -c 'Print :NSServices:0:NSSendFileTypes' "$APP_PATH/Contents/Info.plist")
if ! grep -q 'public.data' <<<"$service_types" || ! grep -q 'public.folder' <<<"$service_types"; then
  echo "❌ Services NSSendFileTypes must include public.data and public.folder" >&2
  exit 1
fi
echo "✅ Services declares file + folder support"

open "$TMP_DIR/a.md" -a "$APP_PATH"
sleep 3
count_after_a=$(count_windows)
last_file=$(/usr/bin/defaults read "$BUNDLE_ID" com.xielintao.annotamd.lastOpenedFilePath 2>/dev/null || true)
assert_eq "$(canonical_path "$last_file")" "$(canonical_path "$TMP_DIR/a.md")" "cold external file records A"

open "$TMP_DIR/b.md" -a "$APP_PATH"
sleep 2
count_after_b=$(count_windows)
last_file=$(/usr/bin/defaults read "$BUNDLE_ID" com.xielintao.annotamd.lastOpenedFilePath 2>/dev/null || true)
assert_eq "$(canonical_path "$last_file")" "$(canonical_path "$TMP_DIR/b.md")" "hot external file records B"
assert_gt "$count_after_b" "$count_after_a" "different URL opens another visible window"

open "$TMP_DIR/a.md" -a "$APP_PATH"
sleep 2
count_after_repeat_a=$(count_windows)
assert_eq "$count_after_repeat_a" "$count_after_b" "repeat A does not add another window"

open "$TMP_DIR/b.md" -a "$APP_PATH"
sleep 2
count_after_repeat_b=$(count_windows)
assert_eq "$count_after_repeat_b" "$count_after_b" "repeat B does not add another window"

open "$TMP_DIR/folder" -a "$APP_PATH"
sleep 2
last_dir=$(/usr/bin/defaults read "$BUNDLE_ID" com.xielintao.annotamd.lastOpenedDirectory 2>/dev/null || true)
assert_eq "$(canonical_path "$last_dir")" "$(canonical_path "$TMP_DIR/folder")" "external folder records lastOpenedDirectory"


# Simulate the macOS race where the app finishes launching before the explicit
# open event from dragging a file/folder onto the app icon arrives. A direct
# restore must not open the previous A location if B arrives during launch.

# Cold explicit folder open should not create a transient/default welcome or
# restored A window. It should leave only the dragged/opened B folder window.
kill_app
/usr/bin/defaults write "$BUNDLE_ID" com.xielintao.annotamd.reopenLastLocation -bool true
/usr/bin/defaults write "$BUNDLE_ID" com.xielintao.annotamd.lastOpenedDirectory "$(canonical_path "$TMP_DIR/restore-a")"
/usr/bin/defaults delete "$BUNDLE_ID" com.xielintao.annotamd.lastOpenedFilePath >/dev/null 2>&1 || true
open "$TMP_DIR/cold-folder-b" -a "$APP_PATH"
sleep 3
cold_folder_dir=$(/usr/bin/defaults read "$BUNDLE_ID" com.xielintao.annotamd.lastOpenedDirectory 2>/dev/null || true)
assert_eq "$(canonical_path "$cold_folder_dir")" "$(canonical_path "$TMP_DIR/cold-folder-b")" "cold explicit folder suppresses restore"
cold_folder_windows=$(count_windows)
assert_eq "$cold_folder_windows" "1" "cold explicit folder leaves one visible window"

kill_app
/usr/bin/defaults write "$BUNDLE_ID" com.xielintao.annotamd.reopenLastLocation -bool true
/usr/bin/defaults write "$BUNDLE_ID" com.xielintao.annotamd.lastOpenedDirectory "$(canonical_path "$TMP_DIR/restore-a")"
/usr/bin/defaults delete "$BUNDLE_ID" com.xielintao.annotamd.lastOpenedFilePath >/dev/null 2>&1 || true
open -a "$APP_PATH"
sleep 0.6
open "$TMP_DIR/delayed-b.md" -a "$APP_PATH"
sleep 2.2
delayed_file=$(/usr/bin/defaults read "$BUNDLE_ID" com.xielintao.annotamd.lastOpenedFilePath 2>/dev/null || true)
assert_eq "$(canonical_path "$delayed_file")" "$(canonical_path "$TMP_DIR/delayed-b.md")" "delayed explicit open suppresses launch restore"

kill_app
"$TMP_DIR/perform_annotamd_service" "$TMP_DIR/a.md" >/dev/null
sleep 3
service_file=$(/usr/bin/defaults read "$BUNDLE_ID" com.xielintao.annotamd.lastOpenedFilePath 2>/dev/null || true)
assert_eq "$(canonical_path "$service_file")" "$(canonical_path "$TMP_DIR/a.md")" "NSPerformService opens file"

kill_app
"$TMP_DIR/perform_annotamd_service" "$TMP_DIR/folder" >/dev/null
sleep 3
service_dir=$(/usr/bin/defaults read "$BUNDLE_ID" com.xielintao.annotamd.lastOpenedDirectory 2>/dev/null || true)
assert_eq "$(canonical_path "$service_dir")" "$(canonical_path "$TMP_DIR/folder")" "NSPerformService opens folder"

echo "✅ open request command-level regression passed"
