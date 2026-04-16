import json, os, math
import pandas as pd
import numpy as np

CLEANED_FILE = r"C:\Users\syzha\ais_output\cleaned_data\ais_cleaned_with_vesseltype.parquet"
OUT_FILE     = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vessel_trajectories_global.json")

MAX_POINTS_PER_SEGMENT = 20
MIN_POINTS             = 3

VESSEL_TYPE_COLORS = {
    "Cargo": "#2196F3", "Cargo - Hazard A": "#1565C0", "Cargo - Hazard B": "#1976D2",
    "Cargo - Hazard C": "#1E88E5", "Cargo - Hazard D": "#42A5F5",
    "Tanker": "#FF5722", "Tanker - Hazard A": "#E64A19", "Tanker - Hazard B": "#FF7043",
    "Tanker - Hazard C": "#FF8A65", "Tanker - Hazard D": "#FFAB91",
    "Fishing": "#4CAF50", "Tug": "#FF9800", "Passenger": "#9C27B0",
    "Passenger - Hazard B": "#AB47BC", "Sailing": "#00BCD4",
    "Pleasure craft": "#8BC34A", "Search and rescue": "#F44336",
    "Dredging or underwater ops": "#795548", "Towing": "#FF6F00",
    "Towing astern": "#FFA000", "Military ops": "#607D8B",
    "Law enforcement": "#455A64", "Pilot vessel": "#26C6DA",
    "High-speed craft": "#00E5FF", "Anti-pollution": "#69F0AE",
    "Diving ops": "#40C4FF", "Port tender": "#B0BEC5",
    "Spare local vessel": "#78909C", "Noncombatant ship": "#546E7A",
    "Medical transport": "#EF9A9A", "Wing in ground": "#CE93D8",
    "Other": "#9E9E9E", "Unknown": "#607D8B",
}


def classify_pattern(mean_sog, total_km):
    if mean_sog < 0.3:
        return "anchored"
    if total_km < 20 or mean_sog < 4:
        return "coastal"
    return "inbound"


def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371
    r = math.pi / 180
    dlat = (lat2 - lat1) * r
    dlon = (lon2 - lon1) * r
    a = math.sin(dlat/2)**2 + math.cos(lat1*r)*math.cos(lat2*r)*math.sin(dlon/2)**2
    return 2 * R * math.asin(math.sqrt(max(0, a)))


print(f"Reading {CLEANED_FILE} ...")

try:
    df = pd.read_parquet(CLEANED_FILE, engine="pyarrow")
    print(f"Columns available: {list(df.columns)}")
except Exception as e:
    print(f"Error reading parquet: {e}")
    raise

required = {"MMSI", "LAT", "LON", "SOG", "BaseDateTime"}
missing = required - set(df.columns)
if missing:
    raise ValueError(f"Missing columns: {missing}")

has_segment_id = "TrackSegmentID" in df.columns
print(f"TrackSegmentID available: {has_segment_id}")
print(f"Loaded {len(df):,} rows, {df['MMSI'].nunique():,} unique vessels")

df["BaseDateTime"] = pd.to_datetime(df["BaseDateTime"], utc=True, errors="coerce")
df = df.sort_values(["MMSI", "BaseDateTime"]).reset_index(drop=True)
df = df.dropna(subset=["LAT", "LON"])

vtype_col = None
for c in ["VesselTypeLabel", "vessel_type", "VesselType"]:
    if c in df.columns:
        vtype_col = c
        break

trajectories = []

