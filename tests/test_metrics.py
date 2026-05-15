import unittest

from htc_agent_efficiency.metrics import aggregate_metrics, classify_redundancy, trajectory_metrics
from htc_agent_efficiency.schemas import Trajectory


class MetricsTest(unittest.TestCase):
    def test_redundancy_taxonomy_counts_common_waste(self):
        traj = Trajectory.from_dict(
            {
                "task_id": "t1",
                "success": True,
                "steps": [
                    {"t": 0, "action_type": "observe", "model_call": True},
                    {"t": 1, "action_type": "observe", "model_call": True},
                    {"t": 2, "action_type": "click", "target": "x"},
                    {"t": 3, "action_type": "click", "target": "x"},
                    {"t": 4, "action_type": "reflect"},
                    {"t": 5, "action_type": "scroll", "target": "page", "metadata": {"direction": "down"}},
                    {"t": 6, "action_type": "scroll", "target": "page", "metadata": {"direction": "up"}},
                ],
            }
        )
        counts = classify_redundancy(traj)
        self.assertEqual(counts["repeated_observe"], 1)
        self.assertEqual(counts["repeated_action"], 1)
        self.assertEqual(counts["untriggered_reflection"], 1)
        self.assertEqual(counts["scroll_oscillation"], 1)

    def test_human_normalized_ratio(self):
        agent = Trajectory.from_dict(
            {"task_id": "t1", "success": True, "steps": [{"t": i, "action_type": "click"} for i in range(6)]}
        )
        human = Trajectory.from_dict(
            {"task_id": "t1", "success": True, "steps": [{"t": i, "action_type": "click"} for i in range(3)]}
        )
        row = trajectory_metrics(agent, human)
        self.assertEqual(row.human_step_ratio, 2.0)

    def test_aggregate(self):
        traj = Trajectory.from_dict(
            {"task_id": "t1", "success": True, "steps": [{"t": 0, "action_type": "click"}]}
        )
        out = aggregate_metrics([trajectory_metrics(traj)])
        self.assertEqual(out["success_rate"], 1.0)
        self.assertEqual(out["avg_action_count"], 1)


if __name__ == "__main__":
    unittest.main()

