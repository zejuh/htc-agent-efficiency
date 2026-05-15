import unittest

from htc_agent_efficiency.compression import TrajectoryCompressor
from htc_agent_efficiency.metrics import count_model_calls, total_latency_ms
from htc_agent_efficiency.schemas import Trajectory


class CompressionTest(unittest.TestCase):
    def test_compression_removes_repeated_observe_and_aggregates_scrolls(self):
        traj = Trajectory.from_dict(
            {
                "task_id": "t1",
                "success": True,
                "steps": [
                    {"t": 0, "action_type": "observe", "model_call": True, "latency_ms": 1000},
                    {"t": 1, "action_type": "observe", "model_call": True, "latency_ms": 1000},
                    {"t": 2, "action_type": "scroll", "target": "page", "risk": "safe", "metadata": {"may_change_screen": False}},
                    {"t": 3, "action_type": "scroll", "target": "page", "risk": "safe", "metadata": {"may_change_screen": False}},
                    {"t": 4, "action_type": "observe", "model_call": True, "latency_ms": 1000},
                    {"t": 5, "action_type": "type", "target": "field", "text": "hello"},
                ],
            }
        )
        compressed = TrajectoryCompressor().compress(traj)
        self.assertLess(len(compressed.steps), len(traj.steps))
        self.assertLess(count_model_calls(compressed), count_model_calls(traj))
        self.assertLess(total_latency_ms(compressed), total_latency_ms(traj))
        scroll = next(step for step in compressed.steps if step.action_type == "scroll")
        self.assertEqual(scroll.metadata["repeat_count"], 2)

    def test_compression_does_not_drop_duplicate_clicks(self):
        traj = Trajectory.from_dict(
            {
                "task_id": "clicks",
                "success": True,
                "steps": [
                    {"t": 0, "action_type": "click", "target": "field", "risk": "safe", "metadata": {"may_change_screen": False}},
                    {"t": 1, "action_type": "click", "target": "field", "risk": "safe", "metadata": {"may_change_screen": False}},
                ],
            }
        )
        compressed = TrajectoryCompressor().compress(traj)
        self.assertEqual([step.action_type for step in compressed.steps], ["click", "click"])

    def test_compression_keeps_checkpoint_before_external_action(self):
        traj = Trajectory.from_dict(
            {
                "task_id": "t2",
                "success": True,
                "steps": [
                    {"t": 0, "action_type": "observe", "model_call": True, "latency_ms": 1000},
                    {"t": 1, "action_type": "type", "target": "body", "text": "hello"},
                    {"t": 2, "action_type": "observe", "model_call": True, "latency_ms": 1000},
                    {"t": 3, "action_type": "click", "target": "send", "risk": "external"},
                ],
            }
        )
        compressed = TrajectoryCompressor().compress(traj)
        self.assertTrue(compressed.steps[2].model_call)


if __name__ == "__main__":
    unittest.main()
