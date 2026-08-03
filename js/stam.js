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
  const playerDetail = document.getElementById("playerDetail");
  const playerDetailName = document.getElementById("playerDetailName");
  const playerDetailMeta = document.getElementById("playerDetailMeta");
  const playerDetailStats = document.getElementById("playerDetailStats");
  const playerDetailTroops = document.getElementById("playerDetailTroops");
  const playerDetailVillages = document.getElementById("playerDetailVillages");

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

  function renderCommandCenter(rows) {
    const tribe = availableTribes.find(t => t.id === activeTribeId);
    const allVillages = rows.flatMap(row => row.villages);
    const full = rows.reduce((sum,row)=>sum+row.cats.full.length,0);
    const nobles = rows.reduce((sum,row)=>sum+Number(row.troopTotals?.snob || 0),0);

    const now = Date.now();
    const recentRows = rows.filter(row =>
      now - new Date(row.status.updated_at).getTime() <= 86400000
    );
    const latest = [...rows].sort((a,b) =>
      new Date(b.status.updated_at) - new Date(a.status.updated_at)
    )[0];

    document.getElementById("commandTribeName").textContent =
      tribe?.name || "Stam";
    document.getElementById("commandWorld").textContent =
      tribe?.world_code || "Wereld";
    document.getElementById("commandLatest").textContent =
      `Laatste upload: ${latest ? age(latest.status.updated_at) : "—"}`;
    document.getElementById("commandFull").textContent = numberFmt.format(full);
    document.getElementById("commandNobles").textContent = numberFmt.format(nobles);
    document.getElementById("commandRecent").textContent = recentRows.length;
    document.getElementById("commandActive").textContent =
      `${rows.length ? Math.round(recentRows.length / rows.length * 100) : 0}%`;

    const dayBuckets = Array.from({length:7}, (_,index) => {
      const lower = index * 86400;
      const upper = (index + 1) * 86400;

      return allVillages.filter(village =>
        village.total_seconds > lower &&
        village.total_seconds <= upper
      ).length;
    });

    document.getElementById("commandPlanner").innerHTML = `
      <div class="command-day-grid">
        ${dayBuckets.map((value,index)=>`
          <div class="command-day-card ${value ? "has-value" : ""}">
            <strong>${numberFmt.format(value)}</strong>
            <span>Dag ${index + 1}</span>
            <small>${index === 0 ? "binnen 24 uur" : `${index}–${index + 1} dagen`}</small>
          </div>
        `).join("")}
      </div>
    `;

    document.getElementById("commandActivity").innerHTML =
      [...rows]
        .sort((a,b)=>new Date(b.status.updated_at)-new Date(a.status.updated_at))
        .slice(0,4)
        .map(row=>`
          <div class="command-mini-row">
            <span>${row.account.name}</span>
            <small>${age(row.status.updated_at)}</small>
          </div>
        `).join("") || '<div class="muted">Nog geen uploads.</div>';
  }

  function openPlayerDetail(row) {
    playerDetailName.textContent = row.account.name;
    playerDetailMeta.textContent =
      `${row.villages.length} dorpen · bijgewerkt ${age(row.status.updated_at)} · gemiddeld ${fmtDuration(row.avg)}`;

    playerDetailStats.innerHTML = `
      <div class="detail-kpi"><b>${row.cats.full.length}</b><small>Full &lt; 1 dag</small></div>
      <div class="detail-kpi"><b>${row.cats.half.length}</b><small>Halve &lt; 3 dagen</small></div>
      <div class="detail-kpi"><b>${row.cats.building.length}</b><small>Nog in aanbouw</small></div>
    `;

    const troopOrder = ["spear","sword","axe","spy","light","heavy","ram","catapult","knight","snob"];
    playerDetailTroops.innerHTML = troopOrder.map(key=>`
      <div class="detail-troop">
        <b>${numberFmt.format(Number(row.troopTotals?.[key] || 0))}</b>
        <small>${troopLabels[key]}</small>
      </div>
    `).join("");

    playerDetailVillages.innerHTML = [...row.villages]
      .sort((a,b)=>a.total_seconds-b.total_seconds)
      .map(village=>{
        const state = village.total_seconds <= 1
          ? "Klaar"
          : village.total_seconds <= 86400
            ? `Full in ${fmtDuration(village.total_seconds)}`
            : village.half_total_seconds <= 259200
              ? `Halve in ${fmtDuration(village.half_total_seconds)}`
              : fmtDuration(village.total_seconds);
        return `
          <div class="detail-village">
            <span><strong>${village.village_name || village.coord}</strong><br><small>${village.coord}</small></span>
            <strong>${state}</strong>
          </div>
        `;
      }).join("") || '<div class="muted">Geen dorpen gevonden.</div>';

    playerDetail.classList.remove("hidden");
    playerDetail.scrollIntoView({behavior:"smooth",block:"start"});
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
      const total = Math.max(1,r.villages.length);
      const fullPct = r.cats.full.length / total * 100;
      const halfPct = r.cats.half.length / total * 100;
      const buildPct = Math.max(0,100-fullPct-halfPct);

      const card = document.createElement("section");
      card.className = "panel player-card";
      card.innerHTML = `
        <div class="player-head">
          <div>
            <h2 class="player-name">${r.account.name}</h2>
            <div class="player-sub">
              <span>🏘 ${r.villages.length} dorpen</span>
              <span>⏳ ${fmtDuration(r.avg)} gemiddeld</span>
              <span>↻ ${age(r.status.updated_at)}</span>
            </div>
          </div>
          <div class="player-card-actions">
            <button class="alt details">Spelerinfo</button>
            <button class="alt toggle">Bekijk coords</button>
            <button class="copy">Kopieer coords</button>
          </div>
        </div>

        <div class="player-progress-wrap">
          <div class="player-progress-head">
            <span>Clearvoortgang</span>
            <strong>${Math.round((r.cats.full.length+r.cats.half.length)/total*100)}%</strong>
          </div>
          <div class="player-progress">
            <span class="done" style="width:${fullPct}%"></span>
            <span class="near" style="width:${halfPct}%"></span>
            <span class="build" style="width:${buildPct}%"></span>
          </div>
        </div>

        <div class="player-status-row">
          <div class="player-status clickable status-full">
            <span><i class="status-dot good"></i><small>Klaar / full</small></span><b>${r.cats.full.length}</b>
          </div>
          <div class="player-status clickable status-half">
            <span><i class="status-dot warn"></i><small>Bijna klaar</small></span><b>${r.cats.half.length}</b>
          </div>
          <div class="player-status clickable status-building">
            <span><i class="status-dot bad"></i><small>Nog bouwen</small></span><b>${r.cats.building.length}</b>
          </div>
          <div class="player-status">
            <span><small>Gemiddeld</small></span><b>${fmtDuration(r.avg)}</b>
          </div>
        </div>

        <div class="coords"></div>`;

      const box = card.querySelector(".coords");
      box.textContent = text;

      card.querySelector(".details").onclick = e=>{
        e.stopPropagation();
        openPlayerDetail(r);
      };
      card.querySelector(".toggle").onclick = e=>{
        e.stopPropagation();
        const open = box.style.display==="block";
        box.style.display=open?"none":"block";
        e.currentTarget.textContent=open?"Bekijk coords":"Verberg coords";
      };
      card.querySelector(".copy").onclick = e=>{
        e.stopPropagation();
        copyText(text,e.currentTarget);
      };

      const setCategory = category => {
        document.getElementById("categoryFilter").value = category;
        renderAll();
      };
      card.querySelector(".status-full").onclick = e=>{e.stopPropagation();setCategory("full");};
      card.querySelector(".status-half").onclick = e=>{e.stopPropagation();setCategory("half");};
      card.querySelector(".status-building").onclick = e=>{e.stopPropagation();setCategory("building");};
      card.onclick = ()=>openPlayerDetail(r);

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
    renderCommandCenter(rows);
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

    const closePlayerDetail = document.getElementById("playerDetailClose");
    if (closePlayerDetail) {
      closePlayerDetail.onclick = event => {
        event.preventDefault();
        event.stopPropagation();
        playerDetail.classList.add("hidden");
      };
    }

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