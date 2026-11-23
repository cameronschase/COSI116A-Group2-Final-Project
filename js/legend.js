/* V4: legend (I6 filtering, I4 live counts).
 *
 * Reusable chart (https://bost.ocks.org/mike/chart/). One entry per group in
 * SDG.GROUPS order, then "No trend available", then two annotation keys.
 * Group entries start on; clicking one (or Enter/Space) dims that group in
 * every view. The annotation keys start off; turning one on shows only the
 * matching countries. The legend only tracks state: what to dim is decided by
 * whoever listens on the dispatcher.
 *
 * Usage:
 *   const legend = sdgLegend().dispatcher(dispatch);
 *   d3.select("#vis-legend").call(legend);
 *   legend.counts(new Map([["Both improved", 40], [null, 80]]));  // I4, null = no trend
 *   legend.reset();                                                // I5
 *
 * Events sent on the dispatcher:
 *   "legend" ({hidden, focused})  hidden: Set of group names (null = no trend)
 *                                 that are switched off; focused: Set of
 *                                 sdgLegend.THIN / sdgLegend.NOTABLE switched on.
 */
function sdgLegend() {
  let dispatcher = null;

  const hidden = new Set();
  const focused = new Set();
  let groupItems, noteItems;

  function chart(selection) {
    selection.each(function () {
      const root = d3.select(this);

      groupItems = root.selectAll("div.legend-item.legend-group")
        .data(SDG.GROUPS.concat([null]))   // null is the no-trend swatch
        .join("div")
        .attr("class", "legend-item legend-group")
        .attr("title", "Click to dim this group in every view; click again to show it");
      groupItems.append("span")
        .attr("class", "legend-swatch")
        .style("background", d => SDG.color(d));
      groupItems.append("span")
        .attr("class", "legend-label")
        .text(d => (d == null ? "No trend available" : d));
      groupItems.append("span").attr("class", "legend-count");
      wire(groupItems, hidden, true);

      // Keys for the two annotation encodings, on their own row.
      const notes = root.append("div").attr("class", "legend-notes");
      const thin = notes.append("div").datum(sdgLegend.THIN).attr("class", "legend-item");
      thin.append("svg").attr("class", "legend-glyph").attr("width", 30).attr("height", 14)
        .attr("aria-hidden", "true")
        .html(`<defs><pattern id="legend-hatch" patternUnits="userSpaceOnUse" width="4" height="4"`
          + ` patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="4" class="legend-hatch-line"/></pattern></defs>`
          + `<circle cx="7" cy="7" r="5" class="legend-thin-point"/>`
          + `<rect x="16" y="1" width="13" height="12" rx="2" class="legend-thin-area"/>`
          + `<rect x="16" y="1" width="13" height="12" rx="2" fill="url(#legend-hatch)"/>`);
      thin.append("span").attr("class", "legend-label")
        .text(`Trend from only ${SDG.THIN_EVIDENCE_N} surveys`);

      const notable = notes.append("div").datum(sdgLegend.NOTABLE).attr("class", "legend-item");
      notable.append("svg").attr("class", "legend-glyph").attr("width", 16).attr("height", 16)
        .attr("aria-hidden", "true")
        .html(`<circle cx="8" cy="8" r="7.5" class="annotation-badge"/>`
          + `<text x="8" y="8" dy="0.35em" text-anchor="middle" class="annotation-number">1</text>`);
      notable.append("span").attr("class", "legend-label").text("Notable country/outlier (numbered)");

      noteItems = notes.selectAll(".legend-item")
        .attr("title", "Click to show only these countries; click again to show all");
      wire(noteItems, focused, false);
    });
  }

  // startsOn: the entry is "on" (pressed) while its key is NOT in the set.
  function wire(sel, set, startsOn) {
    sel.attr("role", "button")
      .attr("tabindex", 0)
      .attr("aria-pressed", String(startsOn))
      .on("click", (event, key) => toggle(key, set))
      .on("keydown", (event, key) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toggle(key, set);
        }
      });
  }

  function toggle(key, set) {
    if (set.has(key)) set.delete(key); else set.add(key);
    render();
    emit();
  }

  function render() {
    groupItems
      .classed("legend-off", d => hidden.has(d))
      .attr("aria-pressed", d => String(!hidden.has(d)));
    noteItems
      .classed("legend-focus", d => focused.has(d))
      .attr("aria-pressed", d => String(focused.has(d)));
  }

  function emit() {
    if (dispatcher) dispatcher.call("legend", null, { hidden: new Set(hidden), focused: new Set(focused) });
  }

  // I4: number of countries per group (Map keyed by group name, null = no trend).
  chart.counts = function (counts) {
    if (groupItems) groupItems.select(".legend-count").text(d => ` (${counts.get(d) || 0})`);
    return chart;
  };

  // I5: every group shown, no annotation filter.
  chart.reset = function () {
    hidden.clear();
    focused.clear();
    if (groupItems) render();
    emit();
    return chart;
  };

  chart.dispatcher = function (_) { return arguments.length ? (dispatcher = _, chart) : dispatcher; };

  return chart;
}

// Keys for the two annotation entries. Distinct from every group name.
sdgLegend.THIN = "legend:thin-evidence";
sdgLegend.NOTABLE = "legend:notable";
