import json, math, random

random.seed(42)

PORTS = {
    "LA":  {"lat": 33.735, "lon": -118.265},
    "NY":  {"lat": 40.665, "lon": -74.065},
    "SEA": {"lat": 47.600, "lon": -122.345},
    "HOU": {"lat": 29.735, "lon": -95.265},
    "NOL": {"lat": 29.945, "lon": -90.065},
}

VESSEL_TYPES = [
    ("Cargo", "#2196F3", 0.22),
    ("Tanker", "#FF5722", 0.12),
    ("Fishing", "#4CAF50", 0.20),
    ("Tug", "#FF9800", 0.10),
    ("Passenger", "#9C27B0", 0.06),
    ("Sailing", "#00BCD4", 0.10),
    ("Pleasure craft", "#8BC34A", 0.15),
    ("Other", "#9E9E9E", 0.05),
]

def pick_type():
    r = random.random()
    cum = 0
    for name, color, prob in VESSEL_TYPES:
        cum += prob
        if r < cum:
            return name, color
    return VESSEL_TYPES[-1][0], VESSEL_TYPES[-1][1]

def gen_trajectory(port_lat, port_lon, pattern, mmsi, vtype, color, hour):
    pts = []
    if pattern == "inbound":
        angle = random.uniform(180, 360) * math.pi / 180
        dist = random.uniform(0.5, 1.5)
        start_lat = port_lat + dist * math.cos(angle)
        start_lon = port_lon + dist * math.sin(angle) * 1.2
        n = random.randint(8, 18)
        for i in range(n):
            t = i / (n - 1)
            lat = start_lat + t * (port_lat - start_lat) + random.gauss(0, 0.005)
            lon = start_lon + t * (port_lon - start_lon) + random.gauss(0, 0.007)
            sog = max(0.5, random.gauss(10, 2) * (1 - t * 0.7))
            pts.append({"lat": round(lat, 5), "lon": round(lon, 5), "sog": round(sog, 1)})
    elif pattern == "outbound":
        angle = random.uniform(0, 180) * math.pi / 180
        dist = random.uniform(0.5, 1.5)
        end_lat = port_lat + dist * math.cos(angle)
        end_lon = port_lon + dist * math.sin(angle) * 1.2
        n = random.randint(8, 18)
        for i in range(n):
            t = i / (n - 1)
            lat = port_lat + t * (end_lat - port_lat) + random.gauss(0, 0.005)
            lon = port_lon + t * (end_lon - port_lon) + random.gauss(0, 0.007)
            sog = max(0.5, random.gauss(4, 1) + t * 8)
            pts.append({"lat": round(lat, 5), "lon": round(lon, 5), "sog": round(sog, 1)})
    elif pattern == "anchored":
        base_lat = port_lat + random.gauss(0, 0.12)
        base_lon = port_lon + random.gauss(0, 0.15)
        n = random.randint(5, 12)
        for i in range(n):
            lat = base_lat + random.gauss(0, 0.003)
            lon = base_lon + random.gauss(0, 0.004)
            sog = max(0, random.gauss(0.2, 0.15))
            pts.append({"lat": round(lat, 5), "lon": round(lon, 5), "sog": round(sog, 1)})
    elif pattern == "coastal":
        angle = random.uniform(0, 360) * math.pi / 180
        start_dist = random.uniform(0.3, 0.8)
        arc = random.uniform(0.8, 1.4)
        n = random.randint(10, 20)
        for i in range(n):
            t = i / (n - 1)
            cur_angle = angle + t * arc
            dist = start_dist + random.gauss(0, 0.03)
            lat = port_lat + dist * math.cos(cur_angle) + random.gauss(0, 0.004)
            lon = port_lon + dist * math.sin(cur_angle) * 1.2 + random.gauss(0, 0.005)
            sog = max(1, random.gauss(7, 2))
            pts.append({"lat": round(lat, 5), "lon": round(lon, 5), "sog": round(sog, 1)})
    return {
        "mmsi": str(mmsi),
        "vessel_type": vtype,
        "color": color,
        "pattern": pattern,
        "hour": hour,
        "points": pts
    }

result = {}
PATTERNS = ["inbound", "outbound", "anchored", "coastal"]
PATTERN_WEIGHTS = [0.28, 0.28, 0.24, 0.20]

for port_id, port in PORTS.items():
    trajectories = []
    base_mmsi = hash(port_id) % 900000000 + 100000000
    for i in range(80):
        mmsi = base_mmsi + i
        vtype, color = pick_type()
        r = random.random()
        cum = 0
        pattern = PATTERNS[-1]
        for pat, w in zip(PATTERNS, PATTERN_WEIGHTS):
            cum += w
            if r < cum:
                pattern = pat
                break
        hour = random.choices(range(24), weights=[
            5,4,4,4,4,5,7,9,10,11,11,11,11,11,11,11,11,10,10,9,9,8,7,6
        ])[0]
        traj = gen_trajectory(port["lat"], port["lon"], pattern, mmsi, vtype, color, hour)
        trajectories.append(traj)
    result[port_id] = trajectories

with open("vessel_trajectories.json", "w") as f:
    json.dump(result, f)
print("Done:", {k: len(v) for k, v in result.items()})
