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
 *   SDG.notableCountries(countries) // rule-chosen countries to annotate, ranked
 *   SDG.isThinEvidence(country)     // true when a slope rests on the minimum survey count
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
    // Wide enough that each extreme puts every country on one side: the
    // poverty slopes in sdg.json run from -1.64 to +4.15 pp/yr.
    poverty:    { min: -2.0, max: 4.5, step: 0.1 },
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
    poverty:    "Extreme poverty removed per year (pp/yr)",
    completion: "Upper-secondary completion gained per year (pp/yr)",
  };

  // Caption reused under every view that shows a trend (V5).
  const TREND_NOTE = "Slopes are least-squares trends through each country's survey points.";

  // ---- Evidence strength (shown in V1, V2, the tooltip and the legend) ----
  // slopePerYear needs at least 3 survey points. A slope fit to exactly that
  // minimum on either indicator is flagged, because a single unusual survey
  // can move it a long way.
  const THIN_EVIDENCE_N = 3;
  const isThinEvidence = c => !!c && c.povertyReduction != null && c.completionGain != null
    && (c.povertyN <= THIN_EVIDENCE_N || c.completionN <= THIN_EVIDENCE_N);

  // ---- Notable countries (annotated in V1, V2 and the tooltip) ----
  // Chosen by a fixed rule over the countries that have both trends, so the
  // set is reproducible and not hand-picked:
  //   (a) the highest and the lowest slope on each axis (up to 4 countries), and
  //   (b) every country whose trend pair lies at least NOTABLE_DISTANCE standard
  //       deviations from the mean pair, after standardizing each axis by its
  //       own mean and population standard deviation (Euclidean distance on
  //       the two z-scores).
  // Numbering follows that distance, largest first, and is shared by the
  // scatterplot labels and the map markers.
  // The thresholds (I4) do not enter the rule, so the set stays fixed as the
  // sliders move.
  const NOTABLE_DISTANCE = 2.5;

  // Returns [{m49, name, rank, distance, reasons}], rank 1 first.
  function notableCountries(countries) {
    const rows = countries.filter(c => c.povertyReduction != null && c.completionGain != null);
    if (!rows.length) return [];
    const axes = [
      { key: "povertyReduction", label: "poverty removed" },
      { key: "completionGain",   label: "completion gained" },
    ];
    for (const a of axes) {
      a.mean = d3.mean(rows, c => c[a.key]);
      a.sd = d3.deviation(rows, c => c[a.key]) * Math.sqrt((rows.length - 1) / rows.length) || 1;
    }
    const distance = c => Math.hypot(...axes.map(a => (c[a.key] - a.mean) / a.sd));

    const reasons = new Map();
    const add = (c, text) => {
      if (!reasons.has(c.m49)) reasons.set(c.m49, []);
      reasons.get(c.m49).push(text);
    };
    for (const a of axes) {
      const hi = d3.greatest(rows, c => c[a.key]);
      const lo = d3.least(rows, c => c[a.key]);
      add(hi, `Highest ${a.label} (${labelSlope(hi[a.key])})`);
      add(lo, `Lowest ${a.label} (${labelSlope(lo[a.key])})`);
    }
    for (const c of rows) {
      const d = distance(c);
      if (d >= NOTABLE_DISTANCE) add(c, `${d.toFixed(2)} SD from the mean trend pair`);
    }

    return rows
      .filter(c => reasons.has(c.m49))
      .map(c => ({
        m49: c.m49,
        name: c.name,
        distance: distance(c),
        reasons: reasons.get(c.m49),
      }))
      .sort((a, b) => b.distance - a.distance)
      .map((a, i) => ({ ...a, rank: i + 1 }));
  }

  return {
    GROUPS, PALETTE, NO_DATA, SURFACE, REFERENCE, INK,
    color, colorScale,
    DEFAULT_THRESHOLDS, THRESHOLD_RANGE,
    groupOf, slopePerYear,
    fmtSlope, fmtYears, labelSlope,
    AXIS_LABEL, TREND_NOTE,
    THIN_EVIDENCE_N, isThinEvidence,
    NOTABLE_DISTANCE, notableCountries,
  };
})();
