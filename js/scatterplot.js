/* V1: quadrant scatterplot (owner: Gi).
 *
 * One point per country: x is extreme poverty removed per year, y is
 * upper-secondary completion gained per year. Dashed threshold lines split the
 * plot into four quadrants, and a point takes the color of the quadrant it
 * falls in. Colors, group names and thresholds all come from js/constants.js
 * (P3) so this view, the map (V2) and the trajectory panel (V3) agree.
 *
 * Reusable chart (https://bost.ocks.org/mike/chart/).
 *
 * Usage:
 *   const scatter = quadrantScatter().dispatcher(dispatch);
 *   d3.select("#vis-scatter").datum(sdg.countries).call(scatter);
 *
 *   scatter.thresholds({poverty: 0.2, completion: 0.5});  // I4 sliders
 *   scatter.highlight(["004", "008"]);                    // I2 from the map, [] clears
 *   scatter.clear();                                      // I5 reset button
 *
 * Events sent on the dispatcher:
 *   "select" (ids, source)            ids are M49 codes, source = "scatter"  (I1)
 *   "hover"  (event, country, source) country is null on pointer out         (I3)
 */
function quadrantScatter() {
  // ---- Settings ----
  let width = 760;
  let height = 540;
  let margin = { top: 28, right: 24, bottom: 64, left: 76 };
  let thresholds = { ...SDG.DEFAULT_THRESHOLDS };
  let dispatcher = null;
  let radius = 5;

  // ---- Internal state ----
  let points;          // circle selection
  let x, y;            // scales
  let xAxisG, yAxisG;
  let vLine, hLine;    // dashed threshold lines
  let quadLabels;
  let noTrendNote;
  let rows = [];       // countries that have both trends
  let missing = 0;     // countries dropped for a missing trend (feeds V6)
  let selected = new Set();

  function chart(selection) {
    selection.each(function (countries) {
      rows = countries.filter(c => c.povertyReduction != null && c.completionGain != null);
      missing = countries.length - rows.length;

      const innerW = width - margin.left - margin.right;
      const innerH = height - margin.top - margin.bottom;

      const svg = d3.select(this).append("svg")
        .attr("class", "quadrant-scatter")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("preserveAspectRatio", "xMidYMid meet")
        .attr("role", "img")
        .attr("aria-label", "Scatterplot of yearly poverty reduction against yearly gain in upper-secondary completion, one point per country");

      const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

      // Scales, padded so no country sits on the frame.
      x = d3.scaleLinear()
        .domain(pad(d3.extent(rows, d => d.povertyReduction)))
        .nice().range([0, innerW]);
      y = d3.scaleLinear()
        .domain(pad(d3.extent(rows, d => d.completionGain)))
        .nice().range([innerH, 0]);

      // Recessive grid behind everything.
      g.append("g").attr("class", "grid")
        .selectAll("line.gx").data(x.ticks(8)).join("line")
        .attr("class", "gx")
        .attr("x1", d => x(d)).attr("x2", d => x(d))
        .attr("y1", 0).attr("y2", innerH);
      g.select(".grid")
        .selectAll("line.gy").data(y.ticks(8)).join("line")
        .attr("class", "gy")
        .attr("y1", d => y(d)).attr("y2", d => y(d))
        .attr("x1", 0).attr("x2", innerW);

      // Axes.
      xAxisG = g.append("g").attr("class", "axis axis-x")
        .attr("transform", `translate(0,${innerH})`)
        .call(d3.axisBottom(x).ticks(8));
      yAxisG = g.append("g").attr("class", "axis axis-y")
        .call(d3.axisLeft(y).ticks(8));

      // V5: axis titles.
      g.append("text").attr("class", "axis-title")
        .attr("x", innerW / 2).attr("y", innerH + 44)
        .attr("text-anchor", "middle")
        .text(SDG.AXIS_LABEL.poverty);
      g.append("text").attr("class", "axis-title")
        .attr("transform", "rotate(-90)")
        .attr("x", -innerH / 2).attr("y", -56)
        .attr("text-anchor", "middle")
        .text(SDG.AXIS_LABEL.completion);

      // Dashed threshold lines (I4 moves these).
      const refs = g.append("g").attr("class", "thresholds");
      vLine = refs.append("line").attr("class", "threshold-line")
        .attr("y1", 0).attr("y2", innerH);
      hLine = refs.append("line").attr("class", "threshold-line")
        .attr("x1", 0).attr("x2", innerW);

      // Quadrant names pinned to the four corners of the plot area, so they
      // name the grouping without sitting on top of the points. High poverty
      // reduction is to the right, high completion gain is at the top.
      quadLabels = g.append("g").attr("class", "quadrant-labels")
        .selectAll("text")
        .data([
          { g: "Both improved",                    corner: "tr" },
          { g: "Completion improved only",         corner: "tl" },
          { g: "Poverty fell, completion stalled", corner: "br" },
          { g: "Neither improved much",            corner: "bl" },
        ])
        .join("text")
        .attr("class", "quadrant-label")
        .attr("text-anchor", d => d.corner[1] === "r" ? "end" : "start")
        .attr("dominant-baseline", d => d.corner[0] === "t" ? "hanging" : "auto")
        .attr("x", d => d.corner[1] === "r" ? innerW - 6 : 6)
        .attr("y", d => d.corner[0] === "t" ? 6 : innerH - 6)
        .attr("fill", d => SDG.color(d.g))
        .text(d => d.g);

      // 2D brush (I1). Drawn under the points so hover still reaches them.
      const brush = d3.brush()
        .extent([[0, 0], [innerW, innerH]])
        .on("brush end", brushed);
      g.append("g").attr("class", "brush").call(brush);

      chart.clearBrush = () => g.select(".brush").call(brush.move, null);

      // Points on top.
      points = g.append("g").attr("class", "points")
        .selectAll("circle")
        .data(rows, d => d.m49)
        .join("circle")
        .attr("class", "country-point")
        .attr("r", radius)
        .attr("cx", d => x(d.povertyReduction))
        .attr("cy", d => y(d.completionGain))
        .on("mouseover", function (event, d) {
          d3.select(this).raise().classed("hovered", true);
          if (dispatcher) dispatcher.call("hover", null, event, d, "scatter");
        })
        .on("mousemove", (event, d) => {
          if (dispatcher) dispatcher.call("hover", null, event, d, "scatter");
        })
        .on("mouseout", function (event) {
          d3.select(this).classed("hovered", false);
          if (dispatcher) dispatcher.call("hover", null, event, null, "scatter");
        })
        .on("click", (event, d) => {
          event.stopPropagation();
          const next = event.shiftKey || event.metaKey || event.ctrlKey
            ? new Set(selected) : new Set();
          if (selected.has(d.m49) && next.size) next.delete(d.m49); else next.add(d.m49);
          emit([...next]);
        });

      points.append("title").text(d => d.name);  // keyboard and screen-reader fallback

      // V6: how many countries the selection cannot show.
      noTrendNote = svg.append("text")
        .attr("class", "no-trend-note")
        .attr("x", width - margin.right)
        .attr("y", height - 8)
        .attr("text-anchor", "end");

      function brushed({ selection: box, sourceEvent }) {
        if (!sourceEvent) return;            // ignore programmatic moves
        if (!box) { emit([]); return; }
        const [[x0, y0], [x1, y1]] = box;
        const hit = rows.filter(d => {
          const px = x(d.povertyReduction), py = y(d.completionGain);
          return px >= x0 && px <= x1 && py >= y0 && py <= y1;
        });
        emit(hit.map(d => d.m49));
      }

      chart.recolor();
      chart.highlight([]);
    });
  }

  function pad([lo, hi]) {
    const slack = (hi - lo) * 0.06 || 1;
    return [lo - slack, hi + slack];
  }

  function emit(ids) {
    chart.highlight(ids);
    if (dispatcher) dispatcher.call("select", null, ids, "scatter");
  }

  // Redraw fills and threshold lines. Call after the I4 sliders move.
  chart.recolor = function () {
    if (!points) return chart;
    points.attr("fill", d => SDG.color(SDG.groupOf(d, thresholds.poverty, thresholds.completion)));
    vLine.attr("x1", x(thresholds.poverty)).attr("x2", x(thresholds.poverty));
    hLine.attr("y1", y(thresholds.completion)).attr("y2", y(thresholds.completion));
    return chart;
  };

  // Emphasize the given ids and fade the rest. An empty array clears it.
  chart.highlight = function (ids) {
    if (!points) return chart;
    const set = new Set(ids);
    selected = set;
    points
      .classed("selected", d => set.has(d.m49))
      .classed("faded", d => set.size > 0 && !set.has(d.m49));
    points.filter(".selected").raise();
    updateNote();
    return chart;
  };

  function updateNote() {
    if (!noTrendNote) return;
    const shown = selected.size || rows.length;
    noTrendNote.text(
      selected.size
        ? `${shown} selected · ${missing} countries have no trend`
        : `${rows.length} countries plotted · ${missing} have no trend`
    );
  }

  // I5: clear the brush and the selection.
  chart.clear = function () {
    if (chart.clearBrush) chart.clearBrush();
    emit([]);
    return chart;
  };

  chart.thresholds = function (_) {
    if (!arguments.length) return { ...thresholds };
    thresholds = { ...thresholds, ..._ };
    chart.recolor();
    return chart;
  };

  chart.selection = () => [...selected];
  chart.missingCount = () => missing;

  // ---- Getters/setters ----
  chart.width = function (_) { return arguments.length ? (width = _, chart) : width; };
  chart.height = function (_) { return arguments.length ? (height = _, chart) : height; };
  chart.margin = function (_) { return arguments.length ? (margin = _, chart) : margin; };
  chart.radius = function (_) { return arguments.length ? (radius = _, chart) : radius; };
  chart.dispatcher = function (_) { return arguments.length ? (dispatcher = _, chart) : dispatcher; };

  return chart;
}
