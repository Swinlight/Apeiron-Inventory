const STORE_KEY = "device_inventory_v1";

function loadItems() {
  try {
    const items = JSON.parse(localStorage.getItem(STORE_KEY)) || [];
    // Normalize legacy status values
    items.forEach(i => { if (i.status === "For Repair") i.status = "Repair"; });
    return items;
  } catch (e) { return []; }
}
function saveItems(items) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(items)); } catch (e) { console.error("Save failed", e); }
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function escapeHtml(s) {
  if (!s) return "";
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function statusColor(s) {
  return { "In Stock": "var(--stock)", "Assigned": "var(--assigned)", "Repair": "var(--repair)", "Defective": "var(--defective)", "Retired": "var(--retired)" }[s] || "var(--text-dim)";
}
function statusClass(s) {
  return "st-" + String(s || "").toLowerCase().replace(/\s+/g, "-");
}

/* ---------- Sidebar ---------- */
function renderSidebar(active) {
  const items = loadItems();
  const laptops = items.filter(i => i.type === "Laptop").length;
  const phones = items.filter(i => i.type === "Phone").length;
  const el = document.getElementById("sidebar");
  if (!el) return;
  const link = (href, label, count, key) =>
    `<a href="${href}" class="${active === key ? "active" : ""}"><span>${label}</span>${count !== null ? `<span class="count">${count}</span>` : ""}</a>`;
  el.innerHTML = `
    <div class="brand">Inventory</div>
    <div class="ws"><span class="dot"></span> Asset Inventory</div>
    ${link("index.html", "Overview", null, "overview")}
    ${link("laptops.html", "Laptops", laptops, "laptops")}
    ${link("phones.html", "Phones", phones, "phones")}
  `;
}

/* ---------- Home dashboard ---------- */
function renderHome() {
  const items = loadItems();
  const byStatus = s => items.filter(i => i.status === s).length;
  const total = items.length;
  const inUse = byStatus("Assigned");
  const available = byStatus("In Stock");
  const repair = byStatus("Repair");
  const defective = byStatus("Defective");
  const retired = byStatus("Retired");

  const dateEl = document.getElementById("todayDate");
  if (dateEl) dateEl.textContent = new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" }).toUpperCase();

  document.getElementById("cardgrid").innerHTML = `
    <div class="card dark"><div class="card-l">Total assets</div><div class="card-n">${total}</div><div class="card-sub">Laptops and phones</div></div>
    <div class="card"><div class="card-l">In use</div><div class="card-n">${inUse}</div><div class="card-sub">${total ? Math.round(inUse/total*100) : 0}% of inventory</div></div>
    <div class="card"><div class="card-l">Available</div><div class="card-n">${available}</div><div class="card-sub">Ready to assign</div></div>
    <div class="card"><div class="card-l">Needs attention</div><div class="card-n">${defective}</div><div class="card-sub">Defective devices</div></div>
    <div class="card"><div class="card-l">For repair</div><div class="card-n">${repair}</div><div class="card-sub">Currently being repaired</div></div>
    <div class="card"><div class="card-l">Retired</div><div class="card-n">${retired}</div><div class="card-sub">Removed from service</div></div>
  `;

  const segs = [["In use", inUse, "var(--assigned)"], ["Available", available, "var(--stock)"], ["For repair", repair, "var(--repair)"], ["Defective", defective, "var(--defective)"], ["Retired", retired, "var(--retired)"]];
  let acc = 0;
  const gradParts = segs.filter(s => s[1] > 0).map(([, n, color]) => {
    const start = total ? acc / total * 360 : 0;
    acc += n;
    const end = total ? acc / total * 360 : 0;
    return `${color} ${start}deg ${end}deg`;
  });
  document.getElementById("donut").style.background = total ? `conic-gradient(${gradParts.join(",")})` : "var(--bg)";
  document.getElementById("donutTotal").textContent = total;
  document.getElementById("legend").innerHTML = segs.map(([label, n, color]) =>
    `<div><span class="sw" style="background:${color}"></span><span class="lbl">${label}</span><span class="val">${n}</span></div>`).join("");

  const recent = items.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 5);
  document.getElementById("activity").innerHTML = recent.length ? recent.map(it =>
    `<div class="activity-item"><span class="ic">${it.type === "Laptop" ? "💻" : "📱"}</span><span><b>${escapeHtml(it.brand)} ${escapeHtml(it.model)}</b> updated</span><span class="when">${timeAgo(it.updatedAt)}</span></div>`
  ).join("") : `<div class="empty">No activity yet.</div>`;

  renderRecentTable(items, "All");
  document.querySelectorAll(".tabs-pill button").forEach(b => b.onclick = () => {
    document.querySelectorAll(".tabs-pill button").forEach(x => x.classList.remove("active"));
    b.classList.add("active");
    renderRecentTable(items, b.dataset.filter);
  });
  const searchEl = document.getElementById("homeSearch");
  if (searchEl) searchEl.oninput = () => {
    const active = document.querySelector(".tabs-pill button.active")?.dataset.filter || "All";
    renderRecentTable(items, active, searchEl.value.toLowerCase());
  };
}

