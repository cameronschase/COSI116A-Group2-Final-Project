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
 *   povertySlope: -1.2,        // optional; computed here if missing (pp/yr)
 *   completionSlope: 0.9       // optional; computed here if missing (pp/yr)
 * }
 *
 * Usage:
 *   const panel = trajectoryPanel().colorOf(c => COLORS[c.group]);
 *   d3.select("#trajectory").call(panel);
 *   panel.update(selectedCountries);   // call whenever the selection changes
 *   panel.on("hover", id => { ... });  // id or null; for reverse linking (I7)
 */
function trajectoryPanel() {
  // ---- configurable (fixed size: nothing resizes while interacting) ----
  let width = 640;
  let height = 460;
  const margin = { top: 30, right: 20, bottom: 44, left: 58 };
  const gap = 38;                       // space between the two panels
  let colorOf = () => "#4c78a8";        // swap in the shared palette (P3)
  let xDomain = [1990, 2024];           // fixed so the axis never jumps
  const dispatcher = d3.dispatch("hover");

  // ---- internal refs ----
  let svg, gRoot, gPanels, guide, overlay, emptyMsg, tip;
  let panels;                           // [{key, title, yLabel, y, top, h}]
  let x;                                // shared x scale
  let selected = [];

  const PANEL_DEFS = [
    { key: "poverty", title: "(a) Extreme poverty rate", yLabel: "% in extreme poverty" },
    { key: "completion", title: "(b) Upper-secondary completion rate", yLabel: "% completing" }
  ];

  // Least-squares fit y = a + b*x. Returns null with fewer than 2 distinct years.
  function leastSquares(pts) {
    if (!pts || pts.length < 2) return null;
    const n = pts.length;
    const mx = d3.mean(pts, p => p.year), my = d3.mean(pts, p => p.value);
    let sxx = 0, sxy = 0;
    pts.forEach(p => { sxx += (p.year - mx) ** 2; sxy += (p.year - mx) * (p.value - my); });
    if (sxx === 0) return null;
    const b = sxy / sxx;
    return { slope: b, intercept: my - b * mx };
  }

  const fmtSlope = s => (s == null || isNaN(s)) ? "no trend" :
    (s > 0 ? "+" : "") + s.toFixed(2) + " pp/yr";
  const spanText = pts => (pts && pts.length >= 2)
    ? d3.min(pts, p => p.year) + "–" + d3.max(pts, p => p.year) : "n/a";

  function chart(selection) {
    // Build the static skeleton once.
    svg = selection.append("svg")
      .attr("class", "trajectory-panel")
      .attr("width", width).attr("height", height)
      .attr("viewBox", `0 0 ${width} ${height}`);

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
      .attr("font-size", 12).attr("font-weight", "bold").text(d => d.title);
    gPanels.append("text").attr("class", "y-label")
      .attr("transform", d => `translate(14,${d.top + d.h / 2}) rotate(-90)`)
      .attr("text-anchor", "middle").attr("font-size", 11).attr("fill", "#555")
      .text(d => d.yLabel);
    gPanels.append("g").attr("class", "y-axis")
      .attr("transform", `translate(${margin.left},0)`);
    gPanels.append("g").attr("class", "series");

    // Shared x axis: drawn once, under the bottom panel only
    gRoot.append("g").attr("class", "x-axis")
      .attr("transform", `translate(0,${panels[1].top + panelH})`)
      .call(d3.axisBottom(x).tickFormat(d3.format("d")).ticks(8));
    gRoot.append("text").attr("x", margin.left + innerW / 2).attr("y", height - 8)
      .attr("text-anchor", "middle").attr("font-size", 11).attr("fill", "#555")
      .text("Year");

    // Hover guide + empty-state message
    guide = gRoot.append("line").attr("class", "guide")
      .attr("y1", margin.top).attr("y2", panels[1].top + panelH)
      .attr("stroke", "#888").attr("stroke-dasharray", "2,2").style("display", "none");
    emptyMsg = gRoot.append("text").attr("x", margin.left + innerW / 2)
      .attr("y", height / 2).attr("text-anchor", "middle").attr("font-size", 13)
      .attr("fill", "#888").text("Brush the scatterplot or click countries on the map to see trajectories");

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
        // prefer precomputed slopes from the preprocessing script
        _slope: {
          poverty: c.povertySlope != null ? c.povertySlope : (pFit && pFit.slope),
          completion: c.completionSlope != null ? c.completionSlope : (cFit && cFit.slope)
        }
      });
    });

    emptyMsg.style("display", selected.length ? "none" : null);

    // Poverty y-domain adapts to the data; completion stays 0-100.
    const maxPov = d3.max(selected, c => d3.max(c.poverty || [], p => p.value)) || 100;
    panels[0].y.domain([0, Math.max(10, Math.ceil(maxPov / 10) * 10)]);
    panels[1].y.domain([0, 100]);

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
        .attr("stroke-width", 2).attr("stroke-dasharray", "6,3");
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
    const mx = ev.clientX - box.left, my = ev.clientY - box.top;
    const panel = panels.find(p => my >= p.top - gap / 2 && my <= p.top + p.h + gap / 2);
    if (!panel) return onLeave();

    // nearest survey point (in pixels) within the hovered panel
    let best = null, bestD = 22;
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
      `Poverty trend: ${fmtSlope(c._slope.poverty)} <span style="color:#666">(${spanText(c.poverty)})</span><br>` +
      `Completion trend: ${fmtSlope(c._slope.completion)} <span style="color:#666">(${spanText(c.completion)})</span>`
    ).style("display", "block")
      .style("left", (ev.pageX + 14) + "px").style("top", (ev.pageY + 14) + "px");

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