import unittest

from htc_agent_efficiency.macro_mining import mine_macros, parameterized_signature
from htc_agent_efficiency.schemas import Trajectory


class MacroMiningTest(unittest.TestCase):
    def test_mines_repeated_human_patterns(self):
        raw = {
            "success": True,
            "steps": [
                {"t": 0, "action_type": "click", "target": "field"},
                {"t": 1, "action_type": "type", "target": "field", "text": "x"},
                {"t": 2, "action_type": "press", "target": "enter"},
            ],
        }
        trajs = [
            Trajectory.from_dict({"task_id": "a", **raw}),
            Trajectory.from_dict({"task_id": "b", **raw}),
        ]
        macros = mine_macros(trajs, min_support=2, abstraction="exact")
        patterns = [macro.pattern for macro in macros]
        self.assertIn(("click:field", "type:field", "press:enter"), patterns)

    def test_parameterized_macro_abstracts_unstable_selectors(self):
        a = Trajectory.from_dict(
            {
                "task_id": "a",
                "success": True,
                "steps": [
                    {"t": 0, "action_type": "click", "target": "#compose-btn"},
                    {"t": 1, "action_type": "type", "target": "#to-field", "text": "alice@example.com"},
                ],
            }
        )
        b = Trajectory.from_dict(
            {
                "task_id": "b",
                "success": True,
                "steps": [
                    {"t": 0, "action_type": "click", "target": "#send-button-42"},
                    {"t": 1, "action_type": "type", "target": "#recipient-input-7", "text": "bob@example.com"},
                ],
            }
        )
        macros = mine_macros([a, b], min_support=2, abstraction="parameterized")
        patterns = [macro.pattern for macro in macros]
        self.assertIn(("click:button", "type:text-input:email"), patterns)
        self.assertEqual(parameterized_signature(a.steps[1]), "type:text-input:email")


if __name__ == "__main__":
    unittest.main()
