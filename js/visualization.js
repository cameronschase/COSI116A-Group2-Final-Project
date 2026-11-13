// Immediately Invoked Function Expression to limit access to our 
// variables and prevent 
((() => {

  // Shared event bus that links the views (see the implementation plan).
  const dispatch = d3.dispatch("select", "hover");

  // TEMPORARY until the shared constants module (P3) lands: swap these for its
  // palette and default thresholds so the map matches the scatterplot exactly.
  const thresholds = { poverty: 0, completion: 0 };
  const groupColor = d3.scaleOrdinal()
    .domain(["Both improved", "Poverty fell, completion stalled",
             "Completion improved only", "Neither improved much"])
    .range(["#4e79a7", "#e15759", "#59a14f", "#f28e2b"]);

  Promise.all([
    d3.json("data/sdg.json"),
    d3.json("data/world.geojson"),
  ]).then(([sdg, world]) => {
    const byId = new Map(sdg.countries.map(c => [c.m49, c]));
    const groupOf = id => {
      const c = byId.get(id);
      return c ? group(c, thresholds.poverty, thresholds.completion) : null;
    };

    // V2: choropleth world map
    const map = worldMap()
      .groupOf(groupOf)
      .color(groupColor)
      .dispatcher(dispatch);
    d3.select("#vis-map").datum(world).call(map);

    // Selections from any view highlight the same countries on the map.
    dispatch.on("select.map", (ids, source) => {
      if (source !== "map") map.highlight(ids);
    });
  });

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