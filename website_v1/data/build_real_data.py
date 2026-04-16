import json, os, math, random
import pandas as pd
import numpy as np

random.seed(42)
np.random.seed(42)

AIS_OUTPUT   = r"C:\Users\syzha\ais_output"
TABLES_DIR   = os.path.join(AIS_OUTPUT, "tables")
CLEANED_FILE = os.path.join(AIS_OUTPUT, "cleaned_data", "ais_cleaned_with_vesseltype.parquet")
LOG_DIR      = os.path.join(AIS_OUTPUT, "logs")
OUT_DIR      = os.path.dirname(os.path.abspath(__file__))

PORTS = [
    {"id": "LA",  "name": "Port of Los Angeles / Long Beach", "lat": 33.735, "lon": -118.265, "state": "CA",
     "anchor_zones": [{"lat": 33.68, "lon": -118.20, "radius_km": 3.2, "label": "San Pedro Bay Anchorage"},
                      {"lat": 33.72, "lon": -118.28, "radius_km": 2.1, "label": "Long Beach Outer Anchorage"}]},
    {"id": "NY",  "name": "Port of New York / New Jersey",    "lat": 40.665, "lon": -74.065, "state": "NY",
     "anchor_zones": [{"lat": 40.60, "lon": -74.05, "radius_km": 2.8, "label": "Lower Bay Anchorage"},
                      {"lat": 40.69, "lon": -74.10, "radius_km": 1.9, "label": "Kill Van Kull Waiting"}]},
    {"id": "SEA", "name": "Port of Seattle",                  "lat": 47.600, "lon": -122.345, "state": "WA",
     "anchor_zones": [{"lat": 47.58, "lon": -122.39, "radius_km": 2.0, "label": "Elliott Bay Anchorage"},
                      {"lat": 47.62, "lon": -122.43, "radius_km": 1.5, "label": "Puget Sound Waiting"}]},
    {"id": "HOU", "name": "Port of Houston",                  "lat": 29.735, "lon": -95.265, "state": "TX",
     "anchor_zones": [{"lat": 29.68, "lon": -94.95, "radius_km": 3.5, "label": "Galveston Outer Bar Anchorage"},
                      {"lat": 29.71, "lon": -95.10, "radius_km": 2.0, "label": "Houston Ship Channel Waiting"}]},
    {"id": "NOL", "name": "Port of New Orleans",              "lat": 29.945, "lon": -90.065, "state": "LA",
     "anchor_zones": [{"lat": 29.86, "lon": -89.95, "radius_km": 2.8, "label": "Lower Mississippi Anchorage"},
                      {"lat": 29.92, "lon": -90.12, "radius_km": 1.6, "label": "Mississippi River Waiting"}]},
]

PORT_RADIUS_DEG = 1.5
PORT_RADIUS_KM  = 120

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

