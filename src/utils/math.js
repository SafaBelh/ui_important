// Numeric helpers for client-side anomaly detection and amount segmentation.

/**
 * Detects point anomalies with Median Absolute Deviation (MAD), a robust spread
 * measure that is less sensitive to outliers than standard deviation. The
 * k-factor widens or narrows the accepted band around the median.
 */
export function calculateMAD(data, k = 3.0) {
  const values = data.map((point) => point.value).sort((a, b) => a - b);
  const median =
    values.length % 2 === 0
      ? (values[values.length / 2 - 1] + values[values.length / 2]) / 2
      : values[Math.floor(values.length / 2)];
  const deviations = values.map((value) => Math.abs(value - median)).sort((a, b) => a - b);
  const mad =
    deviations.length % 2 === 0
      ? (deviations[deviations.length / 2 - 1] + deviations[deviations.length / 2]) / 2
      : deviations[Math.floor(deviations.length / 2)];
  const upperBound = median + k * mad;
  const lowerBound = Math.max(0, median - k * mad);
  return {
    median, mad, upperBound, lowerBound, k,
    points: data.map((point) => ({
      ...point,
      isAnomaly: point.value > upperBound || point.value < lowerBound,
    })),
  };
}

/** Adjusts MAD sensitivity while keeping analysts inside the supported tuning range. */
export function adjustKFactor(current, falsePositive) {
  return falsePositive
    ? Math.min(5, Math.round((current + 0.2) * 10) / 10)
    : Math.max(2, Math.round((current - 0.1) * 10) / 10);
}

/**
 * Recursively splits sorted amounts where a gap is much larger than the typical
 * neighboring gap. It produces cluster means for invoice/amount segmentation.
 */
export function recursiveGapSplit(amounts, gapMult = 2.5, minGapAbs = 30, minSize = 5) {
  if (amounts.length < 2 * minSize) return [amounts.reduce((a, b) => a + b, 0) / amounts.length];
  const sorted = [...amounts].sort((a, b) => a - b);
  const diffs = sorted.slice(1).map((value, index) => value - sorted[index]);
  const sortedDiffs = [...diffs].sort((a, b) => a - b);
  const median = sortedDiffs[Math.floor(sortedDiffs.length / 2)];
  if (median === 0) {
    const maxGap = Math.max(...diffs);
    if (maxGap > minGapAbs) {
      const splitIndex = diffs.indexOf(maxGap) + 1;
      const left = sorted.slice(0, splitIndex);
      const right = sorted.slice(splitIndex);
      if (left.length >= minSize && right.length >= minSize) {
        return [
          left.reduce((a, b) => a + b, 0) / left.length,
          right.reduce((a, b) => a + b, 0) / right.length,
        ];
      }
    }
    return [sorted.reduce((a, b) => a + b, 0) / sorted.length];
  }
  const maxGap = Math.max(...diffs);
  if (maxGap > gapMult * median && maxGap > minGapAbs) {
    const splitIndex = diffs.indexOf(maxGap) + 1;
    return [
      ...recursiveGapSplit(sorted.slice(0, splitIndex), gapMult, minGapAbs, minSize),
      ...recursiveGapSplit(sorted.slice(splitIndex), gapMult, minGapAbs, minSize),
    ];
  }
  return [sorted.reduce((a, b) => a + b, 0) / sorted.length];
}

/** Assigns an amount to the nearest amount-segmentation cluster. */
export function assignCluster(amount, means) {
  return means.reduce(
    (bestIndex, mean, index) => (Math.abs(amount - mean) < Math.abs(amount - means[bestIndex]) ? index : bestIndex),
    0,
  );
}

/**
 * Summarizes the largest meaningful amount gap for UI explanations. Returns
 * null when the sample is too small or no gap clears the configured thresholds.
 */
export function detectGapDetails(amounts, gapMult = 3.0, minGapAbs = 20) {
  if (amounts.length < 10) return null;
  const sorted = [...amounts].sort((a, b) => a - b);
  const diffs = sorted.slice(1).map((value, index) => value - sorted[index]);
  const median = [...diffs].sort((a, b) => a - b)[Math.floor(diffs.length / 2)];
  const maxGap = Math.max(...diffs);
  if ((median === 0 ? maxGap > minGapAbs : maxGap > gapMult * median && maxGap > minGapAbs)) {
    const splitIndex = diffs.indexOf(maxGap) + 1;
    const left = sorted.slice(0, splitIndex),
      right = sorted.slice(splitIndex);
    return {
      gapEuros: Math.round(maxGap),
      leftMean: Math.round(left.reduce((a, b) => a + b, 0) / left.length),
      rightMean: Math.round(right.reduce((a, b) => a + b, 0) / right.length),
      leftCount: left.length,
      rightCount: right.length,
    };
  }
  return null;
}