function renderRecentTable(items, filter, q) {
  q = q || (document.getElementById("homeSearch")?.value.toLowerCase() || "");
  let rows = items.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  if (filter === "In use") rows = rows.filter(i => i.status === "Assigned");
  if (filter === "Available") rows = rows.filter(i => i.status === "In Stock");
  if (q) rows = rows.filter(i => [i.brand, i.model, i.assignee, i.serial].join(" ").toLowerCase().includes(q));
  rows = rows.slice(0, 8);
  const tbody = document.getElementById("recentBody");
  if (!tbody) return;
  tbody.innerHTML = rows.length ? rows.map(it => `
    <tr>
      <td>${it.type === "Laptop" ? "💻" : "📱"} ${escapeHtml(it.brand)} ${escapeHtml(it.model)}</td>
      <td>${it.type}</td>
      <td>${escapeHtml(it.assignee) || "—"}</td>
      <td><span class="badge ${statusClass(it.status)}">${it.status}</span></td>
      <td>${timeAgo(it.updatedAt)}</td>
    </tr>`).join("") : `<tr><td colspan="5" class="empty">No devices yet.</td></tr>`;
}

function timeAgo(ts) {
  if (!ts) return "—";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "Just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / 86400) + "d ago";
}

/* ---------- Inventory list page (laptops.html / phones.html) ---------- */
function initInventoryPage(deviceType) {
  let items = loadItems();
  let editingId = null;
  renderSidebar(deviceType.toLowerCase() + "s");

  function typeItems() { return items.filter(i => i.type === deviceType); }

  function render() {
    const q = document.getElementById("search").value.toLowerCase();
    const fs = document.getElementById("filterStatus").value;
    const filtered = typeItems().filter(it => {
      if (fs && it.status !== fs) return false;
      if (q) {
        const hay = [it.brand, it.model, it.serial, it.assignee, it.notes].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const tbody = document.getElementById("tbody");
    const empty = document.getElementById("empty");
    tbody.innerHTML = "";
    document.getElementById("table").style.display = filtered.length ? "table" : "none";
    empty.style.display = filtered.length ? "none" : "block";
    empty.textContent = typeItems().length ? "No devices match your search." : `No ${deviceType.toLowerCase()}s yet. Add your first one to get started.`;

    filtered.slice().reverse().forEach(it => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(it.brand)} ${escapeHtml(it.model)}</td>
        <td class="mono">${escapeHtml(it.serial) || "—"}</td>
        <td><span class="badge ${statusClass(it.status)}">${it.status}</span></td>
        <td>${escapeHtml(it.assignee) || "—"}</td>
        <td>${escapeHtml(it.date) || "—"}</td>
        <td class="row-actions"><button data-edit="${it.id}">Edit</button><button data-del="${it.id}">Delete</button></td>`;
      tbody.appendChild(tr);
    });
  }

  function openModal(item) {
    editingId = item ? item.id : null;
    document.getElementById("modalTitle").textContent = item ? `Edit ${deviceType.toLowerCase()}` : `Add ${deviceType.toLowerCase()}`;
    document.getElementById("f_brand").value = item?.brand || "";
    document.getElementById("f_model").value = item?.model || "";
    document.getElementById("f_serial").value = item?.serial || "";
    document.getElementById("f_status").value = item?.status || "In Stock";
    document.getElementById("f_assignee").value = item?.assignee || "";
    document.getElementById("f_date").value = item?.date || "";
    document.getElementById("f_notes").value = item?.notes || "";
    document.getElementById("modalBg").classList.add("open");
  }
  function closeModal() { document.getElementById("modalBg").classList.remove("open"); }

  document.getElementById("addBtn").onclick = () => openModal(null);
  document.getElementById("cancelBtn").onclick = closeModal;
  document.getElementById("modalBg").onclick = e => { if (e.target.id === "modalBg") closeModal(); };

  document.getElementById("saveBtn").onclick = () => {
    const brand = document.getElementById("f_brand").value.trim();
    const model = document.getElementById("f_model").value.trim();
    if (!brand && !model) { alert("Enter at least a brand or model."); return; }
    const data = {
      type: deviceType, brand, model,
      serial: document.getElementById("f_serial").value.trim(),
      status: document.getElementById("f_status").value,
      assignee: document.getElementById("f_assignee").value.trim(),
      date: document.getElementById("f_date").value.trim(),
      notes: document.getElementById("f_notes").value.trim(),
      updatedAt: Date.now(),
    };
    if (editingId) {
      const idx = items.findIndex(i => i.id === editingId);
      if (idx > -1) items[idx] = { ...items[idx], ...data };
    } else {
      items.push({ id: uid(), ...data });
    }
    saveItems(items); closeModal(); render();
  };

  document.getElementById("tbody").addEventListener("click", e => {
    const editId = e.target.getAttribute("data-edit");
    const delId = e.target.getAttribute("data-del");
    if (editId) openModal(items.find(i => i.id === editId));
    if (delId) {
      if (confirm("Delete this device?")) {
        items = items.filter(i => i.id !== delId);
        saveItems(items); render();
      }
    }
  });

  ["search", "filterStatus"].forEach(id => document.getElementById(id).addEventListener("input", render));
  render();
}