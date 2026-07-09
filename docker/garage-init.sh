#!/bin/sh
# gym-tracker — garage-init.sh
set -eu
CONFIG="/etc/garage/garage.toml"
GARAGE="/garage -c $CONFIG"

echo "Waiting for Garage status to be available..."
for i in $(seq 1 30); do
  # We ignore failures since daemon or node might not be fully up yet
  NODE_ID="$($GARAGE status 2>/dev/null | grep -oE '\b[0-9a-f]{16}\b' | head -n 1)"
  if [ -n "$NODE_ID" ]; then
    break
  fi
  sleep 2
done

if [ -z "$NODE_ID" ]; then
  echo "Error: Timeout waiting for Garage node ID"
  exit 1
fi

echo "Assigning layout to node: $NODE_ID"
$GARAGE layout assign "$NODE_ID" -z dc1 -c 10G || true
$GARAGE layout apply --version 1 || true

echo "Creating bucket gym-tracker-media..."
$GARAGE bucket create gym-tracker-media 2>/dev/null || true

if [ ! -s /run/garage/access_key ]; then
  echo "Creating credentials key..."
  $GARAGE key create gym-tracker > /run/garage/key.txt
  awk '/Key ID:/ {print $3}' /run/garage/key.txt > /run/garage/access_key
  awk '/Secret key:/ {print $3}' /run/garage/key.txt > /run/garage/secret_key
fi

$GARAGE bucket allow --read --write --owner gym-tracker-media --key gym-tracker || true
chmod 600 /run/garage/access_key /run/garage/secret_key
echo "Garage local storage ready"
