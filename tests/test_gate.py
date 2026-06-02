import unittest

from soa.gate import (
    decision_metrics,
    feature_names,
    handrule_observe,
    predict_mlp_prob,
    predict_prob,
    split_by_task,
    train_logistic,
    train_mlp,
)


def _row(task_id, screen_changed, conf, label, risk_ext=0.0):
    return {
        "task_id": task_id,
        "features": {
            "bias": 1.0,
            "no_plan": 0.0,
            "screen_changed_last": screen_changed,
            "verbalized_confidence": conf,
            "verbalized_needs_observation": 0.0,
            "next_risk_external": risk_ext,
        },
        "label": label,
    }


class TestGate(unittest.TestCase):
    def setUp(self):
        # 可分数据：页面变化或低置信度时才需要观察。
        rows = []
        for i in range(40):
            rows.append(_row(f"t{i % 8}", 1.0, 0.9, 1))
            rows.append(_row(f"t{i % 8}", 0.0, 0.3, 1))
            rows.append(_row(f"t{i % 8}", 0.0, 0.95, 0))
        self.rows = rows
        self.names = feature_names(rows)

    def test_feature_names_bias_first(self):
        self.assertEqual(self.names[0], "bias")

    def test_split_by_task_disjoint(self):
        train, test = split_by_task(self.rows)
        train_ids = {r["task_id"] for r in train}
        test_ids = {r["task_id"] for r in test}
        self.assertTrue(train and test)
        self.assertTrue(train_ids.isdisjoint(test_ids))

    def test_logistic_learns_low_confidence_signal(self):
        weights = train_logistic(self.rows, self.names, epochs=400)
        # 页面稳定但置信度低，应预测为“观察”。
        p_low = predict_prob(weights, {"bias": 1.0, "screen_changed_last": 0.0, "verbalized_confidence": 0.2}, self.names)
        p_high = predict_prob(weights, {"bias": 1.0, "screen_changed_last": 0.0, "verbalized_confidence": 0.95}, self.names)
        self.assertGreater(p_low, p_high)
        self.assertGreater(p_low, 0.5)

    def test_mlp_learns_low_confidence_signal(self):
        model = train_mlp(self.rows, self.names, hidden_dim=6, epochs=250, lr=0.08)
        p_low = predict_mlp_prob(model, {"bias": 1.0, "screen_changed_last": 0.0, "verbalized_confidence": 0.2})
        p_high = predict_mlp_prob(model, {"bias": 1.0, "screen_changed_last": 0.0, "verbalized_confidence": 0.95})
        self.assertGreater(p_low, p_high)
        self.assertGreater(p_low, 0.5)

    def test_handrule_misses_low_confidence(self):
        # 页面稳定、动作安全但置信度低：hand rule 会选择不观察。
        self.assertEqual(handrule_observe({"screen_changed_last": 0.0, "verbalized_confidence": 0.2}), 0)
        # 页面变化：hand rule 会观察。
        self.assertEqual(handrule_observe({"screen_changed_last": 1.0}), 1)

    def test_decision_metrics(self):
        m = decision_metrics([1, 0, 1, 0], [1, 1, 0, 0])
        self.assertEqual(m["n"], 4.0)
        self.assertAlmostEqual(m["accuracy"], 0.5)
        self.assertAlmostEqual(m["false_skip_rate"], 0.25)  # 一个 pred 0 / label 1
        self.assertAlmostEqual(m["unnecessary_observe_rate"], 0.25)  # 一个 pred 1 / label 0


if __name__ == "__main__":
    unittest.main()
