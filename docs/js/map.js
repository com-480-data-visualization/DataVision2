const MapView = (() => {

  let map = null;
  let trajectoryLayer = null;
  let anchorLayer     = null;
  let portLayer       = null;
  let portMarkers     = {};
  let globalCanvas    = null;

  const PORT_COLORS = ["#58a6ff", "#3fb950", "#f0883e", "#bc8cff", "#ffa657"];

  const PATTERN_STYLE = {
    "inbound":  { color: "#3fb950", weight: 1.8, opacity: 0.78 },
    "outbound": { color: "#2f81f7", weight: 1.8, opacity: 0.78 },
    "anchored": { color: "#f0883e", weight: 1.5, opacity: 0.68 },
    "coastal":  { color: "#bc8cff", weight: 1.5, opacity: 0.68 },
  };

  const GLOBAL_UNDERWAY_COLOR  = "#58a6ff";
  const GLOBAL_SLOW_COLOR      = "#f0883e";
  const GLOBAL_SOG_THRESHOLD   = 1.5;
  const GLOBAL_MAX_STEP_KM     = 500;

  const PORT_MAX_GAP_KM = 200;

  function haversineKm(a, b) {
    const R = 6371, r = Math.PI / 180;
    const dlat = (b.lat - a.lat) * r, dlon = (b.lon - a.lon) * r;
    const s = Math.sin(dlat / 2) ** 2 +
              Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dlon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  function segmentTrajectory(points) {
    if (!points || points.length < 2) return [];
    const segs = [];
    let cur = [points[0]];
    for (let i = 1; i < points.length; i++) {
      if (haversineKm(points[i - 1], points[i]) > PORT_MAX_GAP_KM) {
        if (cur.length >= 2) segs.push(cur);
        cur = [points[i]];
      } else {
        cur.push(points[i]);
      }
    }
    if (cur.length >= 2) segs.push(cur);
    return segs;
  }

  function init() {
    map = L.map("map", {
      center: [38, -95], zoom: 4,
      zoomControl: true, attributionControl: true,
    });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://carto.com">CARTO</a> &copy; <a href="https://openstreetmap.org">OSM</a>',
      subdomains: "abcd", maxZoom: 18,
    }).addTo(map);

    trajectoryLayer = L.layerGroup().addTo(map);
    anchorLayer     = L.layerGroup().addTo(map);
    portLayer       = L.layerGroup().addTo(map);
  }

  function addPortMarkers(ports, onPortClick) {
    portLayer.clearLayers();
    portMarkers = {};
    ports.forEach((port, idx) => {
      const color = PORT_COLORS[idx % PORT_COLORS.length];
      const icon = L.divIcon({
        html: `<div style="width:14px;height:14px;border-radius:50%;
          background:${color};border:2px solid #fff;
          box-shadow:0 0 0 3px ${color}44,0 0 12px ${color}88;"></div>`,
        className: "", iconSize: [14, 14], iconAnchor: [7, 7],
      });
      const marker = L.marker([port.lat, port.lon], { icon })
        .addTo(portLayer).on("click", () => onPortClick(port.id));
      marker.bindTooltip(
        `<b>${port.name}</b><br>${port.n_unique_vessels.toLocaleString()} vessels`,
        { direction: "top", offset: [0, -10] }
      );
      portMarkers[port.id] = { marker, color };
    });
  }

  function flyToPort(port) { map.flyTo([port.lat, port.lon], 10, { duration: 1.2 }); }
  function flyToUS()       { map.flyTo([38, -95], 4, { duration: 1.0 }); }

  function drawAnchorZones(port) {
    anchorLayer.clearLayers();
    (port.anchor_zones || []).forEach(z => {
      L.circle([z.lat, z.lon], {
        radius: z.radius_km * 1000, color: "#f0883e", weight: 1.5,
        fillColor: "#f0883e", fillOpacity: 0.08, dashArray: "5,5",
      }).addTo(anchorLayer)
        .bindTooltip(`<b>Anchor Zone</b><br>${z.label}`, { direction: "top" });
    });
  }
  function clearAnchorZones() { anchorLayer.clearLayers(); }

  const GlobalCanvasOverlay = L.Layer.extend({
    _data: [], _filters: {},

    setData(data, filters) {
      this._data    = data;
      this._filters = filters;
      if (this._canvas) this._draw();
    },

    onAdd(map) {
      this._map = map;
      this._canvas = document.createElement("canvas");
      this._canvas.style.cssText = "position:absolute;top:0;left:0;pointer-events:none;z-index:300;";
      map.getPane("overlayPane").appendChild(this._canvas);
      this._resize();
      map.on("moveend zoomend resize", this._onMove, this);
      this._draw();
    },

    onRemove(map) {
      map.off("moveend zoomend resize", this._onMove, this);
      this._canvas.remove();
      this._canvas = null;
    },

    _onMove() { this._resize(); this._draw(); },

    _resize() {
      const sz = this._map.getSize();
      this._canvas.width  = sz.x;
      this._canvas.height = sz.y;
      L.DomUtil.setPosition(this._canvas, this._map.containerPointToLayerPoint([0, 0]));
    },

    _draw() {
      if (!this._canvas) return;
      const ctx  = this._canvas.getContext("2d");
      const sz   = this._map.getSize();
      ctx.clearRect(0, 0, sz.x, sz.y);

      const { activeTypes, hour } = this._filters;

      for (const traj of this._data) {
        if (activeTypes && !activeTypes.has(traj.vessel_type)) continue;
        if (hour !== null && hour !== undefined && Math.abs(traj.hour - hour) > 1) continue;
        if (!traj.points || traj.points.length < 2) continue;

        const meanSog = traj.points.reduce((s, p) => s + (p.sog || 0), 0) / traj.points.length;
        ctx.strokeStyle = meanSog >= GLOBAL_SOG_THRESHOLD ? GLOBAL_UNDERWAY_COLOR : GLOBAL_SLOW_COLOR;
        ctx.globalAlpha = 0.42;
        ctx.lineWidth   = 1.1;
        ctx.beginPath();

        let started = false;
        let prevPx  = null;

        for (const pt of traj.points) {
          const px = this._map.latLngToContainerPoint([pt.lat, pt.lon]);

          if (prevPx) {
            const screenDist = Math.hypot(px.x - prevPx.x, px.y - prevPx.y);
            const kmPerPx    = this._kmPerPixel();
            if (screenDist * kmPerPx > GLOBAL_MAX_STEP_KM) {
              if (started) ctx.stroke();
              ctx.beginPath();
              started = false;
              prevPx  = null;
            }
          }

          if (!started) { ctx.moveTo(px.x, px.y); started = true; }
          else            ctx.lineTo(px.x, px.y);
          prevPx = px;
        }
        if (started) ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },

    _kmPerPixel() {
      const center = this._map.getCenter();
      const zoom   = this._map.getZoom();
      const mPerPx = (156543.03392 * Math.cos(center.lat * Math.PI / 180)) / (2 ** zoom);
      return mPerPx / 1000;
    },
  });

  function _ensureGlobalCanvas() {
    if (!globalCanvas) {
      globalCanvas = new GlobalCanvasOverlay();
      globalCanvas.addTo(map);
    }
  }
  function _removeGlobalCanvas() {
    if (globalCanvas) { map.removeLayer(globalCanvas); globalCanvas = null; }
  }

  function _drawPortTraj(traj, filters) {
    const { activeTypes, activePatterns, hour } = filters;
    if (activeTypes    && !activeTypes.has(traj.vessel_type))        return;
    if (activePatterns && !activePatterns.has(traj.pattern))         return;
    if (hour !== null  && Math.abs(traj.hour - hour) > 1)            return;

    const segs = segmentTrajectory(traj.points);
    if (segs.length === 0) return;

    const style  = PATTERN_STYLE[traj.pattern] || { color: "#8b949e", weight: 1.5, opacity: 0.65 };
    const avgSog = (traj.points.reduce((s, p) => s + p.sog, 0) / traj.points.length).toFixed(1);
    const popup  = `
      <div class="vessel-popup">
        <div class="vp-title">MMSI ${traj.mmsi}</div>
        <div class="vp-row">Type <span>${traj.vessel_type}</span></div>
        <div class="vp-row">Pattern <span style="text-transform:capitalize">${traj.pattern}</span></div>
        <div class="vp-row">Avg SOG <span>${avgSog} kn</span></div>
        <div class="vp-row">Hour <span>${String(traj.hour).padStart(2,"0")}:00 UTC</span></div>
      </div>`;

    segs.forEach(seg => {
      L.polyline(seg.map(p => [p.lat, p.lon]), {
        color: style.color, weight: style.weight, opacity: style.opacity, smoothFactor: 1.2,
      }).addTo(trajectoryLayer).bindPopup(popup, { maxWidth: 200 });
    });

    const first = segs[0][0];
    const last  = segs[segs.length - 1][segs[segs.length - 1].length - 1];
    L.circleMarker([first.lat, first.lon], {
      radius: 3, color: style.color, fillColor: style.color, fillOpacity: 0.9, weight: 1,
    }).addTo(trajectoryLayer);
    L.circleMarker([last.lat,  last.lon], {
      radius: 4, color: "#fff", fillColor: style.color, fillOpacity: 1, weight: 1.5,
    }).addTo(trajectoryLayer);
  }

  function drawTrajectories(trajectories, filters = {}, isGlobal = false) {
    trajectoryLayer.clearLayers();
    if (isGlobal) {
      _ensureGlobalCanvas();
      globalCanvas.setData(trajectories, {
        activeTypes: filters.activeTypes || null,
        hour:        filters.hour !== undefined ? filters.hour : null,
      });
    } else {
      _removeGlobalCanvas();
      const f = {
        activeTypes:    filters.activeTypes    || null,
        activePatterns: filters.activePatterns || null,
        hour:           filters.hour !== undefined ? filters.hour : null,
      };
      trajectories.forEach(t => _drawPortTraj(t, f));
    }
  }

  function clearTrajectories() {
    trajectoryLayer.clearLayers();
    _removeGlobalCanvas();
  }

  function getMap() { return map; }

  return {
    init, addPortMarkers, flyToPort, flyToUS,
    drawTrajectories, clearTrajectories,
    drawAnchorZones, clearAnchorZones,
    getMap, PORT_COLORS,
    GLOBAL_UNDERWAY_COLOR, GLOBAL_SLOW_COLOR,
  };
})();
