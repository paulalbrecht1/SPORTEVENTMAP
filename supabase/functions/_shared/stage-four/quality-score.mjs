export function calculateDataQualityScore(metrics = {}) {
  const factors = [
    ["verified_active", metrics.verifiedActiveRate, 0.2],
    ["official_url", metrics.officialUrlRate, 0.12],
    ["coordinates", metrics.coordinateRate, 0.14],
    ["future_date", metrics.futureDateRate, 0.14],
    ["next_check", metrics.nextCheckRate, 0.08],
    ["image", metrics.imageRate, 0.06],
    ["registration_url", metrics.registrationUrlRate, 0.08],
    ["distances", metrics.distanceRate, 0.08],
    ["source", metrics.sourceRate, 0.1]
  ].map(([factor, rawValue, weight]) => {
    const value = Math.max(0, Math.min(1, Number(rawValue || 0)));
    return { factor, value, weight, contribution: value * weight };
  });
  const penalties = Math.min(0.35,
    Number(metrics.criticalIssueRate || 0) * 0.2
    + Number(metrics.warningRate || 0) * 0.05
    + Number(metrics.duplicateRate || 0) * 0.1);
  const score = Math.max(0, Math.min(100, Math.round((factors.reduce((sum, item) => sum + item.contribution, 0) - penalties) * 1000) / 10));
  return { score, factors, penalties, grade: score >= 90 ? "excellent" : score >= 75 ? "good" : score >= 60 ? "needs_attention" : "critical" };
}
