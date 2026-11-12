"""Reshape SDG Goal 1 + Goal 4 exports into Tableau-ready tables."""
import sys
import numpy as np
import pandas as pd

DATA, OUT = sys.argv[1], sys.argv[2]
g1 = pd.read_csv(f"{DATA}/Goal1-data.csv", low_memory=False)
g4 = pd.read_csv(f"{DATA}/Goal4-data.csv", low_memory=False)
codes = pd.read_csv(f"{DATA}/CodeDescriptions.csv")

# Source file labels <7Y as "under 6 years old" (copy of <6Y); correct it.
codes.loc[(codes.Dimension == "Age") & (codes.Code == "<7Y"), "Description"] = "under 7 years old"

DIMS = ["Age", "Location", "Nature", "Sex", "Units", "Education level",
        "Type of skill", "Reporting Type", "Quantile", "Observation Status"]

d = pd.concat([g1, g4], ignore_index=True)

# --- Geo type: aggregates are geo areas whose only Nature code is N ----------
nat = d.groupby("GeoAreaCode")["Nature"].agg(lambda s: set(s.dropna()))
agg_codes = set(nat[nat.apply(lambda s: s == {"N"})].index)
d["GeoType"] = np.where(d.GeoAreaCode.isin(agg_codes), "Region/Group", "Country/Territory")

# --- Decode every dimension column into a "<dim> (label)" column ------------
missing = []
for dim in DIMS:
    m = dict(codes.loc[codes.Dimension == dim, ["Code", "Description"]].values)
    used = set(d[dim].dropna().unique())
    missing += [(dim, c) for c in used - set(m)]
    d[f"{dim} (label)"] = d[dim].map(m)
if missing:
    print("Codes with no description:", missing)

# 1) Long table: everything, one table, no joins needed ----------------------
d.to_csv(f"{OUT}/sdg_long.csv", index=False)

# 2) Country-year wide table for the cross-goal tasks -------------------------
c = d[d.GeoType == "Country/Territory"]

def pick(series, **filt):
    x = c[c.SeriesCode == series]
    for k, v in filt.items():
        x = x[x[k] == v]
    key = ["GeoAreaCode", "TimePeriod"]
    assert not x.duplicated(key).any(), (series, filt)
    return x.set_index(key)["Value"]

pov = dict(Age="ALLAGE", Sex="BOTHSEX")
cols = {
    "ExtremePoverty_Total": pick("SI_POV_DAY1", Location="ALLAREA", **pov),
    "ExtremePoverty_Rural": pick("SI_POV_DAY1", Location="RURAL", **pov),
    "ExtremePoverty_Urban": pick("SI_POV_DAY1", Location="URBAN", **pov),
    "NationalPoverty_Total": pick("SI_POV_NAHC", Location="ALLAREA"),
    "MultidimPoverty_Total": pick("SD_MDP_MUHC", Location="ALLAREA", **pov),
    "MultidimPoverty_Rural": pick("SD_MDP_MUHC", Location="RURAL", **pov),
    "MultidimPoverty_Urban": pick("SD_MDP_MUHC", Location="URBAN", **pov),
}
for lvl, lab in [("PRIMAR", "Primary"), ("LOWSEC", "LowerSec"), ("UPPSEC", "UpperSec")]:
    for sex, sl in [("BOTHSEX", "Total"), ("FEMALE", "Female"), ("MALE", "Male")]:
        cols[f"Completion_{lab}_{sl}"] = pick("SE_TOT_CPLR", **{"Education level": lvl},
                                             Location="ALLAREA", Quantile="_T", Sex=sex)
for lvl, lab in [("PRIMAR", "Primary"), ("LOWSEC", "LowerSec")]:
    for sk, skl in [("SKILL_READ", "Reading"), ("SKILL_MATH", "Math")]:
        cols[f"MinProficiency_{lab}_{skl}"] = pick("SE_TOT_PRFL", **{"Education level": lvl},
                                                  **{"Type of skill": sk}, Sex="BOTHSEX")
wide = pd.DataFrame(cols).reset_index()
names = c[["GeoAreaCode", "GeoAreaName"]].drop_duplicates("GeoAreaCode")
wide = names.merge(wide, on="GeoAreaCode").rename(columns={"TimePeriod": "Year"})
for lab in ["Primary", "LowerSec", "UpperSec"]:
    wide[f"CompletionGap_{lab}_FminusM"] = wide[f"Completion_{lab}_Female"] - wide[f"Completion_{lab}_Male"]
wide["ExtremePoverty_RuralMinusUrban"] = wide.ExtremePoverty_Rural - wide.ExtremePoverty_Urban
wide["MultidimPoverty_RuralMinusUrban"] = wide.MultidimPoverty_Rural - wide.MultidimPoverty_Urban
wide.sort_values(["GeoAreaName", "Year"]).to_csv(f"{OUT}/country_year.csv", index=False)

# 3) Country summary: trends, projections, latest values ---------------------
def trend(g, col, min_pts=3):
    x = g[["Year", col]].dropna()
    out = {}
    if len(x):
        f, l = x.iloc[0], x.iloc[-1]
        out.update({f"{col}_FirstYear": f.Year, f"{col}_First": f[col],
                    f"{col}_LatestYear": l.Year, f"{col}_Latest": l[col],
                    f"{col}_NPoints": len(x)})
    if len(x) >= min_pts and x.Year.nunique() >= 2:
        slope, icpt = np.polyfit(x.Year, x[col], 1)
        out[f"{col}_SlopePerYear"] = slope
        out[f"{col}_Projected2030"] = slope * 2030 + icpt
    return out

TREND_COLS = ["ExtremePoverty_Total", "MultidimPoverty_Total",
              "Completion_LowerSec_Total", "Completion_UpperSec_Total",
              "MinProficiency_LowerSec_Reading", "MinProficiency_LowerSec_Math"]
LATEST_COLS = ["CompletionGap_LowerSec_FminusM", "CompletionGap_UpperSec_FminusM",
               "ExtremePoverty_RuralMinusUrban", "MultidimPoverty_RuralMinusUrban"]
rows = []
for (code, name), g in wide.sort_values("Year").groupby(["GeoAreaCode", "GeoAreaName"]):
    r = {"GeoAreaCode": code, "GeoAreaName": name}
    for col in TREND_COLS:
        r.update(trend(g, col))
    for col in LATEST_COLS:
        x = g[["Year", col]].dropna()
        if len(x):
            r[f"{col}_LatestYear"], r[f"{col}_Latest"] = x.iloc[-1].Year, x.iloc[-1][col]
    rows.append(r)
summ = pd.DataFrame(rows)
for col in ["Completion_UpperSec_Total_Projected2030", "Completion_LowerSec_Total_Projected2030",
            "MinProficiency_LowerSec_Reading_Projected2030", "MinProficiency_LowerSec_Math_Projected2030"]:
    summ[col] = summ[col].clip(0, 100)
summ.to_csv(f"{OUT}/country_summary.csv", index=False)

print("long", d.shape, "| country_year", wide.shape, "| summary", summ.shape)
print("aggregates:", len(agg_codes), "| countries:", c.GeoAreaCode.nunique())
print(wide.notna().sum().to_string())