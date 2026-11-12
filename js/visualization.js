// Immediately Invoked Function Expression to limit access to our 
// variables and prevent 
((() => {

  console.log("Hello, world!");

})());

  // The script that recreates our Tableau groupings:
  function group(c, tPov, tCmp) {
  if (c.povertyReduction == null || c.completionGain == null) return null;
  if (c.povertyReduction >= tPov && c.completionGain < tCmp) return "Poverty fell, completion stalled";
  if (c.povertyReduction >= tPov) return "Both improved";
  if (c.completionGain >= tCmp) return "Completion improved only";
  return "Neither improved much";
  }

// Least-squares slope (pp per year) through a country's survey points.
// The slope rule from the Tableau final sketch for the trajectory
function slopePerYear(points) {
  const pts = points.filter(p => p.value != null);
  if (pts.length < 3 || new Set(pts.map(p => p.year)).size < 2) return null;

  const meanX = d3.mean(pts, p => p.year);
  const meanY = d3.mean(pts, p => p.value);
  const sxy = d3.sum(pts, p => (p.year - meanX) * (p.value - meanY));
  const sxx = d3.sum(pts, p => (p.year - meanX) ** 2);
  return sxy / sxx;
}