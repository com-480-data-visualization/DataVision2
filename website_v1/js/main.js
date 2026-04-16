const State = {
  ports:              [],
  stats:              null,
  trajectories:       {},
  globalTrajectories: [],

  selectedPort:   null,
  activeTypes:    null,
  activePatterns: new Set(["inbound", "outbound", "anchored", "coastal"]),
  currentHour:    null,
};

const $ = (id) => document.getElementById(id);
const fmt = (n) => n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(n);

function showLoading(msg = "Loading data…") {
  $("loading").style.display = "flex";
  $("loading").querySelector(".load-text").textContent = msg;
}
function hideLoading() {
  $("loading").style.display = "none";
}

async function loadAll() {
  showLoading("Loading port data…");
  const [ports, stats, trajectories] = await Promise.all([
    fetch("data/ports.json").then(r => r.json()),
    fetch("data/stats.json").then(r => r.json()),
    fetch("data/vessel_trajectories.json").then(r => r.json()),
  ]);
  State.ports        = ports;
  State.stats        = stats;
  State.trajectories = trajectories;

  showLoading("Loading global trajectories…");
  try {
    State.globalTrajectories = await fetch("data/vessel_trajectories_global.json").then(r => r.json());
    console.log(`[INFO] Global trajectories loaded: ${State.globalTrajectories.length}`);
  } catch (e) {
    console.warn("[WARN] vessel_trajectories_global.json not found, falling back to port trajectories.");
    State.globalTrajectories = Object.values(trajectories).flat();
  }
}

function renderPortList() {
  const container = $("port-list");
  container.innerHTML = "";
  State.ports.forEach((port, idx) => {
    const color = MapView.PORT_COLORS[idx % MapView.PORT_COLORS.length];
    const btn = document.createElement("button");
    btn.className = "port-btn" + (State.selectedPort?.id === port.id ? " active" : "");
    btn.dataset.portId = port.id;
    btn.innerHTML = `
      <div class="port-dot" style="background:${color}"></div>
      <div class="port-info">
        <div class="port-name">${port.name}</div>
        <div class="port-meta">${port.state} · ${fmt(port.n_unique_vessels)} vessels</div>
      </div>
      <span class="port-chevron">▶</span>
    `;
    btn.addEventListener("click", () => selectPort(port.id));
    container.appendChild(btn);
  });
}

function renderTypeFilter() {
  const container = $("type-grid");
  container.innerHTML = "";
  State.stats.vessel_types.forEach(vt => {
    const tag = document.createElement("div");
    const active = State.activeTypes === null || State.activeTypes.has(vt.type);
    tag.className = "type-tag" + (active ? "" : " inactive");
    tag.dataset.type = vt.type;
    tag.innerHTML = `<div class="type-dot" style="background:${vt.color}"></div>${vt.type}`;
    tag.addEventListener("click", () => toggleType(vt.type));
    container.appendChild(tag);
  });
}

function toggleType(type) {
  if (State.activeTypes === null) {
    State.activeTypes = new Set(State.stats.vessel_types.map(v => v.type));
    State.activeTypes.delete(type);
  } else {
    if (State.activeTypes.has(type)) {
      State.activeTypes.delete(type);
      if (State.activeTypes.size === 0) State.activeTypes = null;
    } else {
      State.activeTypes.add(type);
      if (State.activeTypes.size === State.stats.vessel_types.length) State.activeTypes = null;
    }
  }
  renderTypeFilter();
  redrawTrajectories();
  updateFleetChart();
}

function renderPatternFilter() {
  const allActive = State.activePatterns.size === 4;
  document.querySelectorAll(".pattern-btn").forEach(btn => {
    const p = btn.dataset.pattern;
    if (p === "all") {
      btn.classList.toggle("active", allActive);
    } else {
      btn.classList.toggle("active", State.activePatterns.has(p));
    }
  });
}

