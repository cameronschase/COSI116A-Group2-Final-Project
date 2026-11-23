// Immediately Invoked Function Expression to limit access to our
// variables and prevent conflicts between views.
((() => {

  // Shared event bus that links the views (see the implementation plan).
  const dispatch = d3.dispatch("select", "hover", "legend");

  // Thresholds live here and are pushed into every view, so I4 moves the
  // dashed lines in V1 and the fills in V2 together. Defaults come from P3.
  const thresholds = { ...SDG.DEFAULT_THRESHOLDS };

  Promise.all([
    d3.json("data/sdg.json"),
    d3.json("data/world.geojson"),
    d3.csv("data/regions.csv"),
  ]).then(([sdg, world, regions]) => {
    const byId = new Map(sdg.countries.map(c => [c.m49, c]));
    const groupOf = id => SDG.groupOf(byId.get(id), thresholds.poverty, thresholds.completion);

    // Notable countries, chosen by the fixed rule in js/constants.js and
    // annotated in V1, V2 and the tooltip.
    const annotations = SDG.notableCountries(sdg.countries);
    const annotationOf = new Map(annotations.map(a => [a.m49, a]));

    // V1: quadrant scatterplot
    const scatter = quadrantScatter()
      .annotations(annotations)
      .dispatcher(dispatch);
    d3.select("#vis-scatter").datum(sdg.countries).call(scatter);

    // V2: choropleth world map
    const map = worldMap()
      .groupOf(groupOf)
      .color(SDG.color)
      .annotations(annotations)
      .isThin(id => SDG.isThinEvidence(byId.get(id)))
      .dispatcher(dispatch);
    d3.select("#vis-map").datum(world).call(map);

    // V3: trajectory panel. It keys countries on `id` and labels them with
    // `group`, so adapt each record (m49 -> id, current thresholds -> group).
    const trajectory = trajectoryPanel()
      .colorOf(c => SDG.color(c.group));
    d3.select("#vis-trajectory").call(trajectory);
    let selectedIds = [];
    const updateTrajectory = () => {
      trajectory.update(
        selectedIds.map(id => byId.get(id)).filter(Boolean)
          .map(c => ({ ...c, id: c.m49, group: groupOf(c.m49) ?? "no trend" })));
      applyLegend();   // new trajectory lines need the current dimming
    };

    // V4: legend (js/legend.js), built from the shared group order so it
    // always matches. Group entries hide their group, "No trend available"
    // hides the gray countries. The two annotation entries are "show only"
    // filters: while one is active, countries that match none of the active
    // filters are dimmed. A country stays visible when its group is on and,
    // if any filter is active, it matches at least one of them.
    let legendHidden = new Set();    // groups toggled off (null = no trend)
    let legendFocused = new Set();   // sdgLegend.THIN / sdgLegend.NOTABLE toggled on
    // I9: region filter. regionOf covers every country on the map (also the
    // gray ones with no SDG data), so the filter dims the whole map evenly.
    const regionOf = new Map(regions.map(r => [r.m49, r]));
    let regionFilter = { region: "", subregion: "" };   // "" = all
    const inRegion = id => {
      if (!regionFilter.region) return true;
      const r = regionOf.get(id);
      if (!r || r.region !== regionFilter.region) return false;
      return !regionFilter.subregion || r.subregion === regionFilter.subregion;
    };

    const isLegendHidden = id => {
      if (!inRegion(id)) return true;
      const c = byId.get(id);
      if (legendFocused.size) {
        const match = !!c && (
          (legendFocused.has(sdgLegend.THIN) && SDG.isThinEvidence(c)) ||
          (legendFocused.has(sdgLegend.NOTABLE) && annotationOf.has(id)));
        if (!match) return true;
      }
      return legendHidden.has(groupOf(id));   // groupOf is null with no trend
    };
    function applyLegend() {
      d3.selectAll(".country-point").classed("group-hidden", d => isLegendHidden(d.m49));
      d3.selectAll(".world-map .country").classed("group-hidden", d => isLegendHidden(d.id));
      d3.selectAll(".trajectory-panel g.country").classed("group-hidden", d => isLegendHidden(d.id));
      scatter.syncOverlays();
      map.syncOverlays();
    }
    const legend = sdgLegend().dispatcher(dispatch);
    d3.select("#vis-legend").call(legend);
    // I4: legend counts follow the thresholds (null = no trend).
    const updateCounts = () => legend.counts(
      d3.rollup(sdg.countries, v => v.length, c => groupOf(c.m49)));
    updateCounts();
    dispatch.on("legend.app", ({ hidden, focused }) => {
      legendHidden = hidden;
      legendFocused = focused;
      applyLegend();
    });

    // I4: threshold sliders. Both views recolor from the same two numbers.
    wireSlider("#thr-poverty", "poverty");
    wireSlider("#thr-completion", "completion");

    // I9: region and sub-region dropdowns.
    const regionSel = d3.select("#region-filter");
    const subregionSel = d3.select("#subregion-filter");
    const regionNames = [...new Set(regions.map(r => r.region))].sort();
    regionSel.selectAll("option.region").data(regionNames).join("option")
      .attr("class", "region").attr("value", d => d).text(d => d);
    const fillSubregions = () => {
      const subs = regionFilter.region
        ? [...new Set(regions.filter(r => r.region === regionFilter.region).map(r => r.subregion))].sort()
        : [];
      subregionSel.selectAll("option.subregion").data(subs, d => d).join("option")
        .attr("class", "subregion").attr("value", d => d).text(d => d);
      subregionSel.property("value", regionFilter.subregion)
        .property("disabled", !regionFilter.region);
    };
    const applyRegion = () => {
      fillSubregions();
      applyLegend();
      const ids = regions.filter(r => inRegion(r.m49) && byId.has(r.m49)).map(r => r.m49);
      if (map.zoomTo) map.zoomTo(regionFilter.region ? ids : []);
      const withTrend = ids.filter(id => groupOf(id) != null).length;
      d3.select("#region-count").text(regionFilter.region
        ? `${withTrend} of these countries have both trends`
        : "");
    };
    regionSel.on("change", function () {
      regionFilter = { region: this.value, subregion: "" };
      applyRegion();
    });
    subregionSel.on("change", function () {
      regionFilter = { ...regionFilter, subregion: this.value };
      applyRegion();
    });
    fillSubregions();

    // I5: reset. Clears the selection in every view, zooms the map out,
    // returns both sliders to the P3 defaults, shows every legend group, and
    // clears the region filter (I9) and the "Where do you fit" panel (I10).
    d3.select("#reset-selection").on("click", () => {
      scatter.clear();
      if (map.resetZoom) map.resetZoom();
      for (const key of ["poverty", "completion"]) {
        d3.select(`#thr-${key}`)
          .property("value", SDG.DEFAULT_THRESHOLDS[key])
          .dispatch("input");   // same path as dragging, so every view follows
      }
      legend.reset();
      if (regionFilter.region) {
        regionFilter = { region: "", subregion: "" };
        regionSel.property("value", "");
        fillSubregions();
        applyLegend();
        d3.select("#region-count").text("");
      }
      showFit(null);
    });

    // I1 and I2: a selection made in any view highlights the same countries
    // everywhere else.
    dispatch.on("select.map", (ids, source) => {
      if (source !== "map") map.highlight(ids);
    });
    dispatch.on("select.scatter", (ids, source) => {
      if (source === "scatter") return;
      // A selection from another view replaces the brushed one, so remove the
      // brush box as well as moving the highlight.
      scatter.clearBrush().highlight(ids);
    });
    dispatch.on("select.trajectory", ids => {
      selectedIds = ids;
      updateTrajectory();
    });
    // I10: when exactly one country is selected in any view, describe it in
    // the "Where do you fit" panel.
    dispatch.on("select.fit", (ids, source) => {
      if (source === "fit") return;
      if (ids.length === 1) showFit(ids[0]);
    });

    // I10: "Where does your country fit?" Pick a country to select it in every
    // view, see how its trends compare with the other countries and its
    // sub-region, and get links to organizations working on what lags.
    const fitSel = d3.select("#fit-country");
    const named = sdg.countries.slice().sort((a, b) => d3.ascending(a.name, b.name));
    fitSel.selectAll("option.country").data(named).join("option")
      .attr("class", "country").attr("value", c => c.m49).text(c => c.name);
    fitSel.on("change", function () {
      const id = this.value;
      showFit(id || null);
      // Countries without both trends have no point or color, so (as on the
      // map) they are described but not selected.
      const ids = id && groupOf(id) != null ? [id] : [];
      dispatch.call("select", null, ids, "fit");
    });

    const withBoth = sdg.countries.filter(c => c.povertyReduction != null && c.completionGain != null);
    // Share of countries (with that trend) the given value beats, as a whole percent.
    const beats = (key, v) => {
      const vals = sdg.countries.map(c => c[key]).filter(x => x != null);
      return Math.round(100 * vals.filter(x => x < v).length / vals.length);
    };
    const latest = pts => (pts && pts.length ? pts[pts.length - 1] : null);
    const fmtPct = d3.format(".1f");

    function showFit(id) {
      const out = d3.select("#fit-result");
      fitSel.property("value", id || "");
      const c = id && byId.get(id);
      if (!c) { out.html("").classed("fit-empty", true); return; }
      out.classed("fit-empty", false);
      const grp = groupOf(id);
      const reg = regionOf.get(id);
      const lp = latest(c.poverty), lc = latest(c.completion);

      let html = `<h3>${c.name}${reg ? ` <span class="fit-region">${reg.subregion}, ${reg.region}</span>` : ""}</h3>`;
      html += `<p class="fit-group">`
        + (grp == null
          ? `<span class="legend-swatch" style="background:${SDG.NO_DATA}"></span> No group: this country does not have enough surveys for both trends.`
          : `<span class="legend-swatch" style="background:${SDG.color(grp)}"></span> <strong>${grp}</strong> at the current thresholds.`)
        + `</p><ul>`;
      html += `<li><strong>Extreme poverty:</strong> `
        + (lp ? `${fmtPct(lp.value)}% in ${lp.year}. ` : "no surveys. ")
        + (c.povertyReduction != null
          ? `Falling by ${SDG.labelSlope(c.povertyReduction)}, faster than ${beats("povertyReduction", c.povertyReduction)}% of countries with a poverty trend.`
          : "Too few surveys for a trend.")
        + `</li>`;
      html += `<li><strong>Upper-secondary completion:</strong> `
        + (lc ? `${fmtPct(lc.value)}% in ${lc.year}. ` : "no surveys. ")
        + (c.completionGain != null
          ? `Rising by ${SDG.labelSlope(c.completionGain)}, faster than ${beats("completionGain", c.completionGain)}% of countries with a completion trend.`
          : "Too few surveys for a trend.")
        + `</li>`;
      // Compare with the median of the same sub-region.
      if (reg && grp != null) {
        const peers = withBoth.filter(p => (regionOf.get(p.m49) || {}).subregion === reg.subregion);
        if (peers.length > 1) {
          const mp = d3.median(peers, p => p.povertyReduction);
          const mc = d3.median(peers, p => p.completionGain);
          html += `<li><strong>Compared with ${reg.subregion}</strong> (${peers.length} countries with both trends):`
            + ` poverty is falling ${c.povertyReduction >= mp ? "faster" : "slower"} than the median (${SDG.labelSlope(mp)})`
            + ` and completion is rising ${c.completionGain >= mc ? "faster" : "slower"} than the median (${SDG.labelSlope(mc)}).</li>`;
        }
      }
      html += `</ul>`;
      if (SDG.isThinEvidence(c)) {
        html += `<p class="tip-caution">At least one trend is fit to only ${SDG.THIN_EVIDENCE_N} surveys. Read with caution.</p>`;
      }

      // Organizations: lead with the goal that is lagging for this country.
      const povLags = c.povertyReduction == null || c.povertyReduction < thresholds.poverty;
      const cmpLags = c.completionGain == null || c.completionGain < thresholds.completion;
      const lists = [
        { title: "Ending extreme poverty (SDG 1)", lags: povLags, orgs: ORGS.poverty },
        { title: "Getting students through secondary school (SDG 4)", lags: cmpLags, orgs: ORGS.education },
      ].sort((a, b) => b.lags - a.lags);
      html += `<div class="fit-orgs"><p><strong>Learn more or get involved</strong></p>`;
      for (const l of lists) {
        html += `<p class="fit-orgs-title">${l.title}${l.lags ? " <em>(below threshold here)</em>" : ""}</p><ul>`
          + l.orgs.map(o => `<li><a href="${o.url}" target="_blank" rel="noopener">${o.name}</a>: ${o.what}</li>`).join("")
          + `</ul>`;
      }
      html += `</div>`;
      out.html(html);
    }

    // I3: placeholder tooltip so hover is visible while the detail panel is
    // built. Ashenaffi owns the full version; replace the body below.
    const tip = d3.select("body").append("div").attr("class", "tooltip").style("opacity", 0);
    dispatch.on("hover.tip", (event, d, source) => {
      const c = source === "map" ? byId.get(d && d.id) : d;
      if (!c) { tip.style("opacity", 0).style("pointer-events", "none"); return; }
      const grp = SDG.groupOf(c, thresholds.poverty, thresholds.completion);
      const ann = annotationOf.get(c.m49);
      let html = `<strong>${ann ? `${ann.rank}. ` : ""}${c.name}</strong><br>`
        + `Poverty removed: ${SDG.labelSlope(c.povertyReduction)} (${SDG.fmtYears(c.povertyYears)}${surveys(c.povertyN)})<br>`
        + `Completion gained: ${SDG.labelSlope(c.completionGain)} (${SDG.fmtYears(c.completionYears)}${surveys(c.completionN)})<br>`
        + `Group: ${grp == null ? "no trend" : grp}`;
      if (SDG.isThinEvidence(c)) {
        html += `<div class="tip-caution">Trend fit to only ${SDG.THIN_EVIDENCE_N} surveys. Read with caution.</div>`;
      }
      if (ann) {
        html += `<div class="tip-annotation">${ann.reasons.join("<br>")}</div>`;
      }
      tip.html(html)
        .style("left", `${event.pageX + 14}px`)
        .style("top", `${event.pageY - 12}px`)
        .style("opacity", 1);
    });

    function surveys(n) { return n == null ? "" : `, ${n} survey${n === 1 ? "" : "s"}`; }

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
          updateCounts();
          applyLegend();        // a country can change group, so re-check what is dimmed
          updateTrajectory();   // groups, and so line colors, depend on thresholds
        });
      out.text(SDG.fmtSlope(thresholds[key]));
    }
  });

  // I10: organizations linked from the "Where do you fit" panel. Global
  // organizations only, so every country gets links that apply to it.
  const ORGS = {
    poverty: [
      { name: "UN SDG 1: No Poverty", url: "https://sdgs.un.org/goals/goal1", what: "the targets and indicators behind this page's poverty data" },
      { name: "World Bank: Poverty", url: "https://www.worldbank.org/en/topic/poverty", what: "poverty research and country data" },
      { name: "UNDP", url: "https://www.undp.org/", what: "UN development programme working in about 170 countries" },
    ],
    education: [
      { name: "UN SDG 4: Quality Education", url: "https://sdgs.un.org/goals/goal4", what: "the targets and indicators behind this page's completion data" },
      { name: "UNESCO Institute for Statistics", url: "https://uis.unesco.org/", what: "the source of the completion-rate indicator" },
      { name: "Global Partnership for Education", url: "https://www.globalpartnership.org/", what: "funds education systems in lower-income countries" },
      { name: "UNICEF: Education", url: "https://www.unicef.org/education", what: "keeps children in school, including in emergencies" },
    ],
  };

})());
