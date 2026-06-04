const fmt = new Intl.NumberFormat();

const severityOrder = ["critical", "error", "warning", "info", "other"];
const amrEventLabels = {
  dataConnection: "Data Connection",
  connectionLoss: "Connection Loss",
  mapUpdate: "Map Update",
};
const amrEventOrder = ["dataConnection", "connectionLoss", "mapUpdate"];

function byId(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  byId(id).textContent = value;
}

function count(data, path, fallback = 0) {
  return path.reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), data) ?? fallback;
}

function renderBars(severities) {
  const total = Object.values(severities).reduce((sum, value) => sum + value, 0);
  const container = byId("severityBars");
  container.innerHTML = "";
  if (!total) {
    container.innerHTML = '<p class="empty">No parsed log lines yet.</p>';
    return;
  }

  severityOrder.forEach((name) => {
    const value = severities[name] || 0;
    const pct = total ? Math.round((value / total) * 100) : 0;
    const row = document.createElement("div");
    row.className = "bar-row";
    row.innerHTML = `
      <span>${name}</span>
      <div class="track"><div class="fill ${name}" style="width:${pct}%"></div></div>
      <strong>${fmt.format(value)}</strong>
    `;
    container.appendChild(row);
  });
}

function renderAmrBars(counts) {
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const container = byId("amrEventBars");
  container.innerHTML = "";
  if (!total) {
    container.innerHTML = '<p class="empty">No AMR connection or map events found yet.</p>';
    return;
  }

  amrEventOrder.forEach((name) => {
    const value = counts[name] || 0;
    const pct = total ? Math.round((value / total) * 100) : 0;
    const row = document.createElement("div");
    row.className = "bar-row";
    row.innerHTML = `
      <span>${amrEventLabels[name]}</span>
      <div class="track"><div class="fill ${name}" style="width:${pct}%"></div></div>
      <strong>${fmt.format(value)}</strong>
    `;
    container.appendChild(row);
  });
}

function renderRank(id, items, emptyText) {
  const container = byId(id);
  container.innerHTML = "";
  if (!items || !items.length) {
    container.innerHTML = `<p class="empty">${emptyText}</p>`;
    return;
  }
  items.slice(0, 12).forEach((item) => {
    const row = document.createElement("div");
    row.className = "rank-item";
    row.innerHTML = `<span class="rank-name" title="${item.name}">${item.name}</span><span class="rank-count">${fmt.format(item.count)}</span>`;
    container.appendChild(row);
  });
}

function renderFiles(files) {
  const body = byId("filesTable");
  body.innerHTML = "";
  if (!files || !files.length) {
    body.innerHTML = '<tr><td colspan="5" class="empty">No parsed files yet.</td></tr>';
    return;
  }

  files.slice(0, 30).forEach((file) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td title="${file.file}">${file.file}</td>
      <td>${fmt.format(file.lines || 0)}</td>
      <td>${fmt.format(file.severity?.critical || 0)}</td>
      <td>${fmt.format(file.severity?.error || 0)}</td>
      <td>${fmt.format(file.severity?.warning || 0)}</td>
    `;
    body.appendChild(row);
  });
}

function renderAmrTable(id, rows, keyName, emptyText) {
  const body = byId(id);
  body.innerHTML = "";
  if (!rows || !rows.length) {
    body.innerHTML = `<tr><td colspan="4" class="empty">${emptyText}</td></tr>`;
    return;
  }

  rows.slice(0, 30).forEach((rowData) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td title="${escapeHtml(rowData[keyName])}">${escapeHtml(rowData[keyName])}</td>
      <td>${fmt.format(rowData.dataConnection || 0)}</td>
      <td>${fmt.format(rowData.connectionLoss || 0)}</td>
      <td>${fmt.format(rowData.mapUpdate || 0)}</td>
    `;
    body.appendChild(row);
  });
}

function renderAmrEvents(events) {
  const container = byId("amrEvents");
  container.innerHTML = "";
  if (!events || !events.length) {
    container.innerHTML = '<p class="empty">No AMR data connection, connection loss, or map update events found.</p>';
    return;
  }

  events.slice(0, 120).forEach((event) => {
    const row = document.createElement("article");
    row.className = "signal";
    row.innerHTML = `
      <span class="badge ${event.type}">${amrEventLabels[event.type] || event.type}</span>
      <div>
        <p>${escapeHtml(event.message)}</p>
        <div class="signal-meta">${event.timestamp || "No timestamp"} - AMR ${escapeHtml(event.amr || "unknown")} - ${escapeHtml(event.service || "unknown")} - ${escapeHtml(event.file)}</div>
      </div>
    `;
    container.appendChild(row);
  });
}

