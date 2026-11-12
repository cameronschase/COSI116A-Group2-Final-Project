// Immediately Invoked Function Expression to limit access to our 
// variables and prevent 
((() => {

  console.log("Hello, world!");

})());

/**
  // Bleh bleh Cam's a genius here's the script that recreates our Tableau groupings:
  function group(c, tPov, tCmp) {
  if (c.povertyReduction == null || c.completionGain == null) return null;
  if (c.povertyReduction >= tPov && c.completionGain < tCmp) return "Poverty fell, completion stalled";
  if (c.povertyReduction >= tPov) return "Both improved";
  if (c.completionGain >= tCmp) return "Completion improved only";
  return "Neither improved much";
  }
 */