/* P3: shared encoding constants (owner: Gi).
 *
 * One source of truth for the group names, the palette, the default thresholds,
 * and the rules that turn a country record into a group. V1 (scatterplot),
 * V2 (map) and V3 (trajectory panel) all read from here so the three views
 * never disagree about what a color means.
 *
 * Plain global object, no modules, because the course template loads scripts
 * with ordinary <script> tags. Load this file before any view.
 *
 * Usage:
 *   SDG.GROUPS                      // fixed order, drives the legend (V4)
 *   SDG.color(groupName)            // hex string, or SDG.NO_DATA for null
 *   SDG.groupOf(country, tP, tC)    // group name, or null when a trend is missing
 *   SDG.DEFAULT_THRESHOLDS          // starting values for the I4 sliders
 */
const SDG = (() => {

  // ---- Groups, in the fixed order used by the legend and every color scale ----
  const GROUPS = [
    "Both improved",
    "Poverty fell, completion stalled",
    "Completion improved only",
    "Neither improved much",
  ];

  // ---- Palette ----
  // Okabe-Ito hues. Checked for colorblind separation: worst adjacent pair is
  // 18.0 dE (protanopia), well above the 8 dE target, and all four clear the
  // chroma floor. The earlier placeholder set (#4e79a7 / #e15759 / #59a14f /
  // #f28e2b) failed: its green and red sit 0.7 dE apart under deuteranopia.
  // Because two of the fills fall under 3:1 contrast with the page, identity is
  // never carried by color alone: the legend is labeled, points keep a white
  // ring, and the tooltip names the group.
  const PALETTE = {
    "Both improved":                    "#009E73",  // green
    "Poverty fell, completion stalled": "#0072B2",  // blue
    "Completion improved only":         "#E69F00",  // orange
    "Neither improved much":            "#CC79A7",  // pink
  };

  const NO_DATA   = "#d9d9d9";  // country has no trend, or is not in the SDG data
  const SURFACE   = "#ffffff";  // ring color that separates overlapping marks
  const REFERENCE = "#9aa0a6";  // dashed threshold lines, grid, axis rules
  const INK       = "#333333";  // axis and annotation text

  // d3-style accessor so views can pass it straight into .color(...)
  const color = g => (g == null ? NO_DATA : (PALETTE[g] || NO_DATA));

  const colorScale = () => d3.scaleOrdinal().domain(GROUPS).range(GROUPS.map(g => PALETTE[g]));

  // ---- Thresholds (I4 sliders move these) ----
  // Zero is the meaningful default: at or above zero the indicator improved.
  const DEFAULT_THRESHOLDS = { poverty: 0, completion: 0 };
  const THRESHOLD_RANGE = {
    poverty:    { min: -1.5, max: 4, step: 0.1 },
    completion: { min: -1.0, max: 4, step: 0.1 },
  };

  // ---- Classification ----
  // povertyReduction is percentage points of extreme poverty removed per year,
  // so a larger number is better. completionGain is percentage points of
  // upper-secondary completion added per year. Returns null when either trend
  // is missing, which is what paints a country gray and feeds the V6 count.
  function groupOf(c, tPov = DEFAULT_THRESHOLDS.poverty, tCmp = DEFAULT_THRESHOLDS.completion) {
    if (!c || c.povertyReduction == null || c.completionGain == null) return null;
    const pov = c.povertyReduction >= tPov;
    const cmp = c.completionGain >= tCmp;
    if (pov && cmp) return "Both improved";
    if (pov) return "Poverty fell, completion stalled";
    if (cmp) return "Completion improved only";
    return "Neither improved much";
  }

  // P2's slope rule, kept here so the browser and the pandas preprocessing
  // agree on what a trend means. Least-squares slope in percentage points per
  // year, or null when a country has too few survey points to fit one.
  function slopePerYear(points) {
    const pts = (points || []).filter(p => p.value != null);
    if (pts.length < 3 || new Set(pts.map(p => p.year)).size < 2) return null;
    const meanX = d3.mean(pts, p => p.year);
    const meanY = d3.mean(pts, p => p.value);
    const sxy = d3.sum(pts, p => (p.year - meanX) * (p.value - meanY));
    const sxx = d3.sum(pts, p => (p.year - meanX) ** 2);
    return sxy / sxx;
  }

  // ---- Shared formatters, so all three views read the same way ----
  const fmtSlope = d3.format("+.2f");
  const fmtYears = ([a, b]) => (a == null || b == null ? "no span" : `${a} to ${b}`);
  const labelSlope = v => (v == null ? "no trend" : `${fmtSlope(v)} pp/yr`);

  const AXIS_LABEL = {
    poverty:    "Extreme poverty removed (percentage points per year)",
    completion: "Upper-secondary completion gained (percentage points per year)",
  };

  // Caption reused under every view that shows a trend (V5).
  const TREND_NOTE = "Slopes are least-squares trends through each country's survey points.";

  return {
    GROUPS, PALETTE, NO_DATA, SURFACE, REFERENCE, INK,
    color, colorScale,
    DEFAULT_THRESHOLDS, THRESHOLD_RANGE,
    groupOf, slopePerYear,
    fmtSlope, fmtYears, labelSlope,
    AXIS_LABEL, TREND_NOTE,
  };
})();
