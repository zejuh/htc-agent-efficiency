import unittest

from htc_agent_efficiency.learned_gate import evaluate, make_examples, train_logistic
from htc_agent_efficiency.schemas import Trajectory


class LearnedGateTest(unittest.TestCase):
    def test_gate_learns_basic_checkpoint_labels(self):
        traj = Trajectory.from_dict(
            {
                "task_id": "gate",
                "success": True,
                "steps": [
                    {"t": 0, "action_type": "click", "target": "open", "metadata": {"may_change_screen": True}},
                    {"t": 1, "action_type": "type", "target": "field", "risk": "safe"},
                    {"t": 2, "action_type": "click", "target": "send", "risk": "external", "observation_required": True},
                ],
            }
        )
        examples = make_examples([traj])
        weights = train_logistic(examples, epochs=100)
        metrics = evaluate(weights, examples)
        self.assertGreaterEqual(metrics["accuracy"], 2 / 3)


if __name__ == "__main__":
    unittest.main()

