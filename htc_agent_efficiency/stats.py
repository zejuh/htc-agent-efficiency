from __future__ import annotations

import random
from statistics import mean
from typing import Callable


def bootstrap_ci(
    values: list[float],
    statistic: Callable[[list[float]], float] = mean,
    n_resamples: int = 1000,
    confidence: float = 0.95,
    seed: int = 13,
) -> tuple[float, float, float]:
    if not values:
        raise ValueError("bootstrap_ci requires at least one value")
    rng = random.Random(seed)
    estimates: list[float] = []
    for _ in range(n_resamples):
        sample = [values[rng.randrange(len(values))] for _ in values]
        estimates.append(float(statistic(sample)))
    estimates.sort()
    alpha = (1.0 - confidence) / 2.0
    lo = estimates[int(alpha * (len(estimates) - 1))]
    hi = estimates[int((1.0 - alpha) * (len(estimates) - 1))]
    return float(statistic(values)), lo, hi


def paired_delta(before: list[float], after: list[float]) -> list[float]:
    if len(before) != len(after):
        raise ValueError("paired_delta requires equally sized lists")
    return [a - b for b, a in zip(before, after)]

