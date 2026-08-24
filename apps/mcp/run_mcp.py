#!/usr/bin/env python3
"""Run the gym-tracker MCP server with Streamable HTTP transport."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# fastmcp reads host/port from global settings at server construction,
# so set them via env before importing the module that builds FastMCP.
os.environ.setdefault("FASTMCP_HOST", "0.0.0.0")
port = int(os.getenv("MCP_PORT", "8001"))
os.environ.setdefault("FASTMCP_PORT", str(port))

from gym_tracker_mcp import mcp

print(f"Starting gym-tracker MCP on port {port} (streamable-http)", flush=True)
mcp.run(transport="streamable-http")
