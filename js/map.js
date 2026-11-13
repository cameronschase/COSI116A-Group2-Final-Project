/* V2: choropleth world map (owner: Zahira).
 *
 * Reusable chart (https://bost.ocks.org/mike/chart/). Each country is filled with
 * the same group color as its point in the scatterplot (V1). Countries with no
 * group (missing a trend, or not in the SDG data) are drawn in a neutral gray.
 *
 * Usage:
 *   const map = worldMap()
 *     .groupOf(m49 => "Both improved")      // returns a group name or null
 *     .color(groupName => "#4e79a7")        // shared palette from the constants module (P3)
 *     .dispatcher(dispatch);                // d3.dispatch with "select" and "hover"
 *   d3.select("#vis-map").datum(worldGeoJSON).call(map);
 *
 *   map.recolor();            // after a threshold slider moves (I4)
 *   map.highlight(["004"]);   // after a brush in another view (I1); [] clears it
 *
 * Events sent on the dispatcher:
 *   "select" (ids, source)  where ids is an array of M49 codes, source = "map" (I2)
 *   "hover"  (event, feature, source) feature is null when the pointer leaves (I3, I7)
 *
 * Zoom/pan (I8) is built in so small island states can be reached and clicked.
 */
function worldMap() {
  // ---- Settings (each has a getter/setter below) ----
  let width = 960;
  let height = 500;
  let groupOf = () => null;
  let color = () => NO_DATA;
  let dispatcher = null;
  const NO_DATA = "#d9d9d9";

  // ---- Internal state ----
  let countries;          // country <path> selection
  let selected = new Set();  // ids selected by clicking on the map

  function chart(selection) {
    selection.each(function (geo) {
      const svg = d3.select(this).append("svg")
        .attr("class", "world-map")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("preserveAspectRatio", "xMidYMid meet")
        .attr("role", "img")
        .attr("aria-label", "World map colored by poverty and completion trend group");

      const projection = d3.geoNaturalEarth1().fitSize([width, height], geo);
      const path = d3.geoPath(projection);

      // Background that clears the selection when clicked (also catches zoom gestures).
      svg.append("rect")
        .attr("class", "map-background")
        .attr("width", width)
        .attr("height", height)
        .on("click", () => setSelection([]));

      const g = svg.append("g").attr("class", "map-layer");

      countries = g.selectAll("path.country")
        .data(geo.features)
        .join("path")
        .attr("class", "country")
        .attr("d", path)
        .on("mouseover", function (event, d) {
          d3.select(this).raise().classed("hovered", true);
          if (dispatcher) dispatcher.call("hover", null, event, d, "map");
        })
        .on("mousemove", (event, d) => {
          if (dispatcher) dispatcher.call("hover", null, event, d, "map");
        })
        .on("mouseout", function (event) {
          d3.select(this).classed("hovered", false);
          if (dispatcher) dispatcher.call("hover", null, event, null, "map");
        })
        .on("click", (event, d) => {
          event.stopPropagation();
          if (!d.id || groupOf(d.id) == null) return;  // nothing to show for no-data areas
          // Shift/Cmd/Ctrl-click adds to the selection; a plain click replaces it.
          const next = event.shiftKey || event.metaKey || event.ctrlKey
            ? new Set(selected) : new Set();
          if (selected.has(d.id) && next.size) next.delete(d.id); else next.add(d.id);
          setSelection([...next]);
        });

      // I8: zoom and pan. (Borders keep their width while zoomed via
      // vector-effect: non-scaling-stroke in style.css.)
      const zoom = d3.zoom()
        .scaleExtent([1, 12])
        .translateExtent([[0, 0], [width, height]])
        .on("zoom", (event) => {
          g.attr("transform", event.transform);
        });
      svg.call(zoom).on("dblclick.zoom", null);

      chart.resetZoom = () => svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity);

      chart.recolor();
      chart.highlight([]);
    });
  }

  function setSelection(ids) {
    selected = new Set(ids);
    chart.highlight(ids);
    if (dispatcher) dispatcher.call("select", null, ids, "map");
  }

  // Re-fill every country from groupOf + color (call after thresholds change).
  chart.recolor = function () {
    if (!countries) return chart;
    countries.attr("fill", d => {
      const grp = d.id ? groupOf(d.id) : null;
      return grp == null ? NO_DATA : color(grp);
    });
    return chart;
  };

  // Emphasize the given ids and fade the rest; an empty array clears the emphasis.
  chart.highlight = function (ids) {
    if (!countries) return chart;
    const set = new Set(ids);
    selected = set;
    countries
      .classed("selected", d => set.has(d.id))
      .classed("faded", d => set.size > 0 && !set.has(d.id));
    countries.filter(".selected").raise();
    return chart;
  };

  chart.selection = () => [...selected];

  // ---- Getters/setters ----
  chart.width = function (_) { return arguments.length ? (width = _, chart) : width; };
  chart.height = function (_) { return arguments.length ? (height = _, chart) : height; };
  chart.groupOf = function (_) { return arguments.length ? (groupOf = _, chart) : groupOf; };
  chart.color = function (_) { return arguments.length ? (color = _, chart) : color; };
  chart.dispatcher = function (_) { return arguments.length ? (dispatcher = _, chart) : dispatcher; };

  return chart;
}
