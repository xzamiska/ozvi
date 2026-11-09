#!/bin/sh
# Run docker compose for one cloud environment: ./ozvi-env.sh <live|staging> <compose args…>
#   ./ozvi-env.sh staging up -d
#   ./ozvi-env.sh live logs -f ozvi
# The repository is checked out once (OZVI_REPO, default the directory above deploy/); each environment
# keeps its .env and backups in $OZVI_ENVS/<env> (default /srv/ozvi-env).
set -eu
[ $# -ge 1 ] || { echo "usage: $0 <live|staging> <compose args…>" >&2; exit 2; }
env=$1; shift
case "$env" in live|staging) ;; *) echo "environment must be live or staging" >&2; exit 2 ;; esac
here=$(cd "$(dirname "$0")" && pwd)
repo=${OZVI_REPO:-$(cd "$here/../.." && pwd)}
dir=${OZVI_ENVS:-/srv/ozvi-env}/$env
[ -f "$dir/.env" ] || { echo "missing $dir/.env (copy deploy/cloud/app/.env.example)" >&2; exit 1; }
mkdir -p "$dir/backups"
export OZVI_INITDB="$repo/deploy/initdb" OZVI_BACKUP_SCRIPT="$repo/deploy/cloud/app/backup.sh"
exec docker compose -p "ozvi-$env" -f "$repo/deploy/cloud/app/compose.yml" --project-directory "$dir" --env-file "$dir/.env" "$@"
