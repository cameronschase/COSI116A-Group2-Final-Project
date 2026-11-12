"""Export build.py's outputs into one small JSON file for the D3 visualization.

Usage:
    python export_json.py <dir with country_summary.csv and country_year.csv> <output .json path>

Slopes are copied from country_summary.csv unchanged (np.polyfit degree 1, at least
3 survey points, see trend() in build.py). Group membership is NOT computed here,
because the thresholds are interactive; the browser applies the same rule as the
Tableau "Group" calculated field.
"""
import json
import sys

import numpy as np
import pandas as pd

SRC, OUT = sys.argv[1], sys.argv[2]
summ = pd.read_csv(f"{SRC}/country_summary.csv")
year = pd.read_csv(f"{SRC}/country_year.csv")

POV, CMP = "ExtremePoverty_Total", "Completion_UpperSec_Total"

def num(v, nd=None):
    """NaN -> None (JSON null); optional rounding to keep the file small."""
    if pd.isna(v):
        return None
    v = float(v)
    if nd is not None:
        v = round(v, nd)
    return int(v) if v.is_integer() and nd is None else v


def series(rows, col):
    x = rows[["Year", col]].dropna().sort_values("Year")
    return [{"year": int(y), "value": round(float(v), 3)} for y, v in zip(x.Year, x[col])]


countries = []
for _, r in summ.iterrows():
    rows = year[year.GeoAreaCode == r.GeoAreaCode]
    pov_slope = num(r.get(f"{POV}_SlopePerYear"), 4)
    countries.append({
        # UN M49 code, zero-padded to 3 characters ("004") to match ISO 3166-1 numeric
        # ids used in Natural Earth / world-atlas boundary files.
        "m49": f"{int(r.GeoAreaCode):03d}",
        "name": r.GeoAreaName,
        # Same sign convention as the Tableau field "Poverty reduction (pp/yr)":
        # positive = poverty fell.
        "povertyReduction": None if pov_slope is None else -pov_slope,
        "completionGain": num(r.get(f"{CMP}_SlopePerYear"), 4),
        "povertyYears": [num(r.get(f"{POV}_FirstYear")), num(r.get(f"{POV}_LatestYear"))],
        "completionYears": [num(r.get(f"{CMP}_FirstYear")), num(r.get(f"{CMP}_LatestYear"))],
        "povertyN": num(r.get(f"{POV}_NPoints")),
        "completionN": num(r.get(f"{CMP}_NPoints")),
        "poverty": series(rows, POV),
        "completion": series(rows, CMP),
    })

with open(OUT, "w", encoding="utf-8") as f:
    json.dump({"countries": countries}, f, ensure_ascii=False, separators=(",", ":"))

both = sum(c["povertyReduction"] is not None and c["completionGain"] is not None for c in countries)
print(f"wrote {OUT}: {len(countries)} countries, {both} with both slopes")