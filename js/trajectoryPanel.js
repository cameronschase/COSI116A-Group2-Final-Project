/**
 * trajectoryPanel.js  (V3 Trajectory Panel + I3 Tooltips)
 * Owner: Communications Director
 *
 * Two stacked line charts sharing ONE year axis:
 *   (a) extreme poverty rate (%) vs. year
 *   (b) upper-secondary completion rate (%) vs. year
 * Each selected country gets a line + dots (survey points) and a dashed
 * least-squares trend line. Hovering shows a tooltip (I3).
 *
 * Follows the Reusable Chart model (https://bost.ocks.org/mike/chart/).
 * Works with D3 v4+ (uses native DOM events, so no d3.event / d3.pointer).
 *
 * Expected country object (shape the preprocessing script P1 should emit):
 * {
 *   id: "KEN", name: "Kenya", group: "Q1",
 *   poverty:    [{year: 2005, value: 43.4}, ...],   // raw survey points
 *   completion: [{year: 2003, value: 20.1}, ...],
 *   povertyReduction: 1.2,     // optional; pp/yr removed (positive = poverty fell)
 *   completionGain: 0.9,       // optional; pp/yr gained
 *   povertyYears: [2005, 2019], completionYears: [2003, 2020]   // optional spans
 * }
 *
 * Trends use SDG.slopePerYear (js/constants.js, load it first), so a country
 * with fewer than 3 survey points gets no trend line here, matching the gray
 * "no trend" fill in V1 and V2. The tooltip reports trends in the same
 * direction as the rest of the page: poverty *removed* and completion *gained*.
 *
 * Usage:
 *   const panel = trajectoryPanel().colorOf(c => COLORS[c.group]);
 *   d3.select("#vis-trajectory").call(panel);
 *   panel.update(selectedCountries);   // call whenever the selection changes
 *   panel.on("hover", id => { ... });  // id or null; for reverse linking (I7)
 */