if has_segment_id:
    group_keys = ["MMSI", "TrackSegmentID"]
    groups = df.groupby(group_keys, sort=False)
    total_groups = len(groups)
    print(f"Total (MMSI, TrackSegmentID) groups: {total_groups:,}")

    for i, ((mmsi, seg_id), grp) in enumerate(groups):
        if i % 2000 == 0:
            print(f"  Segment {i+1}/{total_groups} ...")

        if len(grp) < MIN_POINTS:
            continue

        if len(grp) > MAX_POINTS_PER_SEGMENT:
            idx = np.round(np.linspace(0, len(grp) - 1, MAX_POINTS_PER_SEGMENT)).astype(int)
            grp = grp.iloc[idx]

        vtype = "Unknown"
        if vtype_col:
            mode_vals = grp[vtype_col].dropna()
            if len(mode_vals):
                vtype = str(mode_vals.mode().iloc[0])

        color = VESSEL_TYPE_COLORS.get(vtype, "#9E9E9E")

        mean_sog = float(grp["SOG"].mean()) if grp["SOG"].notna().any() else 0.0
        first, last = grp.iloc[0], grp.iloc[-1]
        total_km = haversine_km(float(first["LAT"]), float(first["LON"]),
                                float(last["LAT"]),  float(last["LON"]))
        pattern = classify_pattern(mean_sog, total_km)

        pts = [
            {"lat": round(float(r["LAT"]), 5),
             "lon": round(float(r["LON"]), 5),
             "sog": round(float(r["SOG"]) if pd.notna(r["SOG"]) else 0.0, 1)}
            for _, r in grp.iterrows()
        ]

        if len(pts) >= 2:
            trajectories.append({
                "mmsi":        str(mmsi),
                "vessel_type": vtype,
                "color":       color,
                "pattern":     pattern,
                "hour":        int(grp["BaseDateTime"].dt.hour.mode().iloc[0]),
                "points":      pts,
            })

else:
    print("TrackSegmentID not found — reconstructing segments from time/speed gaps ...")
    groups = df.groupby("MMSI", sort=False)
    total_vessels = len(groups)

    for i, (mmsi, grp) in enumerate(groups):
        if i % 500 == 0:
            print(f"  Vessel {i+1}/{total_vessels} ...")

        grp = grp.sort_values("BaseDateTime").reset_index(drop=True)
        if len(grp) < MIN_POINTS:
            continue

        dt_h = grp["BaseDateTime"].diff().dt.total_seconds().fillna(0) / 3600
        lats, lons = grp["LAT"].values, grp["LON"].values
        dkm = np.array([0.0] + [
            haversine_km(lats[j-1], lons[j-1], lats[j], lons[j])
            for j in range(1, len(grp))
        ])
        implied_spd = np.where(dt_h > 0, dkm / dt_h, 0)

        breaks = np.where((dt_h > 6) | (implied_spd > 100))[0]
        seg_starts = [0] + list(breaks)
        seg_ends   = list(breaks) + [len(grp)]

        for s, e in zip(seg_starts, seg_ends):
            seg = grp.iloc[s:e]
            if len(seg) < MIN_POINTS:
                continue
            if len(seg) > MAX_POINTS_PER_SEGMENT:
                idx = np.round(np.linspace(0, len(seg) - 1, MAX_POINTS_PER_SEGMENT)).astype(int)
                seg = seg.iloc[idx]

            vtype = "Unknown"
            if vtype_col:
                mode_vals = seg[vtype_col].dropna()
                if len(mode_vals):
                    vtype = str(mode_vals.mode().iloc[0])

            color    = VESSEL_TYPE_COLORS.get(vtype, "#9E9E9E")
            mean_sog = float(seg["SOG"].mean()) if seg["SOG"].notna().any() else 0.0
            first, last = seg.iloc[0], seg.iloc[-1]
            total_km = haversine_km(float(first["LAT"]), float(first["LON"]),
                                    float(last["LAT"]),  float(last["LON"]))
            pattern  = classify_pattern(mean_sog, total_km)

            pts = [
                {"lat": round(float(r["LAT"]), 5),
                 "lon": round(float(r["LON"]), 5),
                 "sog": round(float(r["SOG"]) if pd.notna(r["SOG"]) else 0.0, 1)}
                for _, r in seg.iterrows()
            ]

            if len(pts) >= 2:
                trajectories.append({
                    "mmsi":        str(mmsi),
                    "vessel_type": vtype,
                    "color":       color,
                    "pattern":     pattern,
                    "hour":        int(seg["BaseDateTime"].dt.hour.mode().iloc[0]),
                    "points":      pts,
                })

print(f"\nTotal trajectories: {len(trajectories):,}")

with open(OUT_FILE, "w") as f:
    json.dump(trajectories, f, separators=(",", ":"))

size_mb = os.path.getsize(OUT_FILE) / 1e6
print(f"Written to {OUT_FILE}  ({size_mb:.1f} MB)")
print("Done.")
