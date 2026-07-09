#!/bin/sh
# gym-tracker — garage-start.sh
set -eu
umask 077
CONFIG_FILE="/etc/garage/garage.toml"

if [ ! -f "$CONFIG_FILE" ]; then
  echo "Generating Garage configuration..."
  RPC_SECRET="$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')"
  ADMIN_TOKEN="$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')"
  
  cat > "$CONFIG_FILE" <<EOF
metadata_dir = "/var/lib/garage/meta"
data_dir = "/var/lib/garage/data"
metadata_snapshots_dir = "/var/lib/garage/snapshots"
metadata_auto_snapshot_interval = "6h"
db_engine = "sqlite"
replication_factor = 1
block_size = "1M"
rpc_bind_addr = "[::]:3901"
rpc_public_addr = "127.0.0.1:3901"
rpc_secret = "$RPC_SECRET"
[s3_api]
api_bind_addr = "[::]:3900"
s3_region = "garage"
[admin]
api_bind_addr = "[::]:3903"
admin_token = "$ADMIN_TOKEN"
metrics_token = "$ADMIN_TOKEN"
metrics_require_token = true
EOF
  chmod 600 "$CONFIG_FILE"
fi

echo "Starting Garage server..."
exec /garage -c "$CONFIG_FILE" server
