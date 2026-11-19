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
 * Zoom/pan (I8) is built in so small island states can be reached and clicked:
 * scroll or drag on the map, or use the plus/minus buttons in its top-right corner.
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
      const holder = d3.select(this).classed("world-map-holder", true);
      const svg = holder.append("svg")
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
      const [minK, maxK] = [1, 12];
      const zoom = d3.zoom()
        .scaleExtent([minK, maxK])
        .translateExtent([[0, 0], [width, height]])
        .on("zoom", (event) => {
          g.attr("transform", event.transform);
          updateZoomButtons(event.transform.k);
        });
      svg.call(zoom).on("dblclick.zoom", null);

      chart.resetZoom = () => svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity);

      // Plus/minus buttons in the top-right corner. HTML rather than SVG so they
      // are keyboard-focusable and their clicks never reach the map's handlers.
      const controls = holder.append("div")
        .attr("class", "map-zoom-controls")
        .attr("role", "group")
        .attr("aria-label", "Map zoom");
      const zoomIn = controls.append("button")
        .attr("type", "button")
        .attr("class", "map-zoom-btn")
        .attr("aria-label", "Zoom in")
        .attr("title", "Zoom in")
        .text("+")
        .on("click", () => svg.transition().duration(250).call(zoom.scaleBy, 1.5));
      const zoomOut = controls.append("button")
        .attr("type", "button")
        .attr("class", "map-zoom-btn")
        .attr("aria-label", "Zoom out")
        .attr("title", "Zoom out")
        .text("\u2212")   // minus sign, same width as "+"
        .on("click", () => svg.transition().duration(250).call(zoom.scaleBy, 1 / 1.5));

      // Grey out a button once the zoom limit in its direction is reached.
      function updateZoomButtons(k) {
        zoomIn.property("disabled", k >= maxK - 1e-6);
        zoomOut.property("disabled", k <= minK + 1e-6);
      }
      updateZoomButtons(1);

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
