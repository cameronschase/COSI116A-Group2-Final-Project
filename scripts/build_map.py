"""P4: build data/world.geojson and join its country ids to the SDG data.

Usage:
    python scripts/build_map.py <simplified countries GeoJSON> data/sdg.json data/world.geojson

Step 1 (done once, outside Python) makes the simplified boundary file from
Natural Earth 1:50m via the world-atlas package (ISC license), dropping
Antarctica and keeping 12% of the vertices so the file stays ~225 KB:

    npm i world-atlas@2 mapshaper
    npx mapshaper -i node_modules/world-atlas/countries-50m.json -target countries \
        -filter 'name !== "Antarctica"' -simplify 12% keep-shapes \
        -o countries-50m-simplified.json format=geojson precision=0.01 target=countries

Step 2 (this script) attaches the UN M49 code from sdg.json to each shape.
world-atlas ids are ISO 3166-1 numeric codes, which equal M49 for almost every
country, so most shapes join on their id as-is. The rest are fixed by hand in
MANUAL_IDS below, and the script prints whatever still does not join.
"""
import json
import sys

SRC, SDG, OUT = sys.argv[1], sys.argv[2], sys.argv[3]

# Shapes whose world-atlas id is missing or does not match the UN data.
# Key = Natural Earth shape name, value = the M49 code the UN SDG data uses.
MANUAL_IDS = {
    # No id in Natural Earth; the SDG data reports Kosovo under M49 412.
    "Kosovo": "412",
    # The UN reports these areas as part of the recognised country, so the
    # shapes take that country's color instead of showing up as "no data".
    "Somaliland": "706",  # Somalia
    "N. Cyprus": "196",   # Cyprus
}

def signed_area(ring):
    """Shoelace area in lon/lat; > 0 means counter-clockwise.
    Rings that cross the 180° line (Russia, Fiji) are unwrapped first."""
    if max(x for x, _ in ring) - min(x for x, _ in ring) > 180:
        ring = [(x + 360 if x < 0 else x, y) for x, y in ring]
    return sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(ring, ring[1:])) / 2


def fix_winding(geometry):
    """d3-geo needs clockwise outer rings and counter-clockwise holes; a ring
    the wrong way round makes d3 fill the whole globe. Simplification can flip
    or flatten rings, so enforce the order here and drop rings with no area."""
    polys = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
    out = []
    for poly in polys:
        rings = []
        for i, ring in enumerate(poly):
            a = signed_area(ring)
            if a == 0:
                continue
            want_cw = i == 0
            if (a > 0) == want_cw:  # wrong direction
                ring = ring[::-1]
            rings.append(ring)
        if rings and signed_area(poly[0]) != 0:
            out.append(rings)
    return {"type": "MultiPolygon", "coordinates": out}


geo = json.load(open(SRC, encoding="utf-8"))
countries = json.load(open(SDG, encoding="utf-8"))["countries"]
sdg_ids = {c["m49"]: c["name"] for c in countries}

features = []
for f in geo["features"]:
    name = f["properties"]["name"]
    m49 = MANUAL_IDS.get(name, f.get("id"))
    features.append({
        "type": "Feature",
        "id": m49,  # may be None (e.g. Siachen Glacier); the map draws it as "no data"
        "properties": {"name": name, "m49": m49},
        "geometry": fix_winding(f["geometry"]),
    })

with open(OUT, "w", encoding="utf-8") as fh:
    json.dump({"type": "FeatureCollection", "features": features}, fh,
              ensure_ascii=False, separators=(",", ":"))

# --- Join report ------------------------------------------------------------
map_ids = {f["id"] for f in features if f["id"]}
in_sdg_not_map = sorted(set(sdg_ids) - map_ids)
in_map_not_sdg = sorted(f'{f["id"]} {f["properties"]["name"]}'
                        for f in features if f["id"] not in sdg_ids)

print(f"wrote {OUT}: {len(features)} shapes, "
      f"{len(set(sdg_ids) & map_ids)} of {len(sdg_ids)} SDG countries joined")
print("SDG countries with no shape (too small for 1:50m):",
      [f"{i} {sdg_ids[i]}" for i in in_sdg_not_map])
print("Shapes with no SDG row (drawn as 'no data'):", in_map_not_sdg)
