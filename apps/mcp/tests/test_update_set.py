import json
import os
import sys
import unittest
from unittest.mock import patch

from fastmcp import Client
from fastmcp.exceptions import ToolError

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import gym_tracker_mcp


class UpdateSetContractTests(unittest.IsolatedAsyncioTestCase):
    async def test_clear_flags_are_optional_serializable_booleans(self) -> None:
        async with Client(gym_tracker_mcp.mcp) as client:
            tools = await client.list_tools()
        tool = next(tool for tool in tools if tool.name == "update_set")
        schema = json.loads(json.dumps(tool.inputSchema, allow_nan=False))
        for field in ("weight", "rir", "rpe"):
            with self.subTest(field=field):
                flag = f"clear_{field}"
                self.assertIn(flag, schema["properties"])
                self.assertEqual(schema["properties"][flag]["type"], "boolean")
                self.assertIs(schema["properties"][flag]["default"], False)
                self.assertNotIn(flag, schema.get("required", []))

    async def test_clear_flags_send_explicit_null_without_other_changes(self) -> None:
        cases = [
            ({"clear_weight": True}, {"weight": None}),
            ({"clear_rir": True}, {"rir": None}),
            ({"clear_rpe": True}, {"rpe": None}),
            ({"clear_rir": True, "rpe": 9}, {"rir": None, "rpe": 9}),
            ({"clear_rpe": True, "rir": 0}, {"rpe": None, "rir": 0}),
            ({"rpe": 9}, {"rpe": 9}),
            ({"rir": 0}, {"rir": 0}),
            ({"rpe": 9, "rir": 3}, {"rpe": 9, "rir": 3}),
            ({"clear_rir": True, "clear_rpe": True}, {"rir": None, "rpe": None}),
            (
                {"clear_weight": True, "clear_rir": True, "clear_rpe": True},
                {"weight": None, "rir": None, "rpe": None},
            ),
        ]
        async with Client(gym_tracker_mcp.mcp) as client:
            for changes, expected in cases:
                with self.subTest(changes=changes):
                    with patch.object(
                        gym_tracker_mcp, "_request", return_value={}
                    ) as request:
                        await client.call_tool(
                            "update_set",
                            dict(
                                session_id=1,
                                planned_exercise_id=2,
                                set_id=3,
                                telegram_user_id=7,
                                **changes,
                            ),
                        )
                    request.assert_called_once_with(
                        "PATCH", "/sessions/1/exercises/2/sets/3", expected, user_id=7
                    )

    async def test_omission_none_and_false_flags_preserve_nullable_fields(self) -> None:
        cases = [
            {},
            {"weight": None, "rir": None, "rpe": None},
            {"clear_weight": False, "clear_rir": False, "clear_rpe": False},
        ]
        async with Client(gym_tracker_mcp.mcp) as client:
            for changes in cases:
                with self.subTest(changes=changes):
                    with patch.object(
                        gym_tracker_mcp, "_request", return_value={}
                    ) as request:
                        await client.call_tool(
                            "update_set",
                            dict(
                                session_id=1,
                                planned_exercise_id=2,
                                set_id=3,
                                telegram_user_id=7,
                                reps=12,
                                **changes,
                            ),
                        )
                    request.assert_called_once_with(
                        "PATCH",
                        "/sessions/1/exercises/2/sets/3",
                        {"reps": 12},
                        user_id=7,
                    )

    async def test_clear_flag_conflicts_with_value_before_http(self) -> None:
        async with Client(gym_tracker_mcp.mcp) as client:
            for field, value in (("weight", 42), ("rir", 0), ("rpe", 9)):
                with self.subTest(field=field):
                    with patch.object(gym_tracker_mcp, "_request") as request:
                        with self.assertRaisesRegex(
                            ToolError, f"clear_{field}.*{field}"
                        ):
                            await client.call_tool(
                                "update_set",
                                {
                                    "session_id": 1,
                                    "planned_exercise_id": 2,
                                    "set_id": 3,
                                    "telegram_user_id": 7,
                                    field: value,
                                    f"clear_{field}": True,
                                },
                            )
                    request.assert_not_called()

    async def test_false_flags_allow_values_including_zero_rir(self) -> None:
        async with Client(gym_tracker_mcp.mcp) as client:
            with patch.object(gym_tracker_mcp, "_request", return_value={}) as request:
                await client.call_tool(
                    "update_set",
                    {
                        "session_id": 1,
                        "planned_exercise_id": 2,
                        "set_id": 3,
                        "telegram_user_id": 7,
                        "weight": 42,
                        "rir": 0,
                        "rpe": 10,
                        "clear_weight": False,
                        "clear_rir": False,
                        "clear_rpe": False,
                    },
                )
        request.assert_called_once_with(
            "PATCH",
            "/sessions/1/exercises/2/sets/3",
            {"weight": 42.0, "rir": 0.0, "rpe": 10.0},
            user_id=7,
        )

    async def test_false_flags_alone_do_not_count_as_a_change(self) -> None:
        async with Client(gym_tracker_mcp.mcp) as client:
            with patch.object(gym_tracker_mcp, "_request") as request:
                with self.assertRaisesRegex(ToolError, "at least one field"):
                    await client.call_tool(
                        "update_set",
                        {
                            "session_id": 1,
                            "planned_exercise_id": 2,
                            "set_id": 3,
                            "telegram_user_id": 7,
                            "clear_weight": False,
                            "clear_rir": False,
                            "clear_rpe": False,
                        },
                    )
            request.assert_not_called()