def haversine(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return R * 2 * math.asin(math.sqrt(a))

def classify_pattern(sub):
    if len(sub) < 2:
        return "anchored"
    mean_sog = sub["SOG"].mean() if "SOG" in sub.columns else 0
    if mean_sog < 0.5:
        return "anchored"
    first = sub.iloc[0]
    last  = sub.iloc[-1]
    dist_first = haversine(first["LAT"], first["LON"], sub.attrs["port_lat"], sub.attrs["port_lon"])
    dist_last  = haversine(last["LAT"],  last["LON"],  sub.attrs["port_lat"], sub.attrs["port_lon"])
    if dist_last < dist_first - 5:
        return "inbound"
    elif dist_first < dist_last - 5:
        return "outbound"
    return "coastal"

print("[1/3] Building stats.json ...")

hourly = pd.read_csv(os.path.join(TABLES_DIR, "hourly_counts.csv"))
hourly_list = [{"hour": int(r["Hour"]), "n_records": int(r["n_records"])} for _, r in hourly.iterrows()]

vtype = pd.read_csv(os.path.join(TABLES_DIR, "unique_vessel_type_counts.csv"))
vtype_list = []
for _, r in vtype.iterrows():
    label = str(r["VesselTypeLabel"])
    vtype_list.append({
        "type":     label,
        "n_unique": int(r["n_unique_vessels"]),
        "color":    VESSEL_TYPE_COLORS.get(label, "#9E9E9E"),
    })

status = pd.read_csv(os.path.join(TABLES_DIR, "status_counts.csv"))
status_list = [{"status": str(r["StatusLabel"]), "n_records": int(r["n_records"])}
               for _, r in status.iterrows()]

numeric = pd.read_csv(os.path.join(TABLES_DIR, "numeric_summary.csv"))
sog_row = numeric[numeric["variable"] == "SOG"].iloc[0]
sog_max = float(sog_row["max"])
pct_map = {
    0.00: float(sog_row["min"]),
    0.01: float(sog_row["1%"]),
    0.05: float(sog_row["5%"]),
    0.25: float(sog_row["25%"]),
    0.50: float(sog_row["50%"]),
    0.75: float(sog_row["75%"]),
    0.95: float(sog_row["95%"]),
    0.99: float(sog_row["99%"]),
    1.00: float(sog_row["max"]),
}
total_sog_records = int(sog_row["count"])
bins = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17, 20, 25, 30]
bin_counts = []
prev_pct = 0.0
for i, b in enumerate(bins[:-1]):
    b_next = bins[i+1]
    def pct_at(v):
        sorted_pts = sorted(pct_map.items())
        for j in range(len(sorted_pts)-1):
            p0, v0 = sorted_pts[j]
            p1, v1 = sorted_pts[j+1]
            if v0 <= v <= v1:
                if v1 == v0: return p0
                return p0 + (p1-p0)*(v-v0)/(v1-v0)
        return 1.0 if v >= sorted_pts[-1][1] else 0.0
    f0 = pct_at(b)
    f1 = pct_at(b_next)
    count = int((f1 - f0) * total_sog_records)
    if count > 0:
        bin_counts.append({"bin_center": round((b + b_next)/2, 1), "count": count})

with open(os.path.join(LOG_DIR, "07_final_summary.json")) as f:
    final_summary = json.load(f)

stats_out = {
    "global": {
        "total_records":   final_summary["raw_dynamic_rows"],
        "unique_vessels":  final_summary["cleaned_unique_vessels"],
        "date_range":      ["2024-01-01", "2024-01-31"],
        "data_source":     "USCG/NOAA AIS 2024-01 (10% sample)",
    },
    "hourly_activity": hourly_list,
    "vessel_types":    vtype_list,
    "nav_status":      status_list,
    "sog_distribution": bin_counts,
}
with open(os.path.join(OUT_DIR, "stats.json"), "w") as f:
    json.dump(stats_out, f, indent=2)
print(f"  -> stats.json written ({len(vtype_list)} vessel types, {len(status_list)} statuses)")

print("[2/3] Building ports.json from per_vessel_stats ...")

per_vessel = pd.read_csv(os.path.join(TABLES_DIR, "per_vessel_stats.csv"))

for port in PORTS:
    port["n_unique_vessels"] = 0
    port["n_records"]        = 0
    port["top_types"]        = []

ports_json = json.dumps(PORTS, indent=2)

print("[3/3] Loading cleaned AIS parquet and extracting port trajectories ...")
print(f"  Reading {CLEANED_FILE} ...")

COLS = ["MMSI", "LAT", "LON", "SOG", "BaseDateTime", "VesselTypeLabel", "StatusLabel", "Hour"]
available_cols = pd.read_parquet(CLEANED_FILE, engine="pyarrow").columns.tolist()
use_cols = [c for c in COLS if c in available_cols]
df = pd.read_parquet(CLEANED_FILE, columns=use_cols, engine="pyarrow")
print(f"  Loaded {len(df):,} rows, {df['MMSI'].nunique()} unique vessels")

