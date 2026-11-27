#!/usr/bin/env bash
# NFR-02 run (S13-2): uploads each export in <dir> as a new Approved Chat (7-day Look-back) with one
# throwaway account, then asks for the Detected Events list. The time per upload is curl's own
# time for the upload request plus the list request, so it includes the file transfer but not the
# start-up of the vercel CLI. Prints a Markdown table. Prints no secret.
# Usage: KAL_TEST_PASSWORD=... scripts/nfr/nfr02.sh <deployment URL> <dir>
set -euo pipefail
DEP=${1:?deployment URL}
DIR=${2:?export dir}
: "${KAL_TEST_PASSWORD:?}"
JAR=$(mktemp); BODY=$(mktemp)
EMAIL="s13-nfr02-$(date +%s)@test.kalender.app"
vc() { local path=$1; shift; vercel curl "$DEP$path" -- -s -b "$JAR" -c "$JAR" "$@" 2>/dev/null; }

vc /api/auth/register -o /dev/null -w "register %{http_code}\n" -X POST -H 'Content-Type: application/json' \
  --data "{\"email\":\"$EMAIL\",\"password\":\"$KAL_TEST_PASSWORD\"}"
echo "account $EMAIL"
echo
echo "| Upload | Lines | Status | Messages read | Detected Events | Upload (s) | List (s) | Total (s) | Within 60 s |"
echo "|---|---|---|---|---|---|---|---|---|"
n=0; ok=0
for f in "$DIR"/*.txt; do
  n=$((n + 1))
  name=$(basename "$f" .txt); name=${name#WhatsApp Chat with }
  up=$(vc /api/chats -o "$BODY" -w '%{http_code} %{time_total}' -X POST -F "file=@$f" -F "name=$name" -F lookBackDays=7)
  read -r code tup <<<"$up"
  read -r read detected < <(python -I -c 'import json,sys; b=json.load(open(sys.argv[1])); print(b.get("messagesRead","-"), b.get("detectedEvents","-"))' "$BODY" 2>/dev/null || echo "- -")
  tlist=$(vc /api/detected-events -o /dev/null -w '%{time_total}')
  total=$(python -I -c 'import sys; print(f"{float(sys.argv[1]) + float(sys.argv[2]):.1f}")' "$tup" "$tlist")
  within=$(python -I -c 'import sys; print("yes" if float(sys.argv[1]) <= 60 and sys.argv[2] == "201" else "no")' "$total" "$code")
  [[ $within == yes ]] && ok=$((ok + 1))
  echo "| $name | $(wc -l < "$f") | $code | $read | $detected | $tup | $tlist | $total | $within |"
done
echo
echo "$ok of $n uploads showed their Detected Events within 60 seconds; NFR-02 needs at least 19 of 20."
rm -f "$JAR" "$BODY"
