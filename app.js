vfunction uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function escapeHtml(s) {
  if (!s) return "";
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function statusClass(s) {
  return "st-" + String(s || "").toLowerCase().replace(/\s+/g, "-");
}

/* ---------- Data layer (Supabase) ---------- */
async function fetchItems() {
  const { data, error } = await supabaseClient.from("devices").select("*");
  if (error) { console.error("Fetch failed", error); return []; }
  return (data || []).map(row => ({
    id: row.id,
    type: row.type,
    assetName: row.asset_name || [row.brand, row.model].filter(Boolean).join(" "),
    assetTag: row.asset_tag,
    holder: row.holder,
    previousHolders: row.previous_holders,
    serial: row.serial,
    dateGiven: row.date_given,
    dateReturned: row.date_returned,
    status: row.status,
    stock: row.stock,
    defective: row.defective,
    forRepair: row.for_repair,
    updatedAt: row.updated_at
  }));
}

async function upsertItem(item) {
  const row = {
    id: item.id,
    type: item.type,
    asset_name: item.assetName,
    asset_tag: item.assetTag,
    holder: item.holder,
    previous_holders: item.previousHolders,
    serial: item.serial,
    date_given: item.dateGiven,
    date_returned: item.dateReturned,
    status: item.status,
    stock: item.stock,
    defective: item.defective,
    for_repair: item.forRepair,
    updated_at: item.updatedAt
  };
  const { error } = await supabaseClient.from("devices").upsert(row);
  if (error) { console.error("Save failed", error); alert("Could not save. Check your Supabase config."); }
}

async function deleteItemRemote(id) {
  const { error } = await supabaseClient.from("devices").delete().eq("id", id);
  if (error) { console.error("Delete failed", error); alert("Could not delete. Check your Supabase config."); }
}

/* ---------- Realtime: keeps every open tab/browser in sync, no refresh needed ---------- */
function subscribeRealtime(onChange) {
  supabaseClient
    .channel("devices-changes-" + Math.random().toString(36).slice(2))
    .on("postgres_changes", { event: "*", schema: "public", table: "devices" }, () => onChange())
    .subscribe();
}

/* ---------- Sidebar ---------- */
async function renderSidebar(active) {
  const items = await fetchItems();
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
async function renderHome() {
  const items = await fetchItems();
  const byStatus = s => items.filter(i => i.status === s).length;
  const total = items.length;
  const inUse = byStatus("Assigned");
  const available = byStatus("Available");
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
    `<div class="activity-item"><span class="ic">${it.type === "Laptop" ? "💻" : "📱"}</span><span><b>${escapeHtml(it.assetName)}</b> updated</span><span class="when">${timeAgo(it.updatedAt)}</span></div>`
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

  subscribeRealtime(() => renderHome());
}

function renderRecentTable(items, filter, q) {
  q = q || (document.getElementById("homeSearch")?.value.toLowerCase() || "");
  let rows = items.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  if (filter === "In use") rows = rows.filter(i => i.status === "Assigned");
  if (filter === "Available") rows = rows.filter(i => i.status === "Available");
  if (q) rows = rows.filter(i => [i.assetName, i.holder, i.serial, i.assetTag].join(" ").toLowerCase().includes(q));
  rows = rows.slice(0, 8);
  const tbody = document.getElementById("recentBody");
  if (!tbody) return;
  tbody.innerHTML = rows.length ? rows.map(it => `
    <tr>
      <td>${it.type === "Laptop" ? "💻" : "📱"} ${escapeHtml(it.assetName)}</td>
      <td>${it.type}</td>
      <td>${escapeHtml(it.holder) || "—"}</td>
      <td><span class="badge ${statusClass(it.status)}">${it.status || "—"}</span></td>
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
async function initInventoryPage(deviceType) {
  let items = [];
  let editingId = null;
  await renderSidebar(deviceType.toLowerCase() + "s");

  function typeItems() { return items.filter(i => i.type === deviceType); }

  function render() {
    const q = document.getElementById("search").value.toLowerCase();
    const fs = document.getElementById("filterStatus").value;
    const filtered = typeItems().filter(it => {
      if (fs && it.status !== fs) return false;
      if (q) {
        const hay = [it.assetName, it.assetTag, it.holder, it.previousHolders, it.serial].join(" ").toLowerCase();
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

    filtered.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).forEach(it => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(it.assetName) || "—"}</td>
        <td>${it.type}</td>
        <td class="mono">${escapeHtml(it.assetTag) || "—"}</td>
        <td>${escapeHtml(it.holder) || "—"}</td>
        <td class="mono">${escapeHtml(it.serial) || "—"}</td>
        <td>${escapeHtml(it.previousHolders) || "—"}</td>
        <td>${escapeHtml(it.dateGiven) || "—"}</td>
        <td>${escapeHtml(it.dateReturned) || "—"}</td>
        <td><span class="badge ${statusClass(it.status)}">${it.status || "—"}</span></td>
        <td><span class="badge ${statusClass(it.stock)}">${it.stock || "—"}</span></td>
        <td><span class="badge ${statusClass(it.defective)}">${it.defective || "—"}</span></td>
        <td><span class="badge ${statusClass(it.forRepair)}">${it.forRepair || "—"}</span></td>
        <td class="row-actions"><button data-edit="${it.id}">Edit</button><button data-del="${it.id}">Delete</button></td>`;
      tbody.appendChild(tr);
    });
  }

  async function reload() {
    items = await fetchItems();
    render();
  }

  function openModal(item) {
    editingId = item ? item.id : null;
    document.getElementById("modalTitle").textContent = item ? `Edit ${deviceType.toLowerCase()}` : `Add ${deviceType.toLowerCase()}`;
    document.getElementById("f_assetName").value = item?.assetName || "";
    document.getElementById("f_type").value = deviceType;
    document.getElementById("f_assetTag").value = item?.assetTag || "";
    document.getElementById("f_holder").value = item?.holder || "";
    document.getElementById("f_previousHolders").value = item?.previousHolders || "";
    document.getElementById("f_serial").value = item?.serial || "";
    document.getElementById("f_dateGiven").value = item?.dateGiven || "";
    document.getElementById("f_dateReturned").value = item?.dateReturned || "";
    document.getElementById("f_status").value = item?.status || "Available";
    document.getElementById("f_stock").value = item?.stock || "In stock";
    document.getElementById("f_defective").value = item?.defective || "No";
    document.getElementById("f_forRepair").value = item?.forRepair || "No";
    document.getElementById("modalBg").classList.add("open");
  }
  function closeModal() { document.getElementById("modalBg").classList.remove("open"); }

  document.getElementById("addBtn").onclick = () => openModal(null);
  document.getElementById("cancelBtn").onclick = closeModal;
  document.getElementById("modalBg").onclick = e => { if (e.target.id === "modalBg") closeModal(); };

  document.getElementById("saveBtn").onclick = async () => {
    const assetName = document.getElementById("f_assetName").value.trim();
    if (!assetName) { alert("Enter an asset name."); return; }
    const data = {
      type: deviceType,
      assetName,
      assetTag: document.getElementById("f_assetTag").value.trim(),
      holder: document.getElementById("f_holder").value.trim(),
      previousHolders: document.getElementById("f_previousHolders").value.trim(),
      serial: document.getElementById("f_serial").value.trim(),
      dateGiven: document.getElementById("f_dateGiven").value,
      dateReturned: document.getElementById("f_dateReturned").value,
      status: document.getElementById("f_status").value,
      stock: document.getElementById("f_stock").value,
      defective: document.getElementById("f_defective").value,
      forRepair: document.getElementById("f_forRepair").value,
      updatedAt: Date.now(),
    };
    const saved = { id: editingId || uid(), ...data };
    document.getElementById("saveBtn").disabled = true;
    await upsertItem(saved);
    document.getElementById("saveBtn").disabled = false;
    closeModal();
    await reload();
  };

  document.getElementById("tbody").addEventListener("click", async e => {
    const editId = e.target.getAttribute("data-edit");
    const delId = e.target.getAttribute("data-del");
    if (editId) openModal(items.find(i => i.id === editId));
    if (delId) {
      if (confirm("Delete this device?")) {
        items = items.filter(i => i.id !== delId); // instant UI update, no refresh
        render();
        await deleteItemRemote(delId); // sync to database
      }
    }
  });

  ["search", "filterStatus"].forEach(id => document.getElementById(id).addEventListener("input", render));

  await reload();
  subscribeRealtime(reload); // live-updates from other users/tabs, no refresh needed
}