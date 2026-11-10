#!/bin/sh
# Capture lab links with headless Chrome. Usage: shoot.sh <out-dir> <name> <query> [<name> <query> ...]
# Needs the client dev server on :4173. Example: shoot.sh /tmp/shots meadow 'at=meadow&tab=light'
set -e
out="$1"; shift
mkdir -p "$out"
chrome="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
profile="$out/.chrome-profile"
while [ "$#" -ge 2 ]; do
  name="$1"; query="$2"; shift 2
  "$chrome" --headless=new --user-data-dir="$profile" --use-angle=metal --hide-scrollbars \
    --window-size="${LAB_W:-1600},${LAB_H:-900}" --virtual-time-budget="${LAB_WAIT:-6000}" \
    --screenshot="$out/$name.png" "http://127.0.0.1:4173/proto/lab/?shot=${LAB_CHROME:-1}&$query" >/dev/null 2>&1
  echo "$out/$name.png"
done