function setViewMode(isPortView) {
  const patternSection = $("pattern-section");
  if (patternSection) patternSection.style.opacity = isPortView ? "1" : "0.35";
  if (patternSection) patternSection.style.pointerEvents = isPortView ? "" : "none";

  const badge = $("view-mode-badge");
  if (badge) {
    if (isPortView && State.selectedPort) {
      badge.textContent = `Port: ${State.selectedPort.id}`;
      badge.style.background = "rgba(88,166,255,0.18)";
      badge.style.color = "#58a6ff";
    } else {
      badge.textContent = "Global view";
      badge.style.background = "rgba(255,255,255,0.06)";
      badge.style.color = "#8b949e";
    }
  }

  updateViewButtons(isPortView);

  const legend = $("map-legend");
  if (!legend) return;
  if (isPortView) {
    legend.innerHTML = `
      <div style="font-size:10px;font-weight:600;color:#8b949e;margin-bottom:4px;letter-spacing:.06em;text-transform:uppercase">Track type</div>
      <div class="legend-row"><div class="legend-line" style="background:#3fb950"></div>Inbound</div>
      <div class="legend-row"><div class="legend-line" style="background:#2f81f7"></div>Outbound</div>
      <div class="legend-row"><div class="legend-line" style="background:#f0883e"></div>Anchored / Waiting</div>
      <div class="legend-row"><div class="legend-line" style="background:#bc8cff"></div>Coastal</div>
      <div style="margin-top:8px;font-size:10px;font-weight:600;color:#8b949e;margin-bottom:4px;letter-spacing:.06em;text-transform:uppercase">Anchor zone</div>
      <div class="legend-row">
        <div style="width:20px;height:0;border:1px dashed #f0883e;opacity:.7"></div>
        Waiting / Anchorage area
      </div>`;
  } else {
    legend.innerHTML = `
      <div style="font-size:10px;font-weight:600;color:#8b949e;margin-bottom:4px;letter-spacing:.06em;text-transform:uppercase">Speed over Ground</div>
      <div class="legend-row"><div class="legend-line" style="background:#58a6ff"></div>Underway (≥ 1.5 kn)</div>
      <div class="legend-row"><div class="legend-line" style="background:#f0883e"></div>Slow / Stationary</div>
      <div style="margin-top:6px;font-size:10px;color:#8b949e">Click a port to see<br>detailed patterns</div>`;
  }
}

function initPatternButtons() {
  document.querySelectorAll(".pattern-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const p = btn.dataset.pattern;
      if (p === "all") {
        State.activePatterns = new Set(["inbound", "outbound", "anchored", "coastal"]);
      } else {
        if (State.activePatterns.has(p)) State.activePatterns.delete(p);
        else State.activePatterns.add(p);
        if (State.activePatterns.size === 0) State.activePatterns = new Set(["inbound", "outbound", "anchored", "coastal"]);
      }
      renderPatternFilter();
      redrawTrajectories();
    });
  });
}

function initHourSlider() {
  const slider = $("hour-slider");
  const label  = $("hour-label");

  slider.addEventListener("input", () => {
    const v = parseInt(slider.value);
    if (v === -1) {
      State.currentHour = null;
      label.textContent = "All hours";
    } else {
      State.currentHour = v;
      label.textContent = `${String(v).padStart(2, "0")}:00 UTC`;
    }
    const hourlyData = State.selectedPort
      ? computePortHourly(State.selectedPort.id)
      : State.stats.hourly_activity;
    Charts.drawHourly(hourlyData, State.currentHour);
    redrawTrajectories();
  });
}

function renderGlobalStats() {
  const s = State.stats.global;
  $("stat-records").textContent  = fmt(s.total_records);
  $("stat-vessels").textContent  = fmt(s.unique_vessels);
  const dr = s.date_range;
  $("stat-date").textContent = dr.length >= 2 ? `${dr[0]}  →  ${dr[1]}` : dr[0];
}

function selectPort(portId) {
  const port = State.ports.find(p => p.id === portId);
  if (!port) return;
  State.selectedPort = port;
  document.querySelectorAll(".port-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.portId === portId);
  });
  MapView.flyToPort(port);
  MapView.drawAnchorZones(port);
  redrawTrajectories();
  renderPortDetail(port);
  setViewMode(true);
  updateActivityCharts();
  updateFleetChart();
}