function trajectoryPanel() {
  // ---- configurable (fixed size: nothing resizes while interacting) ----
  let width = 960;                      // same viewBox width as the map; css scales it to the holder
  let height = 620;
  const margin = { top: 34, right: 24, bottom: 48, left: 70 };
  const gap = 48;                       // space between the two panels
  let colorOf = c => SDG.color(c.group); // shared palette (P3, js/constants.js)
  let xDomain = [2000, 2025];           // survey years in sdg.json; fixed so the axis never jumps
  const dispatcher = d3.dispatch("hover");

  // ---- internal refs ----
  let svg, gRoot, gPanels, guide, overlay, tip;
  let panels;                           // [{key, title, yLabel, y, top, h}]
  let x;                                // shared x scale
  let selected = [];

  const PANEL_DEFS = [
    { key: "poverty", title: "(a) Extreme poverty rate", yLabel: "% in extreme poverty" },
    { key: "completion", title: "(b) Upper-secondary completion rate", yLabel: "% completing" }
  ];

  // Least-squares fit y = a + b*x. The slope comes from SDG.slopePerYear so
  // the panel applies the same rule as P2 (null with fewer than 3 points);
  // the intercept is only needed here to draw the dashed trend line.
  function leastSquares(pts) {
    const b = SDG.slopePerYear(pts);
    if (b == null || !isFinite(b)) return null;
    const valid = pts.filter(p => p.value != null);
    const mx = d3.mean(valid, p => p.year), my = d3.mean(valid, p => p.value);
    return { slope: b, intercept: my - b * mx };
  }

  // Upper bound of the y axis for one indicator, given the current selection.
  function yMax(key) {
    let hi = 0;
    selected.forEach(c => {
      (c[key] || []).forEach(p => { if (p.value != null) hi = Math.max(hi, p.value); });
      const f = c._fit[key];
      if (f) spanOf(c[key]).forEach(yr => { hi = Math.max(hi, f.intercept + f.slope * yr); });
    });
    if (!selected.length) return 100;                       // nothing selected: full 0-100% scale
    const top = d3.scaleLinear().domain([0, Math.max(hi, 1) * 1.05]).nice(5).domain()[1];
    return Math.min(100, top);
  }

  // Year span of a series, as [first, last] for SDG.fmtYears.
  const spanOf = pts => (pts && pts.length)
    ? [d3.min(pts, p => p.year), d3.max(pts, p => p.year)] : [null, null];

  function chart(selection) {
    // Build the static skeleton once.
    svg = selection.append("svg")
      .attr("class", "trajectory-panel")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("preserveAspectRatio", "xMidYMid meet")
      .attr("role", "img")
      .attr("aria-label", "Extreme poverty and upper-secondary completion over time for the selected countries");

    gRoot = svg.append("g");
    const innerW = width - margin.left - margin.right;
    const panelH = (height - margin.top - margin.bottom - gap) / 2;

    x = d3.scaleLinear().domain(xDomain).range([margin.left, margin.left + innerW]);

    panels = PANEL_DEFS.map((def, i) => {
      const top = margin.top + i * (panelH + gap);
      return Object.assign({}, def, {
        top, h: panelH,
        y: d3.scaleLinear().domain([0, 100]).range([top + panelH, top])
      });
    });

    gPanels = gRoot.selectAll("g.panel").data(panels).enter().append("g")
      .attr("class", d => "panel panel-" + d.key);

    // Panel frames, titles, y-axis labels
    gPanels.append("rect").attr("x", margin.left).attr("y", d => d.top)
      .attr("width", innerW).attr("height", d => d.h)
      .attr("fill", "none").attr("stroke", "#ccc");
    gPanels.append("text").attr("x", margin.left).attr("y", d => d.top - 8)
      .attr("font-size", 14).attr("font-weight", "bold").text(d => d.title);
    gPanels.append("text").attr("class", "y-label")
      .attr("transform", d => `translate(16,${d.top + d.h / 2}) rotate(-90)`)
      .attr("text-anchor", "middle").attr("font-size", 12).attr("fill", "#555")
      .text(d => d.yLabel);
    gPanels.append("g").attr("class", "y-axis")
      .attr("transform", `translate(${margin.left},0)`);
    gPanels.append("clipPath").attr("id", d => "traj-clip-" + d.key)
      .append("rect").attr("x", margin.left - 5).attr("y", d => d.top - 5)
      .attr("width", innerW + 10).attr("height", d => d.h + 10);
    gPanels.append("g").attr("class", "series").attr("clip-path", d => `url(#traj-clip-${d.key})`);

    // Shared x axis: drawn once, under the bottom panel only
    gRoot.append("g").attr("class", "x-axis")
      .attr("transform", `translate(0,${panels[1].top + panelH})`)
      .call(d3.axisBottom(x).tickFormat(d3.format("d"))
        .tickValues(d3.range(xDomain[0], xDomain[1] + 1, 5)));
    gRoot.append("text").attr("x", margin.left + innerW / 2).attr("y", height - 8)
      .attr("text-anchor", "middle").attr("font-size", 12).attr("fill", "#555")
      .text("Year");

    // Hover guide + empty-state message
    guide = gRoot.append("line").attr("class", "guide")
      .attr("y1", margin.top).attr("y2", panels[1].top + panelH)
      .attr("stroke", "#888").attr("stroke-dasharray", "2,2").style("display", "none");

    // Tooltip (HTML div so it can overflow the SVG). Styled inline so it works
    // without touching style.css.
    tip = d3.select("body").append("div");
    tip.attr("class", "trajectory-tooltip")
      .style("position", "absolute").style("pointer-events", "none")
      .style("background", "rgba(255,255,255,0.97)").style("border", "1px solid #999")
      .style("border-radius", "4px").style("padding", "6px 8px")
      .style("font", "12px sans-serif").style("line-height", "1.4")
      .style("box-shadow", "0 2px 6px rgba(0,0,0,.2)").style("display", "none")
      .style("z-index", 1000);

    // Transparent overlay captures the mouse across both panels
    overlay = gRoot.append("rect").attr("class", "overlay")
      .attr("x", margin.left).attr("y", margin.top)
      .attr("width", innerW).attr("height", height - margin.top - margin.bottom)
      .attr("fill", "none").style("pointer-events", "all");
    const node = overlay.node();
    node.addEventListener("mousemove", onMove);
    node.addEventListener("mouseleave", onLeave);

    chart.update([]);
    return chart;
  }

  // Redraw for a new selection (called by the brush/click linking code).
  chart.update = function (countries) {
    selected = (countries || []).map(c => {
      const pFit = leastSquares(c.poverty), cFit = leastSquares(c.completion);
      return Object.assign({}, c, {
        _fit: { poverty: pFit, completion: cFit },
        // Tooltip values in the page-wide direction. Prefer the precomputed
        // P2 values; otherwise flip the poverty slope so a fall is positive.
        _trend: {
          povertyRemoved: c.povertyReduction !== undefined ? c.povertyReduction
            : (pFit ? -pFit.slope : null),
          completionGained: c.completionGain !== undefined ? c.completionGain
            : (cFit ? cFit.slope : null)
        },
        _span: {
          poverty: c.povertyYears || spanOf(c.poverty),
          completion: c.completionYears || spanOf(c.completion)
        }
      });
    });

    // Both y axes auto-scale to the selection. The top of each axis covers every
    // survey point and the end of every trend line (trends can run past the data),
    // with a little headroom, rounded to a nice tick. Rates stay within 0-100%, and
    // anything outside the frame is clipped rather than drawn over the labels.
    panels.forEach(p => p.y.domain([0, yMax(p.key)]));

    gPanels.each(function (p) {
      const g = d3.select(this);
      g.select("g.y-axis").call(d3.axisLeft(p.y).ticks(5));
      const line = d3.line().x(d => x(d.year)).y(d => p.y(d.value));

      const groups = g.select("g.series").selectAll("g.country")
        .data(selected, d => d.id);
      groups.exit().remove();
      const enter = groups.enter().append("g").attr("class", "country");
      enter.append("path").attr("class", "obs").attr("fill", "none").attr("stroke-width", 1.5);
      enter.append("path").attr("class", "trend").attr("fill", "none")
        .attr("stroke-width", 2.5).attr("stroke-dasharray", "7,4");
      const all = enter.merge(groups);
      all.attr("data-id", d => d.id);

      all.select("path.obs")
        .attr("stroke", d => colorOf(d)).attr("stroke-opacity", 0.55)
        .attr("d", d => line((d[p.key] || []).slice().sort((a, b) => a.year - b.year)));

      // Least-squares trend line, drawn only across the country's own year span
      all.select("path.trend").attr("stroke", d => colorOf(d))
        .attr("d", d => {
          const fit = d._fit[p.key], pts = d[p.key] || [];
          if (!fit) return null;
          const x0 = d3.min(pts, q => q.year), x1 = d3.max(pts, q => q.year);
          return line([x0, x1].map(yr => ({ year: yr, value: fit.intercept + fit.slope * yr })));
        });

      // Survey points (dots)
      all.each(function (d) {
        const dots = d3.select(this).selectAll("circle.pt")
          .data((d[p.key] || []).map(q => Object.assign({ id: d.id }, q)));
        dots.exit().remove();
        dots.enter().append("circle").attr("class", "pt")
          .merge(dots).attr("r", 3)
          .attr("cx", q => x(q.year)).attr("cy", q => p.y(q.value))
          .attr("fill", colorOf(d)).attr("stroke", "#fff").attr("stroke-width", 0.8);
      });
    });
    onLeave();
  };

  // ---- I3: tooltip + hover highlight ----
  function onMove(ev) {
    if (!selected.length) return;
    const box = overlay.node().ownerSVGElement.getBoundingClientRect();
    const k = width / box.width;                       // css px -> viewBox units
    const mx = (ev.clientX - box.left) * k, my = (ev.clientY - box.top) * k;
    const panel = panels.find(p => my >= p.top - gap / 2 && my <= p.top + p.h + gap / 2);
    if (!panel) return onLeave();

    // nearest survey point (in pixels) within the hovered panel
    let best = null, bestD = 22 * (width / 760);       // pick radius, scaled with the drawing
    selected.forEach(c => (c[panel.key] || []).forEach(q => {
      const d = Math.hypot(x(q.year) - mx, panel.y(q.value) - my);
      if (d < bestD) { bestD = d; best = { c, q }; }
    }));
    if (!best) return onLeave();

    const c = best.c;
    guide.attr("x1", x(best.q.year)).attr("x2", x(best.q.year)).style("display", null);
    gPanels.selectAll("g.country").style("opacity", d => d.id === c.id ? 1 : 0.2);
    gPanels.selectAll("circle.pt").attr("r", q => (q === best.q || (q.id === c.id && q.year === best.q.year)) ? 5 : 3);

    const unit = panel.key === "poverty" ? "% in extreme poverty" : "% completion";
    tip.html(
      `<b>${c.name}</b> <span style="color:#666">(${c.group})</span><br>` +
      `${best.q.year}: <b>${best.q.value.toFixed(1)}</b> ${unit}<br>` +
      `Poverty removed: ${SDG.labelSlope(c._trend.povertyRemoved)} <span style="color:#666">(${SDG.fmtYears(c._span.poverty)})</span><br>` +
      `Completion gained: ${SDG.labelSlope(c._trend.completionGained)} <span style="color:#666">(${SDG.fmtYears(c._span.completion)})</span>`
    ).style("display", "block");
    // Keep the tooltip on screen: flip it to the left of the pointer near the right edge.
    const tw = tip.node().offsetWidth;
    const left = ev.pageX + 14 + tw > window.scrollX + document.documentElement.clientWidth
      ? ev.pageX - tw - 14 : ev.pageX + 14;
    tip.style("left", left + "px").style("top", (ev.pageY + 14) + "px");

    dispatcher.call("hover", chart, c.id);
  }

  function onLeave() {
    if (!guide) return;
    guide.style("display", "none");
    tip.style("display", "none");
    gPanels.selectAll("g.country").style("opacity", 1);
    gPanels.selectAll("circle.pt").attr("r", 3);
    dispatcher.call("hover", chart, null);
  }

  // External highlight (for I7 reverse linking from the scatter/map)
  chart.highlight = function (id) {
    gPanels.selectAll("g.country").style("opacity", d => (id == null || d.id === id) ? 1 : 0.2);
    return chart;
  };

  // ---- getters/setters (Reusable Chart model) ----
  chart.width = function (_) { return arguments.length ? (width = +_, chart) : width; };
  chart.height = function (_) { return arguments.length ? (height = +_, chart) : height; };
  chart.colorOf = function (_) { return arguments.length ? (colorOf = _, chart) : colorOf; };
  chart.xDomain = function (_) { return arguments.length ? (xDomain = _, chart) : xDomain; };
  chart.on = function () {
    const v = dispatcher.on.apply(dispatcher, arguments);
    return v === dispatcher ? chart : v;
  };
  chart.leastSquares = leastSquares;   // exposed so P1/P2 can reuse the same rule

  return chart;
}