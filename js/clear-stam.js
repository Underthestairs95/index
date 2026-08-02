(() => {
  const client = window.supabaseClient;
  const DEFAULT_WORLD = "NL116";

  let activeUser = null;
  let activeProfile = null;
  let gameAccounts = [];
  let activeGameAccountId = null;
  let tribes = [];
  let activeTribeId = null;

  const el = id => document.getElementById(id);

  function setMessage(id, text, error = false) {
    const box = el(id);
    if (!box) return;
    box.textContent = text;
    box.className = error ? "status error" : "status";
  }

  function setAuthTab(tab) {
    const login = tab === "login";
    el("loginForm").classList.toggle("hidden", !login);
    el("registerForm").classList.toggle("hidden", login);
    el("showLoginTab").classList.toggle("active", login);
    el("showRegisterTab").classList.toggle("active", !login);
    setMessage("loginMessage", login ? "Log in met je account." : "Maak je eigen account aan.");
  }

  function showOnly(view) {
    el("loginView").classList.toggle("hidden", view !== "login");
    el("setupView").classList.toggle("hidden", view !== "setup");
    el("appView").classList.toggle("hidden", view !== "app");
  }

  async function loadProfile() {
    const { data, error } = await client
      .from("profiles")
      .select("id,player_name,role")
      .eq("id", activeUser.id)
      .single();
    if (error) throw error;
    activeProfile = data;
  }

  async function loadGameAccounts() {
    const { data, error } = await client
      .from("game_account_members")
      .select("role, game_accounts(id,name,owner_user_id,created_at)")
      .eq("user_id", activeUser.id);
    if (error) throw error;

    gameAccounts = (data || [])
      .map(row => ({
        ...row.game_accounts,
        member_role: row.role
      }))
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));

    if (!activeGameAccountId || !gameAccounts.some(a => a.id === activeGameAccountId)) {
      activeGameAccountId = localStorage.getItem("tw_active_game_account");
      if (!gameAccounts.some(a => a.id === activeGameAccountId)) {
        activeGameAccountId = gameAccounts[0]?.id || null;
      }
    }
  }

  async function loadTribes() {
    if (!activeGameAccountId) {
      tribes = [];
      activeTribeId = null;
      return;
    }

    const { data, error } = await client
      .from("tribe_accounts")
      .select("role, tribes(id,name,world_code,owner_user_id,created_at)")
      .eq("game_account_id", activeGameAccountId);
    if (error) throw error;

    tribes = (data || [])
      .map(row => ({
        ...row.tribes,
        account_role: row.role
      }))
      .filter(Boolean)
      .sort((a, b) => `${a.world_code} ${a.name}`.localeCompare(`${b.world_code} ${b.name}`));

    activeTribeId = localStorage.getItem("tw_active_tribe");
    if (!tribes.some(t => t.id === activeTribeId)) {
      activeTribeId = tribes[0]?.id || null;
    }
  }

  function renderAccountSelectors() {
    const select = el("activeGameAccountSelect");
    select.innerHTML = gameAccounts.length
      ? gameAccounts.map(a => `<option value="${a.id}">${a.name}</option>`).join("")
      : '<option value="">Geen account</option>';
    select.value = activeGameAccountId || "";

    const tribeSelect = el("activeTribeSelect");
    tribeSelect.innerHTML = tribes.length
      ? tribes.map(t => `<option value="${t.id}">${t.world_code} · ${t.name}</option>`).join("")
      : '<option value="">Geen stam</option>';
    tribeSelect.value = activeTribeId || "";
  }

  function renderSetupAccounts() {
    el("setupUser").textContent = activeProfile?.player_name || activeUser?.email || "Gebruiker";
    const list = el("myGameAccounts");

    if (!gameAccounts.length) {
      list.innerHTML = '<div class="muted">Je beheert nog geen TW-account.</div>';
      el("worldTribeSection").classList.add("hidden");
      return;
    }

    list.innerHTML = gameAccounts.map(a => `
      <div class="setup-item">
        <div>
          <strong>${a.name}</strong>
          <div class="meta">${a.member_role === "owner" ? "Eigenaar" : "Medebeheerder"}</div>
        </div>
        <button class="alt choose-account" data-id="${a.id}" type="button">${a.id === activeGameAccountId ? "Actief" : "Kiezen"}</button>
      </div>
    `).join("");

    list.querySelectorAll(".choose-account").forEach(button => {
      button.onclick = async () => {
        activeGameAccountId = button.dataset.id;
        localStorage.setItem("tw_active_game_account", activeGameAccountId);
        await loadTribes();
        renderSetupAccounts();
        renderSetupTribes();
        renderAccountSelectors();
      };
    });

    el("worldTribeSection").classList.remove("hidden");
    el("setupActiveGameAccount").textContent =
      gameAccounts.find(a => a.id === activeGameAccountId)?.name || "—";
  }

  function renderSetupTribes() {
    const list = el("myTribes");
    if (!tribes.length) {
      list.innerHTML = '<div class="muted">Dit TW-account is nog niet aan een stam gekoppeld.</div>';
      return;
    }

    list.innerHTML = tribes.map(t => `
      <div class="setup-item">
        <div>
          <strong>${t.name}</strong>
          <div class="meta">${t.world_code} · ${t.account_role === "owner" ? "Stameigenaar" : "Lid"}</div>
        </div>
        <button class="alt choose-tribe" data-id="${t.id}" type="button">${t.id === activeTribeId ? "Actief" : "Kiezen"}</button>
      </div>
    `).join("");

    list.querySelectorAll(".choose-tribe").forEach(button => {
      button.onclick = () => {
        activeTribeId = button.dataset.id;
        localStorage.setItem("tw_active_tribe", activeTribeId);
        renderSetupTribes();
        renderAccountSelectors();
      };
    });
  }

  async function renderRequests() {
    const target = el("pendingRequests");
    target.innerHTML = '<div class="muted">Verzoeken laden…</div>';

    const [{ data: gaIncoming, error: gaIncomingError }, { data: gaMine, error: gaMineError },
           { data: tribeIncoming, error: tribeIncomingError }, { data: tribeMine, error: tribeMineError }] =
      await Promise.all([
        client.rpc("get_incoming_game_account_requests"),
        client.rpc("get_my_game_account_requests"),
        client.rpc("get_incoming_tribe_requests"),
        client.rpc("get_my_tribe_requests")
      ]);

    const err = gaIncomingError || gaMineError || tribeIncomingError || tribeMineError;
    if (err) {
      target.innerHTML = `<div class="muted">Verzoeken konden niet worden geladen: ${err.message}</div>`;
      return;
    }

    const items = [];

    (gaIncoming || []).forEach(r => items.push(`
      <div class="setup-item">
        <div>
          <strong>${r.requester_name}</strong> wil toegang tot <strong>${r.game_account_name}</strong>
          <div class="meta">TW-accountverzoek</div>
        </div>
        <div>
          <button class="approve-ga" data-id="${r.request_id}" type="button">Goedkeuren</button>
          <button class="alt reject-ga" data-id="${r.request_id}" type="button">Afwijzen</button>
        </div>
      </div>
    `));

    (tribeIncoming || []).forEach(r => items.push(`
      <div class="setup-item">
        <div>
          <strong>${r.game_account_name}</strong> wil bij <strong>${r.tribe_name}</strong> op ${r.world_code}
          <div class="meta">Stamverzoek</div>
        </div>
        <div>
          <button class="approve-tribe" data-id="${r.request_id}" type="button">Goedkeuren</button>
          <button class="alt reject-tribe" data-id="${r.request_id}" type="button">Afwijzen</button>
        </div>
      </div>
    `));

    (gaMine || []).forEach(r => items.push(`
      <div class="setup-item">
        <div>
          Toegang tot <strong>${r.game_account_name}</strong>
          <div class="meta">Status: ${r.status}</div>
        </div>
        <span class="badge ${r.status === "pending" ? "pending" : ""}">${r.status}</span>
      </div>
    `));

    (tribeMine || []).forEach(r => items.push(`
      <div class="setup-item">
        <div>
          <strong>${r.game_account_name}</strong> → ${r.world_code} · <strong>${r.tribe_name}</strong>
          <div class="meta">Status: ${r.status}</div>
        </div>
        <span class="badge ${r.status === "pending" ? "pending" : ""}">${r.status}</span>
      </div>
    `));

    target.innerHTML = items.length ? items.join("") : '<div class="muted">Geen openstaande verzoeken.</div>';

    target.querySelectorAll(".approve-ga,.reject-ga").forEach(button => {
      button.onclick = async () => {
        const approve = button.classList.contains("approve-ga");
        const { error } = await client.rpc("decide_game_account_request", {
          p_request_id: Number(button.dataset.id),
          p_approve: approve
        });
        if (error) return setMessage("accountSetupMessage", error.message, true);
        await refreshData();
      };
    });

    target.querySelectorAll(".approve-tribe,.reject-tribe").forEach(button => {
      button.onclick = async () => {
        const approve = button.classList.contains("approve-tribe");
        const { error } = await client.rpc("decide_tribe_request", {
          p_request_id: Number(button.dataset.id),
          p_approve: approve
        });
        if (error) return setMessage("tribeSetupMessage", error.message, true);
        await refreshData();
      };
    });
  }

  async function refreshData() {
    await loadGameAccounts();
    await loadTribes();
    renderSetupAccounts();
    renderSetupTribes();
    renderAccountSelectors();
    await renderRequests();
  }

  async function refreshAuth() {
    const { data, error } = await client.auth.getUser();
    if (error || !data?.user) {
      activeUser = null;
      activeProfile = null;
      showOnly("login");
      return;
    }

    activeUser = data.user;
    await loadProfile();
    await refreshData();

    el("currentPlayer").textContent = activeProfile.player_name || activeUser.email || "Gebruiker";

    if (!gameAccounts.length) {
      showOnly("setup");
    } else {
      showOnly("app");
    }
  }

  async function login() {
    const email = el("loginEmail").value.trim();
    const password = el("loginPassword").value;
    if (!email || !password) return setMessage("loginMessage", "Vul e-mailadres en wachtwoord in.", true);

    const button = el("loginButton");
    button.disabled = true;
    setMessage("loginMessage", "Bezig met inloggen…");

    const { error } = await client.auth.signInWithPassword({ email, password });
    button.disabled = false;

    if (error) return setMessage("loginMessage", "Inloggen mislukt. Controleer je gegevens.", true);
    await refreshAuth();
  }

  async function register() {
    const playerName = el("registerPlayer").value.trim();
    const email = el("registerEmail").value.trim();
    const password = el("registerPassword").value;
    const password2 = el("registerPassword2").value;

    if (playerName.length < 2) return setMessage("loginMessage", "Vul een geldige naam in.", true);
    if (!email) return setMessage("loginMessage", "Vul een geldig e-mailadres in.", true);
    if (password.length < 8) return setMessage("loginMessage", "Gebruik minimaal 8 tekens.", true);
    if (password !== password2) return setMessage("loginMessage", "De wachtwoorden zijn niet gelijk.", true);

    const button = el("registerButton");
    button.disabled = true;
    setMessage("loginMessage", "Account wordt aangemaakt…");

    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: { data: { player_name: playerName } }
    });

    button.disabled = false;

    if (error) return setMessage("loginMessage", `Registreren mislukt: ${error.message}`, true);

    if (data?.session) {
      await refreshAuth();
    } else {
      setAuthTab("login");
      el("loginEmail").value = email;
      setMessage("loginMessage", "✅ Account aangemaakt. Bevestig eventueel eerst je e-mail.");
    }
  }

  async function logout() {
    await client.auth.signOut();
    showOnly("login");
  }

  async function createGameAccount() {
    const name = el("createGameAccountName").value.trim();
    if (name.length < 2) return setMessage("accountSetupMessage", "Vul een geldige TW-accountnaam in.", true);

    const { error } = await client.rpc("create_game_account", { p_name: name });
    if (error) return setMessage("accountSetupMessage", error.message, true);

    el("createGameAccountName").value = "";
    setMessage("accountSetupMessage", "✅ TW-account aangemaakt.");
    await refreshData();
  }

  async function requestGameAccount() {
    const name = el("requestGameAccountName").value.trim();
    if (name.length < 2) return setMessage("accountSetupMessage", "Vul de exacte accountnaam in.", true);

    const { error } = await client.rpc("request_game_account_access", { p_account_name: name });
    if (error) return setMessage("accountSetupMessage", error.message, true);

    el("requestGameAccountName").value = "";
    setMessage("accountSetupMessage", "✅ Verzoek verstuurd naar de eigenaar.");
    await renderRequests();
  }

  async function createTribe() {
    if (!activeGameAccountId) return setMessage("tribeSetupMessage", "Kies eerst een TW-account.", true);

    const world = el("createTribeWorld").value.trim().toUpperCase();
    const name = el("createTribeName").value.trim();
    if (!world || name.length < 2) return setMessage("tribeSetupMessage", "Vul wereld en stamnaam in.", true);

    const { error } = await client.rpc("create_tribe_for_account", {
      p_game_account_id: activeGameAccountId,
      p_world_code: world,
      p_name: name
    });
    if (error) return setMessage("tribeSetupMessage", error.message, true);

    el("createTribeName").value = "";
    setMessage("tribeSetupMessage", "✅ Stam aangemaakt en account gekoppeld.");
    await refreshData();
  }

  async function requestTribe() {
    if (!activeGameAccountId) return setMessage("tribeSetupMessage", "Kies eerst een TW-account.", true);

    const world = el("requestTribeWorld").value.trim().toUpperCase();
    const name = el("requestTribeName").value.trim();
    if (!world || name.length < 2) return setMessage("tribeSetupMessage", "Vul wereld en exacte stamnaam in.", true);

    const { error } = await client.rpc("request_tribe_join", {
      p_game_account_id: activeGameAccountId,
      p_world_code: world,
      p_tribe_name: name
    });
    if (error) return setMessage("tribeSetupMessage", error.message, true);

    el("requestTribeName").value = "";
    setMessage("tribeSetupMessage", "✅ Stamverzoek verstuurd naar de eigenaar.");
    await renderRequests();
  }

  function summary(rows) {
    return {
      total_offs: rows.length,
      ready: rows.filter(r => r.total <= 1).length,
      under_12h: rows.filter(r => r.total > 1 && r.total <= 43200).length,
      under_1d: rows.filter(r => r.total > 43200 && r.total <= 86400).length,
      under_2d: rows.filter(r => r.total > 86400 && r.total <= 172800).length,
      under_3d: rows.filter(r => r.total > 172800 && r.total <= 259200).length,
      under_5d: rows.filter(r => r.total > 259200 && r.total <= 432000).length,
      under_7d: rows.filter(r => r.total > 432000 && r.total <= 604800).length,
      over_7d: rows.filter(r => r.total > 604800).length,
      average_seconds: rows.length ? Math.round(rows.reduce((a, r) => a + r.total, 0) / rows.length) : 0,
      barracks_bottleneck: rows.filter(r => r.bottleneck === "axe").length,
      stable_bottleneck: rows.filter(r => r.bottleneck === "light").length,
      garage_bottleneck: rows.filter(r => r.bottleneck === "ram").length
    };
  }

  async function upload() {
    const state = el("uploadState");
    const button = el("uploadToTribe");

    if (!activeGameAccountId) return state.textContent = "Kies eerst een TW-account.";
    if (!activeTribeId) return state.textContent = "Kies eerst een stam.";
    if (typeof latestRows === "undefined" || !latestRows.length) return state.textContent = "Bereken eerst je dorpen.";

    const rows = latestRows.filter(r => Number.isFinite(r.total) && Number.isFinite(r.halfTotal));
    if (!rows.length) return state.textContent = "Geen geldige off-dorpen gevonden.";

    button.disabled = true;
    state.textContent = `Bezig met ${rows.length} dorpen uploaden…`;

    try {
      const now = new Date().toISOString();
      const worldCode = tribes.find(t => t.id === activeTribeId)?.world_code || DEFAULT_WORLD;
      const base = {
        user_id: activeUser.id,
        game_account_id: activeGameAccountId,
        tribe_id: activeTribeId,
        world_code: worldCode
      };

      const { error: statusError } = await client
        .from("clear_status")
        .upsert({
          ...base,
          ...summary(rows),
          updated_at: now
        }, { onConflict: "game_account_id,tribe_id,world_code" });
      if (statusError) throw statusError;

      const records = rows.map(r => ({
        ...base,
        village_name: r.name || r.coord,
        coord: r.coord,
        total_seconds: Math.round(r.total),
        half_total_seconds: Math.round(r.halfTotal),
        bottleneck: r.bottleneck,
        ready_at: new Date(Date.now() + r.total * 1000).toISOString(),
        updated_at: now
      }));

      const { error: uploadError } = await client
        .from("clear_villages")
        .upsert(records, { onConflict: "game_account_id,tribe_id,world_code,coord" });
      if (uploadError) throw uploadError;

      const currentCoords = new Set(records.map(r => r.coord));
      const { data: oldRows, error: oldError } = await client
        .from("clear_villages")
        .select("id,coord")
        .eq("game_account_id", activeGameAccountId)
        .eq("tribe_id", activeTribeId)
        .eq("world_code", worldCode);
      if (oldError) throw oldError;

      const staleIds = (oldRows || []).filter(r => !currentCoords.has(r.coord)).map(r => r.id);
      if (staleIds.length) {
        const { error: deleteError } = await client.from("clear_villages").delete().in("id", staleIds);
        if (deleteError) throw deleteError;
      }

      state.textContent = `✅ ${rows.length} dorpen geüpload.`;
    } catch (error) {
      console.error(error);
      state.textContent = `Upload mislukt: ${error.message || "onbekende fout"}`;
    } finally {
      button.disabled = false;
    }
  }

  el("showLoginTab").onclick = () => setAuthTab("login");
  el("showRegisterTab").onclick = () => setAuthTab("register");
  el("loginButton").onclick = login;
  el("registerButton").onclick = register;
  el("loginPassword").onkeydown = e => { if (e.key === "Enter") login(); };
  el("registerPassword2").onkeydown = e => { if (e.key === "Enter") register(); };

  el("setupLogoutButton").onclick = logout;
  el("logoutButton").onclick = logout;
  el("openSetupButton").onclick = () => {
    renderSetupAccounts();
    renderSetupTribes();
    renderRequests();
    showOnly("setup");
  };
  el("continueToCalculator").onclick = () => {
    renderAccountSelectors();
    showOnly("app");
  };

  el("createGameAccountButton").onclick = createGameAccount;
  el("requestGameAccountButton").onclick = requestGameAccount;
  el("createTribeButton").onclick = createTribe;
  el("requestTribeButton").onclick = requestTribe;
  el("uploadToTribe").onclick = upload;

  el("activeGameAccountSelect").onchange = async event => {
    activeGameAccountId = event.target.value || null;
    localStorage.setItem("tw_active_game_account", activeGameAccountId || "");
    await loadTribes();
    renderAccountSelectors();
  };

  el("activeTribeSelect").onchange = event => {
    activeTribeId = event.target.value || null;
    localStorage.setItem("tw_active_tribe", activeTribeId || "");
  };

  client.auth.onAuthStateChange(() => setTimeout(() => refreshAuth().catch(console.error), 0));
  refreshAuth().catch(error => {
    console.error(error);
    setMessage("loginMessage", "Kon je sessie niet laden.", true);
  });
})();
