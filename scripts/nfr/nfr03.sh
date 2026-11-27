#!/usr/bin/env bash
# NFR-03 compressed run (S13-3): 50 Manual Events whose Reminders fall one per minute,
# then a tick every minute from this PC until the last Reminder is due plus 2 minutes.
# Usage: KAL_TEST_PASSWORD=... TICK_SECRET=... scripts/nfr/nfr03.sh <deployment URL> [count]
# Writes the throwaway account's email and a tick log to stdout. Prints no secret.
set -euo pipefail
DEP=${1:?deployment URL}
N=${2:-50}
: "${KAL_TEST_PASSWORD:?}" "${TICK_SECRET:?}"
JAR=$(mktemp)
EMAIL="s13-nfr03-$(date +%s)@test.kalender.app"

vc() { local path=$1; shift; vercel curl "$DEP$path" -- -s -b "$JAR" -c "$JAR" "$@" 2>/dev/null; }

vc /api/auth/register -o /dev/null -w "register %{http_code}\n" -X POST -H 'Content-Type: application/json' \
  --data "{\"email\":\"$EMAIL\",\"password\":\"$KAL_TEST_PASSWORD\"}"
echo "account $EMAIL"

# First Reminder 3 minutes from now; Event = Reminder + 30 minutes (the default Lead Time). Times in PKT (UTC+5).
now=$(date +%s)
first=$(( (now / 60 + 3) * 60 ))
for i in $(seq 0 $((N - 1))); do
  ev=$(( first + i * 60 + 30 * 60 + 5 * 3600 ))
  d=$(date -u -d "@$ev" +%F); t=$(date -u -d "@$ev" +%H:%M)
  vc /api/events -o /dev/null -w "event $i $d $t %{http_code}\n" -X POST -H 'Content-Type: application/json' \
    --data "{\"title\":\"NFR-03 check $((i + 1))\",\"date\":\"$d\",\"time\":\"$t\"}"
done

last=$(( first + (N - 1) * 60 ))
echo "first reminder $(date -u -d "@$first" +%FT%TZ), last $(date -u -d "@$last" +%FT%TZ)"
while :; do
  next=$(( ($(date +%s) / 60 + 1) * 60 + 2 ))
  (( next > last + 120 )) && break
  sleep $(( next - $(date +%s) ))
  ( out=$(vercel curl "$DEP/internal/tick" -- -s -X POST -H "Authorization: Bearer $TICK_SECRET" -w ' %{http_code} %{time_total}s' 2>/dev/null)
    echo "tick $(date -u -d "@$next" +%FT%TZ) $out" ) &
done
wait
rm -f "$JAR"
echo done
