(() => {
  const client = window.supabaseClient;
  const WORLD = 116;
  const status = document.getElementById("status");
  const players = document.getElementById("players");

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

  async function load() {
    const { data: auth } = await client.auth.getUser();
    if (!auth?.user) {
      location.href = "index.html";
      return;
    }

    const { data: ownProfile, error: ownError } = await client
      .from("profiles")
      .select("id,player_name,tribe_id")
      .eq("id", auth.user.id)
      .single();

    if (ownError) throw ownError;
    if (!ownProfile.tribe_id) {
      location.href = "index.html";
      return;
    }

    const { data: tribe, error: tribeError } = await client
      .from("tribes")
      .select("id,name,join_code")
      .eq("id", ownProfile.tribe_id)
      .single();

    if (tribeError) throw tribeError;
    document.getElementById("tribeName").textContent = `${tribe.name} · code ${tribe.join_code}`;

    const [p, s, v] = await Promise.all([
      client.from("profiles").select("id,player_name,tribe_id").eq("tribe_id", ownProfile.tribe_id),
      client.from("clear_status").select("*").eq("tribe_id", ownProfile.tribe_id).eq("world", WORLD).order("updated_at", { ascending: false }),
      client.from("clear_villages").select("*").eq("tribe_id", ownProfile.tribe_id).eq("world", WORLD)
    ]);

    if (p.error || s.error || v.error) throw p.error || s.error || v.error;

    const profileMap = Object.fromEntries((p.data || []).map(x => [x.id, x]));
    const villageMap = {};
    (v.data || []).forEach(x => (villageMap[x.user_id] ??= []).push(x));

    status.textContent = (s.data || []).length
      ? `${s.data.length} spelers met een upload.`
      : "Nog geen uploads.";

    players.innerHTML = "";

    (s.data || []).forEach(x => {
      const profile = profileMap[x.user_id] || { player_name: "Onbekend" };
      const rows = villageMap[x.user_id] || [];
      const text = exportText(rows);
      const full = rows.filter(r => r.total_seconds <= 86400).length;
      const half = rows.filter(r => r.total_seconds > 86400 && r.half_total_seconds <= 259200).length;

      const card = document.createElement("section");
      card.className = "panel";
      card.innerHTML = `
        <div class="head">
          <div>
            <h2 style="margin:0">${profile.player_name}</h2>
            <div class="muted">${rows.length} dorpen · ${age(x.updated_at)}</div>
          </div>
          <div>
            <button class="alt toggle">Bekijk coords</button>
            <button class="copy">Kopieer coords</button>
          </div>
        </div>
        <div class="stats">
          <div class="stat"><b>${full}</b><small>Full &lt; 1 dag</small></div>
          <div class="stat"><b>${half}</b><small>Halve &lt; 3 dagen</small></div>
          <div class="stat"><b>${x.ready}</b><small>Nu klaar</small></div>
          <div class="stat"><b>${x.total_offs}</b><small>Totaal offs</small></div>
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
