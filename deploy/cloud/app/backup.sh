#!/bin/sh
# Nightly pg_dump of the Ozvi database at 02:30 local time (TZ); dumps older than KEEP days are pruned.
set -u
while true; do
  now=$(date +%s)
  next=$(date -d "$(date +%F) 02:30" +%s)
  [ "$next" -le "$now" ] && next=$((next + 86400))
  sleep $((next - now))
  f="/backups/ozvi-$(date +%F-%H%M).dump"
  if pg_dump -h postgres -U postgres -Fc -f "$f.part" ozvi && mv "$f.part" "$f"; then
    echo "backup $f"
  else
    echo "backup FAILED"
    rm -f -- "$f.part"
  fi
  find /backups -maxdepth 1 -name 'ozvi-*.dump' -mtime "+${KEEP:-14}" -delete
done
