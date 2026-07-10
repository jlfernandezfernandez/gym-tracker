#!/usr/bin/env python3
"""Run the gym-tracker MCP server with Streamable HTTP transport."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "mcp"))

from gym_tracker_mcp import mcp

port = int(os.getenv("MCP_PORT", "8001"))

# FastMCP's current API takes host/port on the server settings, not on run().
# Bind to all interfaces for Coolify/Traefik and disable localhost-only host
# checks because requests arrive with the public app hostname.
mcp.settings.host = "0.0.0.0"
mcp.settings.port = port
mcp.settings.transport_security.enable_dns_rebinding_protection = False

print(f"Starting gym-tracker MCP on port {port} (streamable-http)", flush=True)
mcp.run(transport="streamable-http")
