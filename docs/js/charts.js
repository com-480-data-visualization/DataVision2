const Charts = (() => {
  const sel = (id) => document.getElementById(id);
  const fmt = d3.format(",");

  function clearSvg(el) {
    d3.select(el).selectAll("*").remove();
  }

  const CHART_HEIGHTS = { "chart-hourly": 110, "chart-sog": 90, "chart-types": 160, "chart-status": 110 };

  function getSize(el) {
    const r = el.getBoundingClientRect();
    const fallbackH = CHART_HEIGHTS[el.id] || 100;
    const w = r.width || el.offsetWidth || el.parentElement?.offsetWidth || 240;
    const h = r.height || el.offsetHeight || fallbackH;
    return { w: Math.max(w, 180), h: Math.max(h, fallbackH) };
  }

  function drawHourly(data, highlightHour = null) {
    const el = sel("chart-hourly");
    clearSvg(el);
    const { w, h } = getSize(el);
    const mg = { top: 6, right: 6, bottom: 20, left: 32 };
    const iw = w - mg.left - mg.right;
    const ih = h - mg.top - mg.bottom;

    const svg = d3.select(el)
      .append("svg").attr("width", w).attr("height", h)
      .append("g").attr("transform", `translate(${mg.left},${mg.top})`);

    const x = d3.scaleBand().domain(data.map(d => d.hour)).range([0, iw]).padding(0.15);
    const y = d3.scaleLinear().domain([0, d3.max(data, d => d.n_records)]).range([ih, 0]).nice();

    svg.append("g").attr("class", "grid")
      .call(d3.axisLeft(y).ticks(4).tickSize(-iw).tickFormat(""))
      .selectAll("line").style("stroke", "#30363d").style("stroke-dasharray", "3,3");
    svg.select(".grid .domain").remove();

    svg.selectAll(".bar").data(data)
      .join("rect")
      .attr("class", "bar")
      .attr("x", d => x(d.hour))
      .attr("y", d => y(d.n_records))
      .attr("width", x.bandwidth())
      .attr("height", d => ih - y(d.n_records))
      .attr("fill", d => (d.hour === highlightHour) ? "#58a6ff" : "#2f81f7")
      .attr("opacity", d => (highlightHour !== null && d.hour !== highlightHour) ? 0.4 : 0.85)
      .attr("rx", 1);

    const xAxis = d3.axisBottom(x)
      .tickValues([0, 4, 8, 12, 16, 20])
      .tickSize(2);
    svg.append("g").attr("transform", `translate(0,${ih})`).call(xAxis)
      .selectAll("text").style("fill", "#8b949e").style("font-size", "10px");
    svg.selectAll(".domain").style("stroke", "#30363d");

    svg.append("g").call(d3.axisLeft(y).ticks(3).tickFormat(d => d >= 1000 ? d3.format(".0s")(d) : d))
      .selectAll("text").style("fill", "#8b949e").style("font-size", "10px");
  }

  function drawSog(data) {
    const el = sel("chart-sog");
    clearSvg(el);
    const { w, h } = getSize(el);
    const mg = { top: 4, right: 6, bottom: 18, left: 32 };
    const iw = w - mg.left - mg.right;
    const ih = h - mg.top - mg.bottom;

    const svg = d3.select(el)
      .append("svg").attr("width", w).attr("height", h)
      .append("g").attr("transform", `translate(${mg.left},${mg.top})`);

    const x = d3.scaleLinear().domain([0, d3.max(data, d => d.bin_center) + 2]).range([0, iw]);
    const y = d3.scaleLinear().domain([0, d3.max(data, d => d.count)]).range([ih, 0]).nice();

    const area = d3.area()
      .x(d => x(d.bin_center))
      .y0(ih).y1(d => y(d.count))
      .curve(d3.curveCatmullRom);

    svg.append("linearGradient").attr("id", "sog-grad")
      .attr("gradientUnits", "userSpaceOnUse").attr("x1", 0).attr("y1", 0).attr("x2", 0).attr("y2", ih)
      .selectAll("stop").data([
        { offset: "0%",   color: "#58a6ff", opacity: 0.5 },
        { offset: "100%", color: "#58a6ff", opacity: 0.02 }
      ]).join("stop")
        .attr("offset", d => d.offset)
        .attr("stop-color", d => d.color)
        .attr("stop-opacity", d => d.opacity);

    svg.append("path").datum(data).attr("fill", "url(#sog-grad)").attr("d", area);

    const line = d3.line().x(d => x(d.bin_center)).y(d => y(d.count)).curve(d3.curveCatmullRom);
    svg.append("path").datum(data).attr("fill", "none").attr("stroke", "#58a6ff")
      .attr("stroke-width", 1.5).attr("d", line);

    svg.append("g").attr("transform", `translate(0,${ih})`).call(d3.axisBottom(x).ticks(6))
      .selectAll("text").style("fill", "#8b949e").style("font-size", "10px");
    svg.append("g").call(d3.axisLeft(y).ticks(3).tickFormat(d3.format(".0s")))
      .selectAll("text").style("fill", "#8b949e").style("font-size", "10px");
    svg.selectAll(".domain").style("stroke", "#30363d");
  }

  function drawVesselTypes(data, activeTypes = null) {
    const el = sel("chart-types");
    clearSvg(el);
    const { w, h } = getSize(el);
    const mg = { top: 4, right: 40, bottom: 6, left: 4 };
    const iw = w - mg.left - mg.right;
    const ih = h - mg.top - mg.bottom;

    const TOP_N = 8;
    const top = data.slice(0, TOP_N);
    if (data.length > TOP_N) {
      const othersSum = data.slice(TOP_N).reduce((s, d) => s + d.n_unique, 0);
      const othersCount = data.length - TOP_N;
      top.push({ type: `Others (${othersCount} types)`, n_unique: othersSum, color: "#6e7681" });
    }
    const svg = d3.select(el)
      .append("svg").attr("width", w).attr("height", h)
      .append("g").attr("transform", `translate(${mg.left},${mg.top})`);

    const y = d3.scaleBand().domain(top.map(d => d.type)).range([0, ih]).padding(0.25);
    const x = d3.scaleLinear().domain([0, d3.max(top, d => d.n_unique)]).range([0, iw]).nice();

    const labelW = 80;
    const barStart = labelW + 4;
    const barW = iw - labelW - 4;
    const xBar = d3.scaleLinear().domain([0, d3.max(top, d => d.n_unique)]).range([0, barW]).nice();

    top.forEach(d => {
      const isActive = activeTypes === null || activeTypes.has(d.type);
      const g = svg.append("g").attr("transform", `translate(0, ${y(d.type)})`);

      g.append("text").text(d.type)
        .attr("x", labelW - 4).attr("y", y.bandwidth() / 2 + 1)
        .attr("text-anchor", "end").attr("dominant-baseline", "middle")
        .style("font-size", "10px")
        .style("fill", isActive ? "#e6edf3" : "#555e6a");

      g.append("rect")
        .attr("x", barStart).attr("y", 0)
        .attr("width", xBar(d.n_unique)).attr("height", y.bandwidth())
        .attr("fill", d.color || "#2f81f7")
        .attr("opacity", isActive ? 0.85 : 0.2)
        .attr("rx", 2);

      g.append("text").text(fmt(d.n_unique))
        .attr("x", barStart + xBar(d.n_unique) + 4)
        .attr("y", y.bandwidth() / 2 + 1)
        .attr("dominant-baseline", "middle")
        .style("font-size", "10px")
        .style("fill", isActive ? "#8b949e" : "#555e6a");
    });
  }

  function drawStatus(data) {
    const el = sel("chart-status");
    clearSvg(el);
    const { w, h } = getSize(el);
    const r = Math.min(w / 2, h) * 0.82;
    const cx = w * 0.35;
    const cy = h / 2;

    const STATUS_COLORS = {
      "Under way using engine": "#2f81f7",
      "At anchor":              "#f0883e",
      "Moored":                 "#3fb950",
      "Under way sailing":      "#bc8cff",
      "Engaged in fishing":     "#79c0ff",
      "Restricted maneuverability": "#ffa657",
      "Not under command":      "#ff7b72",
      "Undefined":              "#6e7681",
    };

    const top = data.slice(0, 6);
    const total = d3.sum(top, d => d.n_records);

    const pie = d3.pie().value(d => d.n_records).sort(null);
    const arc = d3.arc().innerRadius(r * 0.5).outerRadius(r);

    const svg = d3.select(el).append("svg").attr("width", w).attr("height", h);
    const g = svg.append("g").attr("transform", `translate(${cx},${cy})`);

    g.selectAll("path").data(pie(top)).join("path")
      .attr("d", arc)
      .attr("fill", d => STATUS_COLORS[d.data.status] || "#6e7681")
      .attr("stroke", "#161b22").attr("stroke-width", 1.5)
      .attr("opacity", 0.9);

    g.append("text").text("Status").attr("text-anchor", "middle")
      .attr("y", -6).style("font-size", "10px").style("fill", "#8b949e");
    g.append("text").text(d3.format(".2s")(total)).attr("text-anchor", "middle")
      .attr("y", 8).style("font-size", "13px").style("font-weight", "700").style("fill", "#e6edf3");

    const lx = cx + r + 10;
    const ly0 = cy - (top.length * 14) / 2;
    top.forEach((d, i) => {
      const lg = svg.append("g").attr("transform", `translate(${lx}, ${ly0 + i * 14})`);
      lg.append("rect").attr("width", 7).attr("height", 7).attr("rx", 1)
        .attr("fill", STATUS_COLORS[d.status] || "#6e7681");
      lg.append("text").text(d.status.length > 20 ? d.status.slice(0, 19) + "…" : d.status)
        .attr("x", 10).attr("y", 6)
        .style("font-size", "9px").style("fill", "#8b949e");
    });
  }

  return { drawHourly, drawSog, drawVesselTypes, drawStatus };
})();
