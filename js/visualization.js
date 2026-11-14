// Immediately Invoked Function Expression to limit access to our
// variables and prevent conflicts between views.
((() => {

  // Shared event bus that links the views (see the implementation plan).
  const dispatch = d3.dispatch("select", "hover");

  // Thresholds live here and are pushed into every view, so I4 moves the
  // dashed lines in V1 and the fills in V2 together. Defaults come from P3.
  const thresholds = { ...SDG.DEFAULT_THRESHOLDS };

  Promise.all([
    d3.json("data/sdg.json"),
    d3.json("data/world.geojson"),
  ]).then(([sdg, world]) => {
    const byId = new Map(sdg.countries.map(c => [c.m49, c]));
    const groupOf = id => SDG.groupOf(byId.get(id), thresholds.poverty, thresholds.completion);

    // V1: quadrant scatterplot
    const scatter = quadrantScatter().dispatcher(dispatch);
    d3.select("#vis-scatter").datum(sdg.countries).call(scatter);

    // V2: choropleth world map
    const map = worldMap()
      .groupOf(groupOf)
      .color(SDG.color)
      .dispatcher(dispatch);
    d3.select("#vis-map").datum(world).call(map);

    // V4: legend, built from the shared group order so it always matches.
    buildLegend(d3.select("#vis-legend"));

    // I4: threshold sliders. Both views recolor from the same two numbers.
    wireSlider("#thr-poverty", "poverty");
    wireSlider("#thr-completion", "completion");

    // I5: reset.
    d3.select("#reset-selection").on("click", () => {
      scatter.clear();
      if (map.resetZoom) map.resetZoom();
    });

    // I1 and I2: a selection made in any view highlights the same countries
    // everywhere else.
    dispatch.on("select.map", (ids, source) => {
      if (source !== "map") map.highlight(ids);
    });
    dispatch.on("select.scatter", (ids, source) => {
      if (source !== "scatter") scatter.highlight(ids);
    });

    // I3: placeholder tooltip so hover is visible while the detail panel is
    // built. Ashenaffi owns the full version; replace the body below.
    const tip = d3.select("body").append("div").attr("class", "tooltip").style("opacity", 0);
    dispatch.on("hover.tip", (event, d, source) => {
      const c = source === "map" ? byId.get(d && d.id) : d;
      if (!c) { tip.style("opacity", 0).style("pointer-events", "none"); return; }
      const grp = SDG.groupOf(c, thresholds.poverty, thresholds.completion);
      tip.html(`<strong>${c.name}</strong><br>`
        + `Poverty removed: ${SDG.labelSlope(c.povertyReduction)} (${SDG.fmtYears(c.povertyYears)})<br>`
        + `Completion gained: ${SDG.labelSlope(c.completionGain)} (${SDG.fmtYears(c.completionYears)})<br>`
        + `Group: ${grp == null ? "no trend" : grp}`)
        .style("left", `${event.pageX + 14}px`)
        .style("top", `${event.pageY - 12}px`)
        .style("opacity", 1);
    });

    function wireSlider(sel, key) {
      const input = d3.select(sel);
      const out = d3.select(`${sel}-value`);
      const range = SDG.THRESHOLD_RANGE[key];
      input
        .attr("min", range.min).attr("max", range.max)
        .attr("step", range.step).attr("value", thresholds[key])
        .on("input", function () {
          thresholds[key] = +this.value;
          out.text(SDG.fmtSlope(thresholds[key]));
          scatter.thresholds({ [key]: thresholds[key] });
          map.recolor();
        });
      out.text(SDG.fmtSlope(thresholds[key]));
    }
  });

  // V4: categorical key. Clicking an item dims that group in both views (I6).
  function buildLegend(root) {
    const hidden = new Set();
    const items = root.selectAll("div.legend-item")
      .data(SDG.GROUPS.concat([null]))   // null is the no-data swatch
      .join("div")
      .attr("class", "legend-item")
      .attr("role", "button")
      .attr("tabindex", 0);

    items.append("span")
      .attr("class", "legend-swatch")
      .style("background", d => SDG.color(d));
    items.append("span")
      .attr("class", "legend-label")
      .text(d => d == null ? "No trend available" : d);

    items.filter(d => d != null).on("click", function (event, d) {
      if (hidden.has(d)) hidden.delete(d); else hidden.add(d);
      d3.select(this).classed("legend-off", hidden.has(d));
      d3.selectAll(".country-point, .world-map .country")
        .classed("group-hidden", function () {
          const fill = this.getAttribute("fill");
          return [...hidden].some(g => SDG.color(g) === fill);
        });
    });
  }

})());
