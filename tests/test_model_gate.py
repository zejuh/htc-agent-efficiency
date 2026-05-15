import json
import tempfile
import unittest

from htc_agent_efficiency.compression import ModelBasedObservationGate
from htc_agent_efficiency.learned_gate import FEATURES
from htc_agent_efficiency.schemas import ActionStep


class ModelGateTest(unittest.TestCase):
    def test_model_gate_keeps_safety_floor(self):
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False, suffix=".json") as f:
            json.dump({"weights": {name: -10.0 for name in FEATURES}}, f)
            path = f.name
        gate = ModelBasedObservationGate(path, safety_floor=True)
        current = ActionStep(t=0, action_type="type", target="#field", risk="safe")
        external = ActionStep(t=1, action_type="click", target="#send", risk="external")
        self.assertTrue(gate.requires_observation_after(current, external))


if __name__ == "__main__":
    unittest.main()