function renderSignals(signals) {
  const container = byId("signals");
  container.innerHTML = "";
  if (!signals || !signals.length) {
    container.innerHTML = '<p class="empty">No warnings, errors, or critical events found.</p>';
    return;
  }

  signals.slice(0, 80).forEach((signal) => {
    const row = document.createElement("article");
    row.className = "signal";
    row.innerHTML = `
      <span class="badge ${signal.severity}">${signal.severity}</span>
      <div>
        <p>${escapeHtml(signal.message)}</p>
        <div class="signal-meta">${signal.timestamp || "No timestamp"} - ${signal.service || "unknown"} - ${signal.file}</div>
      </div>
    `;
    container.appendChild(row);
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderTimeline(items) {
  const canvas = byId("timelineChart");
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  if (!items || !items.length) {
    ctx.fillStyle = "#667071";
    ctx.font = "24px sans-serif";
    ctx.fillText("No timestamped log lines yet", 32, 142);
    return;
  }

  const data = items.slice(-72);
  const max = Math.max(
    ...data.map((item) => (item.count || 0) + (item.dataConnection || 0) + (item.connectionLoss || 0) + (item.mapUpdate || 0)),
    1
  );
  const pad = 34;
  const barGap = 3;
  const barWidth = Math.max(3, (width - pad * 2) / data.length - barGap);

  ctx.strokeStyle = "#dfe4df";
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const y = pad + ((height - pad * 2) / 3) * i;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(width - pad, y);
    ctx.stroke();
  }

  data.forEach((item, index) => {
    const x = pad + index * (barWidth + barGap);
    const values = item.count !== undefined
      ? [{ color: "#2563eb", value: item.count }]
      : [
          { color: "#0f766e", value: item.dataConnection || 0 },
          { color: "#c2410c", value: item.connectionLoss || 0 },
          { color: "#7c3aed", value: item.mapUpdate || 0 },
        ];
    let y = height - pad;
    values.forEach((part) => {
      if (!part.value) return;
      const h = Math.max(2, ((height - pad * 2) * part.value) / max);
      y -= h;
      ctx.fillStyle = part.color;
      ctx.fillRect(x, y, barWidth, h);
    });
  });

  ctx.fillStyle = "#667071";
  ctx.font = "20px sans-serif";
  ctx.fillText(fmt.format(max), pad, 24);
}

async function init() {
  const response = await fetch("data/logs.json", { cache: "no-store" });
  const data = await response.json();
  const amr = data.amr || {};
  const amrCounts = amr.counts || {};

  setText("hostTitle", data.sourceHost || "Ubuntu Server");
  setText("generatedAt", data.generatedAt ? `Generated ${new Date(data.generatedAt).toLocaleString()}` : "Waiting for log pull");
  setText("archiveName", data.archive || "");
  setText("amrDataConnections", fmt.format(amrCounts.dataConnection || 0));
  setText("amrConnectionLoss", fmt.format(amrCounts.connectionLoss || 0));
  setText("amrMapUpdates", fmt.format(amrCounts.mapUpdate || 0));
  setText("linesTotal", fmt.format(count(data, ["totals", "lines"])));

  renderAmrBars(amrCounts);
  renderTimeline(amr.timeline || []);
  renderAmrTable("amrTable", amr.robots || [], "amr", "No AMR IDs found in the matched events.");
  renderAmrTable("amrFilesTable", amr.files || [], "file", "No AMR event files found.");
  renderAmrEvents(amr.recent || []);
  renderBars(data.severities || {});
  renderRank("serviceList", data.services || [], "No service activity parsed yet.");
  renderFiles(data.topFiles || []);
  renderSignals(data.recentSignals || []);
}

init().catch((error) => {
  document.body.innerHTML = `<main><section class="panel"><p class="empty">Unable to load dashboard data: ${escapeHtml(error.message)}</p></section></main>`;
});
