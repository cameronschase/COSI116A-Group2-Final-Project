"""Build data/regions.csv: the UN M49 region and sub-region of every country (I9).

Usage:
    python build_regions.py <all.csv> data/regions.csv

<all.csv> is all/all.csv from https://github.com/lukes/ISO-3166-Countries-with-Regional-Codes
(ISO 3166-1 codes joined to the UN M49 regional groupings). We keep three columns:

    m49        3-digit UN M49 / ISO 3166-1 numeric code, zero-padded ("004"), the
               same key used by data/sdg.json and data/world.geojson
    region     M49 region (Africa, Americas, Asia, Europe, Oceania)
    subregion  M49 intermediate region when there is one (e.g. "South America",
               "Eastern Africa"), otherwise the M49 sub-region (e.g. "Southern Asia").
               This splits the two very large sub-regions, Sub-Saharan Africa and
               Latin America and the Caribbean, into groups of a useful size.

Kosovo (412) is in the SDG data but not in ISO 3166-1, so it is added by hand
under Europe / Southern Europe.
"""
import csv
import sys

SRC, OUT = sys.argv[1], sys.argv[2]
MANUAL = [{"m49": "412", "region": "Europe", "subregion": "Southern Europe"}]

rows = []
with open(SRC, encoding="utf-8") as f:
    for r in csv.DictReader(f):
        if not r["region"]:          # Antarctica and a few territories have none
            continue
        rows.append({
            "m49": r["country-code"].zfill(3),
            "region": r["region"],
            "subregion": r["intermediate-region"] or r["sub-region"],
        })
have = {r["m49"] for r in rows}
rows += [m for m in MANUAL if m["m49"] not in have]
rows.sort(key=lambda r: r["m49"])

with open(OUT, "w", encoding="utf-8", newline="") as f:
    w = csv.DictWriter(f, fieldnames=["m49", "region", "subregion"])
    w.writeheader()
    w.writerows(rows)
print(f"wrote {OUT}: {len(rows)} countries and territories")
