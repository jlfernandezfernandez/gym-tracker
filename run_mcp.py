#!/usr/bin/env python3
"""Wrapper to run the gym-tracker MCP server with SSE transport (e.g. on Coolify)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "mcp"))

from gym_tracker_mcp import mcp

port = int(os.getenv("MCP_PORT", "8001"))
print(f"Starting gym-tracker MCP on port {port} (SSE)", flush=True)
mcp.run(transport="sse", host="0.0.0.0", port=port)