function deselectPort() {
  State.selectedPort = null;
  MapView.clearAnchorZones();
  MapView.flyToUS();
  document.querySelectorAll(".port-btn").forEach(btn => btn.classList.remove("active"));
  renderPortDetail(null);
  redrawTrajectories();
  setViewMode(false);
  updateActivityCharts();
  updateFleetChart();
}

function renderPortDetail(port) {
  const card = $("port-detail-card");
  const empty = $("no-port-msg");

  if (!port) {
    card.classList.remove("visible");
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";
  card.classList.add("visible");

  const idx   = State.ports.findIndex(p => p.id === port.id);
  const color = MapView.PORT_COLORS[idx % MapView.PORT_COLORS.length];
  const trajs = State.trajectories[port.id] || [];
  const nInbound  = trajs.filter(t => t.pattern === "inbound").length;
  const nOutbound = trajs.filter(t => t.pattern === "outbound").length;
  const nAnchored = trajs.filter(t => t.pattern === "anchored").length;
  const nCoastal  = trajs.filter(t => t.pattern === "coastal").length;

  card.innerHTML = `
    <div class="pdc-header">
      <div class="pdc-dot" style="background:${color}"></div>
      <div class="pdc-name">${port.name}</div>
    </div>
    <div class="pdc-stats">
      <div class="pdc-stat">
        <div class="pdc-stat-val">${fmt(port.n_unique_vessels)}</div>
        <div class="pdc-stat-lbl">Unique vessels</div>
      </div>
      <div class="pdc-stat">
        <div class="pdc-stat-val">${fmt(port.n_records)}</div>
        <div class="pdc-stat-lbl">AIS records</div>
      </div>
      <div class="pdc-stat">
        <div class="pdc-stat-val" style="color:#3fb950">${nInbound}</div>
        <div class="pdc-stat-lbl">Inbound tracks</div>
      </div>
      <div class="pdc-stat">
        <div class="pdc-stat-val" style="color:#2f81f7">${nOutbound}</div>
        <div class="pdc-stat-lbl">Outbound tracks</div>
      </div>
      <div class="pdc-stat">
        <div class="pdc-stat-val" style="color:#f0883e">${nAnchored}</div>
        <div class="pdc-stat-lbl">Anchored tracks</div>
      </div>
      <div class="pdc-stat">
        <div class="pdc-stat-val" style="color:#bc8cff">${nCoastal}</div>
        <div class="pdc-stat-lbl">Coastal tracks</div>
      </div>
    </div>
    <div style="font-size:10px;color:#8b949e;margin-bottom:6px">Top vessel types</div>
    <div class="pdc-types">
      ${port.top_types.map(t => `<span class="pdc-type-chip">${t}</span>`).join("")}
    </div>
  `;
}

const PORT_ZOOM_THRESHOLD = 7;

function computePortHourly(portId) {
  const trajs = State.trajectories[portId] || [];
  const counts = Array.from({ length: 24 }, (_, h) => ({ hour: h, n_records: 0 }));
  trajs.forEach(t => {
    const h = t.hour;
    if (h >= 0 && h < 24) counts[h].n_records++;
  });
  return counts;
}

function computePortSog(portId) {
  const trajs = State.trajectories[portId] || [];
  const BIN = 0.5;
  const MAX_SOG = 30;
  const binMap = {};
  trajs.forEach(t => {
    (t.points || []).forEach(p => {
      const s = p.sog;
      if (s < 0 || s > MAX_SOG) return;
      const bin = Math.round(Math.floor(s / BIN) * BIN * 10) / 10;
      binMap[bin] = (binMap[bin] || 0) + 1;
    });
  });
  return Object.entries(binMap)
    .map(([b, count]) => ({ bin_center: parseFloat(b), count }))
    .sort((a, b) => a.bin_center - b.bin_center);
}

function computePortVesselTypes(portId) {
  const trajs = State.trajectories[portId] || [];
  const colorMap = {};
  (State.stats.vessel_types || []).forEach(vt => { colorMap[vt.type] = vt.color; });

  const typeMMSI = {};
  trajs.forEach(t => {
    const vt = t.vessel_type || "Unknown";
    if (!typeMMSI[vt]) typeMMSI[vt] = new Set();
    typeMMSI[vt].add(t.mmsi);
  });

  return Object.entries(typeMMSI)
    .map(([type, mmsiSet]) => ({
      type,
      n_unique: mmsiSet.size,
      color: colorMap[type] || "#6e7681",
    }))
    .sort((a, b) => b.n_unique - a.n_unique);
}

function updateFleetChart() {
  const port = State.selectedPort;
  const lbl  = $("fleet-context-label");

  if (port) {
    if (lbl) { lbl.textContent = `Port: ${port.name}`; lbl.classList.add("port-mode"); }
    Charts.drawVesselTypes(computePortVesselTypes(port.id), State.activeTypes);
  } else {
    if (lbl) { lbl.textContent = "Global dataset"; lbl.classList.remove("port-mode"); }
    Charts.drawVesselTypes(State.stats.vessel_types, State.activeTypes);
  }
}

function updateActivityCharts() {
  const port = State.selectedPort;
  const ctxLabel  = $("activity-context-label");
  const scopeNote = $("status-scope-note");

  if (port) {
    if (ctxLabel) {
      ctxLabel.textContent = `Port: ${port.name}`;
      ctxLabel.classList.add("port-mode");
    }
    if (scopeNote) scopeNote.textContent = "(global)";
    Charts.drawHourly(computePortHourly(port.id), State.currentHour);
    Charts.drawSog(computePortSog(port.id));
  } else {
    if (ctxLabel) {
      ctxLabel.textContent = "Global dataset";
      ctxLabel.classList.remove("port-mode");
    }
    if (scopeNote) scopeNote.textContent = "";
    Charts.drawHourly(State.stats.hourly_activity, State.currentHour);
    Charts.drawSog(State.stats.sog_distribution);
  }
  Charts.drawStatus(State.stats.nav_status);
}

function redrawTrajectories() {
  const filters = {
    activeTypes:    State.activeTypes,
    activePatterns: State.activePatterns,
    hour:           State.currentHour,
  };

  if (State.selectedPort) {
    const trajs = State.trajectories[State.selectedPort.id] || [];
    MapView.drawTrajectories(trajs, filters, false);
  } else {
    MapView.drawTrajectories(State.globalTrajectories, filters, true);
  }
}

function onMapZoom() {
  const zoom = MapView.getMap().getZoom();
  if (zoom < PORT_ZOOM_THRESHOLD && State.selectedPort) {
    deselectPort();
  }
}

function updateViewButtons(isPortView) {
  const btnGlobal = $("btn-global-view");
  const btnPort   = $("btn-port-view");
  if (!btnGlobal || !btnPort) return;
  btnGlobal.classList.toggle("active", !isPortView);
  btnPort.classList.toggle("active", isPortView);
  btnPort.disabled = !isPortView;
}

function initViewToggles() {
  const btnGlobal = $("btn-global-view");
  if (btnGlobal) {
    btnGlobal.addEventListener("click", () => {
      if (State.selectedPort) deselectPort();
    });
  }
}

function initTabs() {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const pane = btn.dataset.pane;
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      $(pane).classList.add("active");
      if (pane === "tab-activity") {
        requestAnimationFrame(() => updateActivityCharts());
      } else if (pane === "tab-fleet") {
        requestAnimationFrame(() => updateFleetChart());
      }
    });
  });
}

async function main() {
  showLoading("Initializing map…");
  MapView.init();
  showLoading("Loading AIS data…");
  await loadAll();
  MapView.addPortMarkers(State.ports, selectPort);
  renderPortList();
  renderGlobalStats();
  renderTypeFilter();
  renderPatternFilter();

  initHourSlider();
  initPatternButtons();
  initViewToggles();
  initTabs();
  updateActivityCharts();
  updateFleetChart();
  redrawTrajectories();
  setViewMode(false);

  MapView.getMap().on("zoomend", onMapZoom);
  hideLoading();
  window.addEventListener("resize", () => {
    updateActivityCharts();
    updateFleetChart();
  });
}

document.addEventListener("DOMContentLoaded", main);
