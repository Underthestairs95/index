(() => {
  const client = window.supabaseClient;
  const status = document.getElementById("status");
  const playersView = document.getElementById("playersView");
  const plannerView = document.getElementById("plannerView");
  const plannerBody = document.getElementById("plannerBody");
  const troopsView = document.getElementById("troopsView");
  const troopBody = document.getElementById("troopBody");
  const tribeTroopSummary = document.getElementById("tribeTroopSummary");
  const tribeSelect = document.getElementById("tribeSelect");

  let availableTribes = [];
  let activeTribeId = null;
  let rawStatuses = [];
  let rawVillages = [];
  let accountMap = {};
  let viewRows = [];
  const troopKeys = [
    "spear","sword","axe","archer","spy","light",
    "marcher","heavy","ram","catapult","knight","snob"
  ];
  const troopLabels = {
    spear:"Speer", sword:"Zwaard", axe:"Bijl", archer:"Boog",
    spy:"Verkenner", light:"LC", marcher:"Bereden boog", heavy:"ZC",
    ram:"Ram", catapult:"Kata", knight:"Ridder", snob:"Edelman"
  };
  const numberFmt = new Intl.NumberFormat("nl-NL");


  const age = iso => {
    const d = Date.now() - new Date(iso).getTime();
    if (d < 60000) return "zojuist";
    if (d < 3600000) return `${Math.floor(d/60000)} min geleden`;
    if (d < 86400000) return `${Math.floor(d/3600000)} uur geleden`;
    return `${Math.floor(d/86400000)} dagen geleden`;
  };

  const fmtDuration = seconds => {
    if (!Number.isFinite(seconds)) return "—";
    if (seconds <= 0) return "klaar";
    const d = Math.floor(seconds/86400);
    const h = Math.floor((seconds%86400)/3600);
    if (d) return `${d}d ${h}u`;
    const m = Math.floor((seconds%3600)/60);
    return `${h}u ${m}m`;
  };

  const section = (title, list) =>
    `=== ${title} ===\n${list.length ? list.map(x=>x.coord).join("\n") : "—"}`;

  const categorize = rows => {
    const full = rows.filter(r => r.total_seconds <= 86400);
    const half = rows.filter(r => r.total_seconds > 86400 && r.half_total_seconds <= 259200);
    const building = rows.filter(r => r.total_seconds > 86400 && r.half_total_seconds > 259200);
    return { full, half, building };
  };

  const exportText = rows => {
    const c = categorize(rows);
    return [
      section("FULL CLEARS < 1 DAG", c.full),
      section("HALVE CLEARS < 3 DAGEN", c.half),
      section("NOG IN AANBOUW", c.building)
    ].join("\n\n");
  };

  async function copyText(text, button) {
    await navigator.clipboard.writeText(text);
    const old = button.textContent;
    button.textContent = "Gekopieerd ✓";
    setTimeout(()=>button.textContent=old,1500);
  }

  async function loadAccessibleTribes() {
    const { data, error } = await client.rpc("get_my_tribes_v2");
    if (error) throw error;
    return (data || []).map(t => ({
      id: t.tribe_id,
      name: t.tribe_name,
      world_code: t.world_code,
      role: t.member_role
    }));
  }

  async function fetchTribeData() {
    const [{data:statuses,error:sErr},{data:villages,error:vErr},{data:accounts,error:aErr}] = await Promise.all([
      client.from("clear_status").select("*").eq("tribe_v2_id",activeTribeId).order("updated_at",{ascending:false}),
      client.from("clear_villages").select("*").eq("tribe_v2_id",activeTribeId),
      client.rpc("get_tribe_accounts_v2", { p_tribe_id: activeTribeId })
    ]);
    if (sErr||vErr||aErr) throw sErr||vErr||aErr;

    rawStatuses = statuses||[];
    rawVillages = villages||[];
    accountMap = {};
    (accounts||[]).forEach(r=>{
      accountMap[r.game_account_id] = { id:r.game_account_id, name:r.game_account_name };
    });

    const villageMap = {};
    rawVillages.forEach(v => (villageMap[v.game_account_id] ??= []).push(v));

    viewRows = rawStatuses.map(s => {
      const villages = villageMap[s.game_account_id] || [];
      const cats = categorize(villages);
      const avg = villages.length ? Math.round(villages.reduce((sum,v)=>sum+v.total_seconds,0)/villages.length) : 0;
      return {
        status:s,
        account:accountMap[s.game_account_id] || {name:"Onbekend account"},
        villages,cats,avg,
        troopTotals:s.troop_totals || {},
        troopSource:s.troop_totals_source || "combined_present",
        troopUpdatedAt:s.troop_totals_updated_at || s.updated_at
      };
    });
  }

  function filteredRows() {
    const q = document.getElementById("searchFilter").value.trim().toLowerCase();
    const cat = document.getElementById("categoryFilter").value;
    const sort = document.getElementById("sortFilter").value;

    let rows = viewRows.filter(r => !q || r.account.name.toLowerCase().includes(q));
    if (cat !== "all") rows = rows.filter(r => r.cats[cat].length > 0);

    rows.sort((a,b)=>{
      if(sort==="full_desc") return b.cats.full.length-a.cats.full.length;
      if(sort==="half_desc") return b.cats.half.length-a.cats.half.length;
      if(sort==="avg_asc") return a.avg-b.avg;
      if(sort==="updated_desc") return new Date(b.status.updated_at)-new Date(a.status.updated_at);
      return a.account.name.localeCompare(b.account.name);
    });
    return rows;
  }

  function selectedVillageList(row) {
    const cat = document.getElementById("categoryFilter").value;
    if (cat==="all") return row.villages;
    return row.cats[cat];
  }

  function renderSummary(rows) {
    const accounts = rows.length;
    const all = rows.flatMap(r=>r.villages);

    const ready = all.filter(v=>v.total_seconds<=1).length;
    const under1 = all.filter(v=>v.total_seconds>1 && v.total_seconds<=86400).length;
    const under2 = all.filter(v=>v.total_seconds>86400 && v.total_seconds<=172800).length;
    const under3 = all.filter(v=>v.total_seconds>172800 && v.total_seconds<=259200).length;
    const under5 = all.filter(v=>v.total_seconds>259200 && v.total_seconds<=432000).length;
    const under7 = all.filter(v=>v.total_seconds>432000 && v.total_seconds<=604800).length;
    const over7 = all.filter(v=>v.total_seconds>604800).length;

    const full = rows.reduce((s,r)=>s+r.cats.full.length,0);
    const half = rows.reduce((s,r)=>s+r.cats.half.length,0);
    const building = rows.reduce((s,r)=>s+r.cats.building.length,0);
    const avg = all.length ? Math.round(all.reduce((s,v)=>s+v.total_seconds,0)/all.length) : NaN;

    document.getElementById("sumAccounts").textContent = accounts;
    document.getElementById("sumReady").textContent = ready;
    document.getElementById("sumUnder1").textContent = under1;
    document.getElementById("sumUnder2").textContent = under2;
    document.getElementById("sumUnder3").textContent = under3;
    document.getElementById("sumUnder5").textContent = under5;
    document.getElementById("sumUnder7").textContent = under7;
    document.getElementById("sumOver7").textContent = over7;
    document.getElementById("sumFull").textContent = full;
    document.getElementById("sumHalf").textContent = half;
    document.getElementById("sumBuilding").textContent = building;
    document.getElementById("sumAverage").textContent = fmtDuration(avg);
  }

  function renderPlayers(rows) {
    playersView.innerHTML = "";
    rows.forEach(r=>{
      const text = exportText(r.villages);
      const card = document.createElement("section");
      card.className = "panel";
      card.innerHTML = `
        <div class="player-head">
          <div>
            <h2>${r.account.name}</h2>
            <div class="muted">${r.villages.length} dorpen · bijgewerkt ${age(r.status.updated_at)}</div>
          </div>
          <div>
            <button class="alt toggle">Bekijk coords</button>
            <button class="copy">Kopieer coords</button>
          </div>
        </div>
        <div class="player-grid">
          <div class="stat"><b>${r.cats.full.length}</b><small>Full &lt; 1 dag</small></div>
          <div class="stat"><b>${r.cats.half.length}</b><small>Halve &lt; 3 dagen</small></div>
          <div class="stat"><b>${r.cats.building.length}</b><small>Nog in aanbouw</small></div>
          <div class="stat"><b>${fmtDuration(r.avg)}</b><small>Gemiddelde bouwtijd</small></div>
        </div>
        <div class="coords"></div>`;
      const box = card.querySelector(".coords");
      box.textContent = text;
      card.querySelector(".toggle").onclick = e=>{
        const open = box.style.display==="block";
        box.style.display=open?"none":"block";
        e.currentTarget.textContent=open?"Bekijk coords":"Verberg coords";
      };
      card.querySelector(".copy").onclick = e=>copyText(text,e.currentTarget);
      playersView.appendChild(card);
    });

    if(!rows.length) playersView.innerHTML='<div class="status">Geen resultaten voor dit filter.</div>';
  }

  function renderPlanner(rows) {
    plannerBody.innerHTML = rows.map(r=>{
      const ready = r.villages.filter(v=>v.total_seconds<=1).length;
      const h12 = r.villages.filter(v=>v.total_seconds>1 && v.total_seconds<=43200).length;
      const d1 = r.villages.filter(v=>v.total_seconds>43200 && v.total_seconds<=86400).length;
      const d2 = r.villages.filter(v=>v.total_seconds>86400 && v.total_seconds<=172800).length;
      const d3 = r.villages.filter(v=>v.total_seconds>172800 && v.total_seconds<=259200).length;
      const d5 = r.villages.filter(v=>v.total_seconds>259200 && v.total_seconds<=432000).length;
      const d7 = r.villages.filter(v=>v.total_seconds>432000 && v.total_seconds<=604800).length;
      const over7 = r.villages.filter(v=>v.total_seconds>604800).length;

      return `<tr>
        <td><strong>${r.account.name}</strong></td>
        <td><span class="badge good">${ready}</span></td>
        <td>${h12}</td>
        <td>${d1}</td>
        <td>${d2}</td>
        <td>${d3}</td>
        <td>${d5}</td>
        <td>${d7}</td>
        <td>${over7 ? `<span class="badge bad">${over7}</span>` : 0}</td>
        <td>${fmtDuration(r.avg)}</td>
      </tr>`;
    }).join("");

    if(!rows.length) plannerBody.innerHTML='<tr><td colspan="10">Geen resultaten.</td></tr>';
  }

  function troopSourceMeta(row) {
    const exact = row.troopSource === "owned_overview";
    const exportedAt = row.troopUpdatedAt ? new Date(row.troopUpdatedAt) : null;
    const hoursOld = exportedAt ? (Date.now() - exportedAt.getTime()) / 3600000 : Infinity;
    const stale = exact && hoursOld > 24;

    return {
      exact,
      stale,
      label: exact
        ? `${stale ? "Exact, verouderd" : "Exact"} · ${age(row.troopUpdatedAt)}`
        : `Aanwezig/fallback · ${age(row.troopUpdatedAt)}`
    };
  }

  function aggregateTroops(rows) {
    const totals = Object.fromEntries(troopKeys.map(key => [key, 0]));
    rows.forEach(row => {
      troopKeys.forEach(key => {
        totals[key] += Number(row.troopTotals?.[key] || 0);
      });
    });
    return totals;
  }

  function renderTroops(rows) {
    const tribeTotals = aggregateTroops(rows);
    const exactCount = rows.filter(row => row.troopSource === "owned_overview").length;
    const estimatedCount = rows.length - exactCount;

    document.getElementById("exactTroopCount").textContent =
      `${exactCount} exacte upload${exactCount === 1 ? "" : "s"}`;
    document.getElementById("estimatedTroopCount").textContent =
      `${estimatedCount} fallback${estimatedCount === 1 ? "" : "s"}`;

    tribeTroopSummary.innerHTML = troopKeys.map(key => `
      <div class="stat">
        <b>${numberFmt.format(tribeTotals[key])}</b>
        <small>${troopLabels[key]}</small>
      </div>
    `).join("");

    troopBody.innerHTML = rows.map(row => {
      const source = troopSourceMeta(row);
      const sourceClass = source.stale ? "stale" : source.exact ? "exact" : "estimate";

      return `
        <tr>
          <td><strong>${row.account.name}</strong></td>
          <td><span class="troop-source ${sourceClass}">${source.label}</span></td>
          ${troopKeys.map(key => `<td>${numberFmt.format(Number(row.troopTotals?.[key] || 0))}</td>`).join("")}
        </tr>
      `;
    }).join("");

    if (!rows.length) {
      troopBody.innerHTML = '<tr><td colspan="14">Geen resultaten.</td></tr>';
    }
  }

  function buildTroopText(rows) {
    const tribeTotals = aggregateTroops(rows);
    const lines = ["=== STAM TROEPENTOTALEN ==="];
    troopKeys.forEach(key => {
      lines.push(`${troopLabels[key]}: ${numberFmt.format(tribeTotals[key])}`);
    });

    lines.push("");
    rows.forEach(row => {
      const source = troopSourceMeta(row);
      lines.push(`=== ${row.account.name} ===`);
      lines.push(`Bron: ${source.label}`);
      troopKeys.forEach(key => {
        lines.push(`${troopLabels[key]}: ${numberFmt.format(Number(row.troopTotals?.[key] || 0))}`);
      });
      lines.push("");
    });

    return lines.join("\n").trim();
  }

  function renderAll() {
    const rows = filteredRows();
    renderSummary(rows);
    renderPlayers(rows);
    renderPlanner(rows);
    renderTroops(rows);
  }

  async function renderTribe() {
    const tribe = availableTribes.find(t=>t.id===activeTribeId);
    document.getElementById("tribeName").textContent = `${tribe.world_code} · ${tribe.name}`;
    await fetchTribeData();
    status.textContent = `${viewRows.length} TW-accounts met een upload.`;
    renderAll();
  }

  async function load() {
    const {data:auth} = await client.auth.getUser();
    if(!auth?.user){ location.href="index.html"; return; }

    availableTribes = await loadAccessibleTribes();
    if(!availableTribes.length){ status.textContent="Je hebt nog geen toegang tot een stam."; return; }

    activeTribeId = localStorage.getItem("tw_active_tribe");
    if(!availableTribes.some(t=>t.id===activeTribeId)) activeTribeId=availableTribes[0].id;

    tribeSelect.innerHTML=availableTribes.map(t=>`<option value="${t.id}">${t.world_code} · ${t.name}</option>`).join("");
    tribeSelect.value=activeTribeId;
    tribeSelect.onchange=async e=>{
      activeTribeId=e.target.value;
      localStorage.setItem("tw_active_tribe",activeTribeId);
      await renderTribe();
    };

    ["searchFilter","categoryFilter","sortFilter"].forEach(id=>{
      document.getElementById(id).addEventListener(id==="searchFilter"?"input":"change",renderAll);
    });

    document.getElementById("copyFiltered").onclick = async e=>{
      const rows = filteredRows();
      const coords = rows.flatMap(selectedVillageList);
      const title = document.getElementById("categoryFilter").selectedOptions[0].textContent.toUpperCase();
      const text = section(title,coords);
      await copyText(text,e.currentTarget);
    };

    function activateTab(tab) {
      const buttons = {
        players:document.getElementById("tabPlayers"),
        planner:document.getElementById("tabPlanner"),
        troops:document.getElementById("tabTroops")
      };
      Object.entries(buttons).forEach(([key,button]) => {
        button.classList.toggle("active", key===tab);
        button.classList.toggle("alt", key!==tab);
      });

      playersView.classList.toggle("hidden", tab!=="players");
      plannerView.classList.toggle("hidden", tab!=="planner");
      troopsView.classList.toggle("hidden", tab!=="troops");
    }

    document.getElementById("tabPlayers").onclick=()=>activateTab("players");
    document.getElementById("tabPlanner").onclick=()=>activateTab("planner");
    document.getElementById("tabTroops").onclick=()=>activateTab("troops");

    document.getElementById("copyTroopTotals").onclick=async event=>{
      await copyText(buildTroopText(filteredRows()),event.currentTarget);
    };

    await renderTribe();
  }

  document.getElementById("logout").onclick=async()=>{
    await client.auth.signOut();
    location.href="index.html";
  };

  load().catch(err=>{
    console.error(err);
    status.className="status error";
    status.textContent=`Laden mislukt: ${err.message}`;
  });
})();