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
 *   // Optional, set before .call:
 *   map.annotations(SDG.notableCountries(countries))  // numbered markers
 *      .isThin(m49 => true);                         // hatch slopes fit to the minimum survey count
 *   map.syncOverlays();       // after the I6 legend dims a group
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
  let annotations = [];   // from SDG.notableCountries; drawn as numbered markers
  let isThin = () => false;
  const NO_DATA = "#d9d9d9";

  // ---- Internal state ----
  let countries;          // country <path> selection
  let hatches;            // thin-evidence overlay paths, one per hatched country
  let markers;            // numbered annotation markers
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

      // Diagonal hatch for slopes that rest on the minimum number of surveys.
      // Its spacing is counter-scaled in the zoom handler so it stays fine.
      const hatchId = `hatch-${Math.random().toString(36).slice(2, 8)}`;
      const hatchPattern = svg.append("defs").append("pattern")
        .attr("id", hatchId)
        .attr("patternUnits", "userSpaceOnUse")
        .attr("width", 4).attr("height", 4)
        .attr("patternTransform", "rotate(45)");
      hatchPattern.append("line")
        .attr("class", "hatch-line")
        .attr("x1", 0).attr("y1", 0).attr("x2", 0).attr("y2", 4);

      const g = svg.append("g").attr("class", "map-layer");
      // Countries get their own layer, so raising a hovered or selected
      // country never lifts it above the hatch or the markers.
      const countryLayer = g.append("g").attr("class", "country-layer");

      countries = countryLayer.selectAll("path.country")
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
        .on("click", (event, d) => clickSelect(event, d.id));

      hatches = g.append("g").attr("class", "hatch-layer")
        .selectAll("path.hatch")
        .data(geo.features.filter(f => f.id && isThin(f.id)))
        .join("path")
        .attr("class", "hatch")
        .attr("d", path)
        .attr("fill", `url(#${hatchId})`);

      // Numbered markers, anchored at the centroid of each annotated country's
      // largest polygon (the plain centroid of a multipolygon can fall in the
      // sea). A country large enough to show around the badge keeps it on top;
      // any other badge sits beside the country on a leader line, so the badge
      // never hides the fill of the country it labels.
      const featureOf = new Map();
      for (const f of geo.features) {
        if (!f.id) continue;
        const prev = featureOf.get(f.id);
        if (!prev || d3.geoArea(f) > d3.geoArea(prev)) featureOf.set(f.id, f);
      }
      const mainPolygon = f => {
        if (f.geometry.type !== "MultiPolygon") return f;
        const polys = f.geometry.coordinates.map(c => ({ type: "Polygon", coordinates: c }));
        return d3.greatest(polys, d3.geoArea);
      };
      const placed = placeMarkers(
        annotations.filter(a => featureOf.has(a.m49))
          .map(a => {
            const f = featureOf.get(a.m49), main = mainPolygon(f);
            return { ...a, feature: f, xy: path.centroid(main), bounds: path.bounds(main) };
          }),
        geo.features, projection, path);

      markers = g.append("g").attr("class", "marker-layer")
        .selectAll("g.annotation-marker")
        .data(placed, a => a.m49)
        .join("g")
        .attr("class", "annotation-marker")
        .attr("role", "button")
        .attr("aria-label", a => `Notable country ${a.rank}: ${a.name}`)
        .on("mouseover", (event, a) => {
          countries.filter(d => d.id === a.m49).classed("hovered", true);
          if (dispatcher) dispatcher.call("hover", null, event, a.feature, "map");
        })
        .on("mousemove", (event, a) => {
          if (dispatcher) dispatcher.call("hover", null, event, a.feature, "map");
        })
        .on("mouseout", (event, a) => {
          countries.filter(d => d.id === a.m49).classed("hovered", false);
          if (dispatcher) dispatcher.call("hover", null, event, null, "map");
        })
        .on("click", (event, a) => clickSelect(event, a.m49));
      // Local coordinates are screen-sized (the group is counter-scaled), with
      // the country's anchor at the origin and the badge at a.offset.
      const leadered = markers.filter(a => a.offset[0] || a.offset[1]);
      leadered.append("line").attr("class", "marker-leader")
        .attr("x1", 0).attr("y1", 0)
        .attr("x2", a => a.offset[0] * (1 - MARKER_R / Math.hypot(...a.offset)))
        .attr("y2", a => a.offset[1] * (1 - MARKER_R / Math.hypot(...a.offset)));
      leadered.append("circle").attr("class", "marker-anchor").attr("r", 1.8);
      markers.append("circle").attr("class", "annotation-badge").attr("r", MARKER_R)
        .attr("cx", a => a.offset[0]).attr("cy", a => a.offset[1]);
      markers.append("text").attr("class", "annotation-number")
        .attr("text-anchor", "middle").attr("dy", "0.35em")
        .attr("x", a => a.offset[0]).attr("y", a => a.offset[1])
        .text(a => a.rank);

      // Keep markers and hatch spacing a constant screen size at any zoom.
      const counterScale = k => {
        markers.attr("transform", a => `translate(${a.xy[0]},${a.xy[1]}) scale(${1 / k})`);
        hatchPattern.attr("patternTransform", `rotate(45) scale(${1 / k})`);
      };
      counterScale(1);

      // I8: zoom and pan. (Borders keep their width while zoomed via
      // vector-effect: non-scaling-stroke in style.css.)
      const [minK, maxK] = [1, 12];
      const zoom = d3.zoom()
        .scaleExtent([minK, maxK])
        .translateExtent([[0, 0], [width, height]])
        .on("zoom", (event) => {
          g.attr("transform", event.transform);
          counterScale(event.transform.k);
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

  // Choose an offset for each marker badge, in rank order. A country whose
  // main polygon is at least KEEP_INSIDE units on both sides keeps the badge
  // on its centroid. Otherwise 24 candidates are scored (8 directions; in each,
  // 3 distances starting just past where that ray leaves the country's
  // bounding box), and the lowest score wins:
  //   outside the map +1000, covering its own country +500, badge near an
  //   earlier badge or leader +300, leader passing an earlier badge +300,
  //   covering another annotated country +200, leader crossing an earlier
  //   leader +100, each sample point on land +1, and leader length / 5. The
  //   last two trade off so a badge prefers open sea only when that does not
  //   need a much longer leader (sitting on a non-annotated neighbor is fine).
  // Offsets are in map units at zoom 1; the zoom handler keeps them that size
  // on screen.
  const MARKER_R = 8;
  const KEEP_INSIDE = 40;
  function placeMarkers(list, features, projection, path) {
    const boxes = features.map(f => ({ f, b: path.bounds(f) }));
    const hits = ([x, y]) => {
      const lonlat = projection.invert([x, y]);
      if (!lonlat) return [];
      return boxes
        .filter(({ b }) => x >= b[0][0] && x <= b[1][0] && y >= b[0][1] && y <= b[1][1])
        .filter(({ f }) => d3.geoContains(f, lonlat))
        .map(({ f }) => f.id);
    };
    const annotated = new Set(list.map(a => a.m49));
    const badges = [];   // absolute badge centers placed so far
    const leaders = [];  // [[x0, y0], [x1, y1]] leaders placed so far

    // Distance from point p to segment [a, b], and whether two segments cross.
    const segDist = (p, [a, b]) => {
      const vx = b[0] - a[0], vy = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / (vx * vx + vy * vy || 1)));
      return Math.hypot(p[0] - a[0] - t * vx, p[1] - a[1] - t * vy);
    };
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const crosses = ([p1, p2], [q1, q2]) =>
      cross(p1, p2, q1) * cross(p1, p2, q2) < 0 && cross(q1, q2, p1) * cross(q1, q2, p2) < 0;

    return list.slice().sort((a, b) => a.rank - b.rank).map(a => {
      const [[x0, y0], [x1, y1]] = a.bounds;
      if (x1 - x0 >= KEEP_INSIDE && y1 - y0 >= KEEP_INSIDE) {
        badges.push(a.xy);
        return { ...a, offset: [0, 0] };
      }
      const [ax, ay] = a.xy;
      let best = null;
      for (let k = 0; k < 8; k++) {
        const ang = (k * Math.PI) / 4;
        const ux = Math.cos(ang), uy = -Math.sin(ang);
        // How far this ray travels before leaving the bounding box.
        const tx = ux > 1e-9 ? (x1 - ax) / ux : ux < -1e-9 ? (x0 - ax) / ux : Infinity;
        const ty = uy > 1e-9 ? (y1 - ay) / uy : uy < -1e-9 ? (y0 - ay) / uy : Infinity;
        const reach = Math.min(tx, ty) + MARKER_R + 6;
        for (const dist of [reach, reach + 12, reach + 24]) {
          const dx = dist * ux, dy = dist * uy;
          const cx = ax + dx, cy = ay + dy;
          const leader = [[ax, ay], [cx, cy]];
          let score = dist / 5;
          if (cx < MARKER_R || cy < MARKER_R || cx > width - MARKER_R || cy > height - MARKER_R) score += 1000;
          for (const [bx, by] of badges) {
            if (Math.hypot(cx - bx, cy - by) < 2 * MARKER_R + 6) score += 300;
            else if (segDist([bx, by], leader) < MARKER_R + 3) score += 300;
          }
          for (const l of leaders) {
            if (segDist([cx, cy], l) < MARKER_R + 3) score += 300;
            if (crosses(leader, l)) score += 100;
          }
          const samples = [[cx, cy], [cx + MARKER_R, cy], [cx - MARKER_R, cy], [cx, cy + MARKER_R], [cx, cy - MARKER_R]];
          for (const pt of samples) {
            const ids = hits(pt);
            if (ids.includes(a.m49)) score += 500;
            else if (ids.some(id => annotated.has(id))) score += 200;
            if (ids.length) score += 1;
          }
          if (!best || score < best.score) best = { score, offset: [dx, dy], at: [cx, cy] };
        }
      }
      badges.push(best.at);
      leaders.push([a.xy, best.at]);
      return { ...a, offset: best.offset };
    });
  }

  // Shift/Cmd/Ctrl-click toggles a country in the selection; a plain click
  // replaces it. Shared by country shapes and annotation markers.
  function clickSelect(event, id) {
    event.stopPropagation();
    if (!id || groupOf(id) == null) return;  // nothing to show for no-data areas
    const next = event.shiftKey || event.metaKey || event.ctrlKey
      ? new Set(selected) : new Set();
    if (selected.has(id) && next.size) next.delete(id); else next.add(id);
    setSelection([...next]);
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
    const faded = id => set.size > 0 && !set.has(id);
    hatches.classed("faded", d => faded(d.id));
    markers.classed("faded", a => faded(a.m49));
    return chart;
  };

  // Copy the I6 legend dimming from each country onto its hatch and marker.
  chart.syncOverlays = function () {
    if (!countries) return chart;
    const hidden = new Set();
    countries.filter(".group-hidden").each(d => hidden.add(d.id));
    hatches.classed("group-hidden", d => hidden.has(d.id));
    markers.classed("group-hidden", a => hidden.has(a.m49));
    return chart;
  };

  chart.selection = () => [...selected];

  // ---- Getters/setters ----
  chart.width = function (_) { return arguments.length ? (width = _, chart) : width; };
  chart.height = function (_) { return arguments.length ? (height = _, chart) : height; };
  chart.groupOf = function (_) { return arguments.length ? (groupOf = _, chart) : groupOf; };
  chart.color = function (_) { return arguments.length ? (color = _, chart) : color; };
  chart.dispatcher = function (_) { return arguments.length ? (dispatcher = _, chart) : dispatcher; };
  chart.annotations = function (_) { return arguments.length ? (annotations = _, chart) : annotations; };
  chart.isThin = function (_) { return arguments.length ? (isThin = _, chart) : isThin; };

  return chart;
}
