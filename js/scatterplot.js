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
 *   scatter.clearBrush();                                 // drop the box, keep the selection
 *   scatter.annotations(SDG.notableCountries(countries)); // numbered labels, set before .call
 *   scatter.syncOverlays();                               // after the I6 legend dims a group
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
  let annotations = [];  // from SDG.notableCountries; drawn as numbered labels

  // ---- Internal state ----
  let points;          // circle selection
  let labels;          // annotation label groups
  let x, y;            // scales
  let xAxisG, yAxisG;
  let vLine, hLine;    // dashed threshold lines
  let quadLabels;
  let noTrendNote;
  let rows = [];       // countries that have both trends
  let missing = 0;     // countries dropped for a missing trend (feeds V6)
  let selected = new Set();
  let clearBrush = null;   // set once the brush exists

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

      // Programmatic move: brushed() sees no sourceEvent, so nothing is re-emitted.
      clearBrush = () => g.select(".brush").call(brush.move, null);

      // Points on top.
      points = g.append("g").attr("class", "points")
        .selectAll("circle")
        .data(rows, d => d.m49)
        .join("circle")
        .attr("class", "country-point")
        .attr("r", radius)
        .attr("cx", d => x(d.povertyReduction))
        .attr("cy", d => y(d.completionGain))
        .classed("thin-evidence", SDG.isThinEvidence)   // drawn as a ring (style.css)
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
        .on("click", (event, d) => clickSelect(event, d.m49));

      points.append("title").text(d => d.name);  // keyboard and screen-reader fallback

      drawAnnotations(g.append("g").attr("class", "annotations"), innerW, innerH, g);

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

  // Plain click selects one country; Shift/Cmd/Ctrl-click toggles it in the
  // current selection. Shared by points and annotation labels.
  function clickSelect(event, id) {
    event.stopPropagation();
    const next = event.shiftKey || event.metaKey || event.ctrlKey
      ? new Set(selected) : new Set();
    if (selected.has(id) && next.size) next.delete(id); else next.add(id);
    chart.clearBrush();   // the box no longer describes the selection
    emit([...next]);
  }

  // Numbered labels with leader lines for the notable countries. Each label is
  // placed greedily, in rank order, at whichever of 24 candidate offsets
  // overlaps the fewest points, earlier labels and quadrant names while
  // staying inside the plot.
  function drawAnnotations(layer, innerW, innerH, g) {
    const byId = new Map(rows.map(d => [d.m49, d]));
    const list = annotations.filter(a => byId.has(a.m49));
    const BADGE = 8;   // badge radius
    const GAP = 4;     // badge to text

    labels = layer.selectAll("g.annotation")
      .data(list, a => a.m49)
      .join("g")
      .attr("class", "annotation")
      .attr("role", "button")
      .attr("aria-label", a => `Notable country ${a.rank}: ${a.name}`);

    labels.append("line").attr("class", "annotation-leader");
    labels.append("circle").attr("class", "annotation-badge").attr("r", BADGE);
    labels.append("text").attr("class", "annotation-number")
      .attr("text-anchor", "middle").attr("dy", "0.35em")
      .text(a => a.rank);
    labels.append("text").attr("class", "annotation-name")
      .attr("dy", "0.35em")
      .text(a => a.name);

    // Obstacles: every point, and the four quadrant names.
    const pts = rows.map(d => [x(d.povertyReduction), y(d.completionGain)]);
    const blocked = [];
    quadLabels.each(function () {
      const b = this.getBBox();
      blocked.push([b.x, b.y, b.x + b.width, b.y + b.height]);
    });

    const overlap = (a, b) =>
      Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) *
      Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));

    labels.each(function (a) {
      const lbl = d3.select(this);
      const d = byId.get(a.m49);
      const px = x(d.povertyReduction), py = y(d.completionGain);
      const tw = lbl.select(".annotation-name").node().getComputedTextLength();

      let best = null;
      for (const dist of [22, 36, 54]) {
        for (let k = 0; k < 8; k++) {
          const ang = (k * Math.PI) / 4;
          const bx = px + dist * Math.cos(ang), by = py - dist * Math.sin(ang);
          const right = Math.cos(ang) >= -1e-9;   // text runs away from the point
          const box = right
            ? [bx - BADGE, by - BADGE, bx + BADGE + GAP + tw, by + BADGE]
            : [bx - BADGE - GAP - tw, by - BADGE, bx + BADGE, by + BADGE];
          let score = dist / 100;
          if (box[0] < 0 || box[1] < 0 || box[2] > innerW || box[3] > innerH) score += 1000;
          for (const [qx, qy] of pts) {
            if (qx === px && qy === py) continue;
            score += overlap(box, [qx - radius, qy - radius, qx + radius, qy + radius]) > 0 ? 1 : 0;
          }
          for (const b of blocked) score += overlap(box, b) > 0 ? 20 : 0;
          if (!best || score < best.score) best = { score, bx, by, right, box };
        }
      }
      blocked.push(best.box);

      const dx = best.bx - px, dy = best.by - py, len = Math.hypot(dx, dy);
      lbl.select(".annotation-leader")
        .attr("x1", px + (dx / len) * (radius + 1)).attr("y1", py + (dy / len) * (radius + 1))
        .attr("x2", best.bx - (dx / len) * BADGE).attr("y2", best.by - (dy / len) * BADGE);
      lbl.selectAll(".annotation-badge, .annotation-number")
        .attr("transform", `translate(${best.bx},${best.by})`);
      lbl.select(".annotation-name")
        .attr("x", best.right ? best.bx + BADGE + GAP : best.bx - BADGE - GAP)
        .attr("y", best.by)
        .attr("text-anchor", best.right ? "start" : "end");
    });

    labels
      .on("mouseover", (event, a) => {
        points.filter(d => d.m49 === a.m49).raise().classed("hovered", true);
        if (dispatcher) dispatcher.call("hover", null, event, byId.get(a.m49), "scatter");
      })
      .on("mousemove", (event, a) => {
        if (dispatcher) dispatcher.call("hover", null, event, byId.get(a.m49), "scatter");
      })
      .on("mouseout", (event, a) => {
        points.filter(d => d.m49 === a.m49).classed("hovered", false);
        if (dispatcher) dispatcher.call("hover", null, event, null, "scatter");
      })
      .on("click", (event, a) => clickSelect(event, a.m49));
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
    points
      .attr("fill", d => SDG.color(SDG.groupOf(d, thresholds.poverty, thresholds.completion)))
      .style("--group-color", d => SDG.color(SDG.groupOf(d, thresholds.poverty, thresholds.completion)));
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
    if (labels) labels.classed("faded", a => set.size > 0 && !set.has(a.m49));
    updateNote();
    return chart;
  };

  // Copy the I6 legend dimming from each point onto its annotation label.
  chart.syncOverlays = function () {
    if (!labels) return chart;
    const hidden = new Set();
    points.filter(".group-hidden").each(d => hidden.add(d.m49));
    labels.classed("group-hidden", a => hidden.has(a.m49));
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

  // Remove the brush rectangle without changing the selection. Called when the
  // selection comes from somewhere other than a brush gesture (a point click,
  // or the map via I2), so a stale box never contradicts the highlight.
  chart.clearBrush = function () {
    if (clearBrush) clearBrush();
    return chart;
  };

  // I5: clear the brush and the selection.
  chart.clear = function () {
    chart.clearBrush();
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
  chart.annotations = function (_) { return arguments.length ? (annotations = _, chart) : annotations; };

  return chart;
}