df["BaseDateTime"] = pd.to_datetime(df["BaseDateTime"], utc=True, errors="coerce")
df = df.sort_values(["MMSI", "BaseDateTime"]).reset_index(drop=True)

trajectories_out = {}
MAX_VESSELS_PER_PORT = 120
MAX_POINTS_PER_VESSEL = 60

for port in PORTS:
    pid   = port["id"]
    plat  = port["lat"]
    plon  = port["lon"]
    print(f"  Port {pid}: filtering nearby vessels ...", end=" ", flush=True)

    mask = (
        (df["LAT"] >= plat - PORT_RADIUS_DEG) & (df["LAT"] <= plat + PORT_RADIUS_DEG) &
        (df["LON"] >= plon - PORT_RADIUS_DEG) & (df["LON"] <= plon + PORT_RADIUS_DEG)
    )
    nearby = df[mask].copy()

    if len(nearby) == 0:
        print("no data found")
        trajectories_out[pid] = []
        continue

    vessel_groups = nearby.groupby("MMSI")
    valid_mmsi = []
    for mmsi, grp in vessel_groups:
        dists = [haversine(r["LAT"], r["LON"], plat, plon) for _, r in grp.iterrows()]
        if min(dists) <= PORT_RADIUS_KM:
            valid_mmsi.append(mmsi)

    actual_vessel_count = len(valid_mmsi)
    print(f"{actual_vessel_count} vessels found", end=" -> ", flush=True)

    if len(valid_mmsi) > MAX_VESSELS_PER_PORT:
        valid_mmsi = random.sample(valid_mmsi, MAX_VESSELS_PER_PORT)

    trajs = []
    for mmsi in valid_mmsi:
        sub = nearby[nearby["MMSI"] == mmsi].copy()
        sub.attrs["port_lat"] = plat
        sub.attrs["port_lon"] = plon

        if len(sub) > MAX_POINTS_PER_VESSEL:
            idx = np.round(np.linspace(0, len(sub)-1, MAX_POINTS_PER_VESSEL)).astype(int)
            sub = sub.iloc[idx]

        vtype = str(sub["VesselTypeLabel"].mode().iloc[0]) if "VesselTypeLabel" in sub.columns else "Unknown"
        color = VESSEL_TYPE_COLORS.get(vtype, "#9E9E9E")
        hour  = int(sub["Hour"].mode().iloc[0]) if "Hour" in sub.columns else 0
        pattern = classify_pattern(sub)

        pts = []
        for _, row in sub.iterrows():
            pts.append({
                "lat": round(float(row["LAT"]), 5),
                "lon": round(float(row["LON"]), 5),
                "sog": round(float(row["SOG"]) if pd.notna(row["SOG"]) else 0.0, 1),
            })

        if len(pts) >= 2:
            trajs.append({
                "mmsi":        str(mmsi),
                "vessel_type": vtype,
                "color":       color,
                "pattern":     pattern,
                "hour":        hour,
                "points":      pts,
            })

    port_vessel_df = nearby[nearby["MMSI"].isin(valid_mmsi)]
    port["n_unique_vessels"] = actual_vessel_count
    port["n_records"]        = int(mask.sum())
    if "VesselTypeLabel" in port_vessel_df.columns:
        top = (port_vessel_df.groupby("VesselTypeLabel").size()
               .sort_values(ascending=False).head(4).index.tolist())
        port["top_types"] = top

    trajectories_out[pid] = trajs
    print(f"{len(trajs)} trajectories saved")

with open(os.path.join(OUT_DIR, "vessel_trajectories.json"), "w") as f:
    json.dump(trajectories_out, f)
print(f"  -> vessel_trajectories.json written")

with open(os.path.join(OUT_DIR, "ports.json"), "w") as f:
    json.dump(PORTS, f, indent=2)
print(f"  -> ports.json written")

print("\nDone! All JSON files updated with real AIS data.")
print({pid: len(t) for pid, t in trajectories_out.items()})
