(() => {
  const client = window.supabaseClient;
  const status = document.getElementById("status");
  const players = document.getElementById("players");
  const tribeSelect = document.getElementById("tribeSelect");

  let availableTribes = [];
  let activeTribeId = null;

  const age = iso => {
    const d = Date.now() - new Date(iso).getTime();
    if (d < 60000) return "zojuist";
    if (d < 3600000) return `${Math.floor(d / 60000)} min geleden`;
    if (d < 86400000) return `${Math.floor(d / 3600000)} uur geleden`;
    return `${Math.floor(d / 86400000)} dagen geleden`;
  };

  const section = (title, list) =>
    `=== ${title} ===\n${list.length ? list.map(x => x.coord).join("\n") : "—"}`;

  function exportText(rows) {
    const full = rows.filter(r => r.total_seconds <= 86400);
    const half = rows.filter(r => r.total_seconds > 86400 && r.half_total_seconds <= 259200);
    return [
      section("FULL CLEARS < 1 DAG", full),
      section("HALVE CLEARS < 3 DAGEN", half)
    ].join("\n\n");
  }

  async function copy(text, button) {
    await navigator.clipboard.writeText(text);
    const old = button.textContent;
    button.textContent = "Gekopieerd ✓";
    setTimeout(() => button.textContent = old, 1500);
  }

  async function loadAccessibleTribes(userId) {
    const { data: memberships, error } = await client
      .from("game_account_members")
      .select("game_account_id")
      .eq("user_id", userId);
    if (error) throw error;

    const accountIds = (memberships || []).map(x => x.game_account_id);
    if (!accountIds.length) return [];

    const { data, error: tribeError } = await client
      .from("tribe_accounts")
      .select("tribes_v2(id,name,world_code),game_account_id")
      .in("game_account_id", accountIds);
    if (tribeError) throw tribeError;

    const unique = new Map();
    (data || []).forEach(row => {
      if (row.tribes_v2) unique.set(row.tribes_v2.id, row.tribes_v2);
    });
    return [...unique.values()].sort((a, b) =>
      `${a.world_code} ${a.name}`.localeCompare(`${b.world_code} ${b.name}`)
    );
  }

  async function renderTribe() {
    if (!activeTribeId) {
      status.textContent = "Geen stam geselecteerd.";
      players.innerHTML = "";
      return;
    }

    const tribe = availableTribes.find(t => t.id === activeTribeId);
    document.getElementById("tribeName").textContent = `${tribe.world_code} · ${tribe.name}`;

    const [{ data: statuses, error: statusError }, { data: villages, error: villageError }, { data: accounts, error: accountError }] =
      await Promise.all([
        client.from("clear_status").select("*").eq("tribe_v2_id", activeTribeId).order("updated_at", { ascending: false }),
        client.from("clear_villages").select("*").eq("tribe_v2_id", activeTribeId),
        client.from("tribe_accounts").select("game_account_id,game_accounts(id,name)").eq("tribe_id", activeTribeId)
      ]);

    if (statusError || villageError || accountError) throw statusError || villageError || accountError;

    const accountMap = {};
    (accounts || []).forEach(row => {
      if (row.game_accounts) accountMap[row.game_account_id] = row.game_accounts;
    });

    const villageMap = {};
    (villages || []).forEach(v => (villageMap[v.game_account_id] ??= []).push(v));

    status.textContent = (statuses || []).length
      ? `${statuses.length} TW-accounts met een upload.`
      : "Nog geen uploads.";

    players.innerHTML = "";

    (statuses || []).forEach(s => {
      const account = accountMap[s.game_account_id] || { name: "Onbekend account" };
      const rows = villageMap[s.game_account_id] || [];
      const text = exportText(rows);
      const full = rows.filter(r => r.total_seconds <= 86400).length;
      const half = rows.filter(r => r.total_seconds > 86400 && r.half_total_seconds <= 259200).length;

      const card = document.createElement("section");
      card.className = "panel";
      card.innerHTML = `
        <div class="head">
          <div>
            <h2 style="margin:0">${account.name}</h2>
            <div class="muted">${rows.length} dorpen · ${age(s.updated_at)}</div>
          </div>
          <div>
            <button class="alt toggle">Bekijk coords</button>
            <button class="copy">Kopieer coords</button>
          </div>
        </div>
        <div class="stats">
          <div class="stat"><b>${full}</b><small>Full &lt; 1 dag</small></div>
          <div class="stat"><b>${half}</b><small>Halve &lt; 3 dagen</small></div>
          <div class="stat"><b>${s.ready}</b><small>Nu klaar</small></div>
          <div class="stat"><b>${s.total_offs}</b><small>Totaal offs</small></div>
        </div>
        <div class="coords"></div>
      `;

      const box = card.querySelector(".coords");
      box.textContent = text;
      card.querySelector(".toggle").onclick = event => {
        const open = box.style.display === "block";
        box.style.display = open ? "none" : "block";
        event.currentTarget.textContent = open ? "Bekijk coords" : "Verberg coords";
      };
      card.querySelector(".copy").onclick = event => copy(text, event.currentTarget);
      players.appendChild(card);
    });
  }

  async function load() {
    const { data: auth } = await client.auth.getUser();
    if (!auth?.user) {
      location.href = "index.html";
      return;
    }

    availableTribes = await loadAccessibleTribes(auth.user.id);
    if (!availableTribes.length) {
      status.textContent = "Je hebt nog geen toegang tot een stam.";
      return;
    }

    activeTribeId = localStorage.getItem("tw_active_tribe");
    if (!availableTribes.some(t => t.id === activeTribeId)) {
      activeTribeId = availableTribes[0].id;
    }

    if (!tribeSelect) throw new Error("Stamkeuzelijst ontbreekt in stam.html.");
    tribeSelect.innerHTML = availableTribes
      .map(t => `<option value="${t.id}">${t.world_code} · ${t.name}</option>`)
      .join("");
    tribeSelect.value = activeTribeId;
    tribeSelect.onchange = async event => {
      activeTribeId = event.target.value;
      localStorage.setItem("tw_active_tribe", activeTribeId);
      await renderTribe();
    };

    await renderTribe();
  }

  document.getElementById("logout").onclick = async () => {
    await client.auth.signOut();
    location.href = "index.html";
  };

  load().catch(error => {
    console.error(error);
    status.className = "status error";
    status.textContent = `Laden mislukt: ${error.message}`;
  });
})();
