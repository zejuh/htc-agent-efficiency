import unittest

from htc_agent_efficiency.stats import bootstrap_ci, paired_delta


class StatsTest(unittest.TestCase):
    def test_paired_delta(self):
        self.assertEqual(paired_delta([3, 2], [2, 5]), [-1, 3])

    def test_bootstrap_ci_contains_mean(self):
        estimate, lo, hi = bootstrap_ci([1.0, 2.0, 3.0], n_resamples=100)
        self.assertLessEqual(lo, estimate)
        self.assertGreaterEqual(hi, estimate)


if __name__ == "__main__":
    unittest.main()

