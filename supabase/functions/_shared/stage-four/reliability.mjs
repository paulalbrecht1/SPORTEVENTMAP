export function calculateReliabilityMetric(observations = []) {
  const reviewed = observations.filter(item => ["accepted", "edited_and_accepted", "rejected"].includes(item.proposal_status));
  const accepted = reviewed.filter(item => item.proposal_status === "accepted").length;
  const edited = reviewed.filter(item => item.proposal_status === "edited_and_accepted").length;
  const rejected = reviewed.filter(item => item.proposal_status === "rejected").length;
  const errors = observations.filter(item => item.error === true || item.processing_status === "dead_letter").length;
  const falseCritical = reviewed.filter(item => item.proposal_status === "rejected" && ["possible_cancellation", "possible_postponement"].includes(item.change_type)).length;
  const falseDates = reviewed.filter(item => item.proposal_status === "rejected" && ["start_date", "end_date"].includes(item.field_name)).length;
  const averageConfidence = observations.length
    ? observations.reduce((sum, item) => sum + Number(item.confidence || 0), 0) / observations.length : 0;
  const reviewedCount = reviewed.length;
  const acceptanceRate = reviewedCount ? accepted / reviewedCount : 0;
  const editRate = reviewedCount ? edited / reviewedCount : 0;
  const rejectionRate = reviewedCount ? rejected / reviewedCount : 0;
  const errorRate = observations.length ? errors / observations.length : 0;

  // Conservative Bayesian prior: a new source starts at 0.5 with 20 virtual observations.
  const evidenceScore = (10 + accepted + edited * 0.45) / (20 + reviewedCount);
  const penalties = Math.min(0.45, errorRate * 0.25 + rejectionRate * 0.25 + falseCritical * 0.06 + falseDates * 0.04);
  const score = Math.max(0, Math.min(1, Math.round((evidenceScore * 0.75 + averageConfidence * 0.25 - penalties) * 1000) / 1000));
  return {
    proposalCount: observations.length, reviewedCount, accepted, edited, rejected, errors,
    acceptanceRate, editRate, rejectionRate, errorRate, averageConfidence,
    falseCancellationCount: falseCritical, falseDateChangeCount: falseDates, score,
    eligibleForAutomation: reviewedCount >= 50 && score >= 0.92 && errorRate <= 0.02 && rejectionRate <= 0.03,
    reasons: [
      `reviewed=${reviewedCount}`, `bayesian_prior=20`, `acceptance_rate=${acceptanceRate.toFixed(3)}`,
      `rejection_rate=${rejectionRate.toFixed(3)}`, `error_rate=${errorRate.toFixed(3)}`,
      `average_confidence=${averageConfidence.toFixed(3)}`, `critical_false_positives=${falseCritical}`
    ]
  };
}
