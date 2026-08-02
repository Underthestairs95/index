(() => {
  const client = window.supabaseClient;
  const WORLD = 116;
  let activeUser = null;
  let activeProfile = null;
  let activeTribe = null;

  const el = id => document.getElementById(id);

  function setMessage(target, text, error = false) {
    const box = el(target);
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
    el("tribeView").classList.toggle("hidden", view !== "tribe");
    el("appView").classList.toggle("hidden", view !== "app");
  }

  async function profileFor(user) {
    const { data, error } = await client
      .from("profiles")
      .select("id, player_name, role, tribe_id")
      .eq("id", user.id)
      .single();

    if (error) throw error;
    return data;
  }

  async function tribeFor(profile) {
    if (!profile?.tribe_id) return null;
    const { data, error } = await client
      .from("tribes")
      .select("id, name, join_code")
      .eq("id", profile.tribe_id)
      .single();

    if (error) throw error;
    return data;
  }

  async function refreshAuth() {
    const { data, error } = await client.auth.getUser();

    if (error || !data?.user) {
      activeUser = null;
      activeProfile = null;
      activeTribe = null;
      showOnly("login");
      return;
    }

    activeUser = data.user;
    activeProfile = await profileFor(activeUser);
    activeTribe = await tribeFor(activeProfile);

    if (!activeProfile.tribe_id) {
      showOnly("tribe");
      return;
    }

    el("currentPlayer").textContent = activeProfile.player_name || activeUser.email || "Stamlid";
    el("currentTribe").textContent = activeTribe?.name || "Stamgroep";
    el("currentTribeCode").textContent = activeTribe?.join_code ? `(${activeTribe.join_code})` : "";
    showOnly("app");
  }

  async function login() {
    const email = el("loginEmail").value.trim();
    const password = el("loginPassword").value;

    if (!email || !password) {
      setMessage("loginMessage", "Vul e-mailadres en wachtwoord in.", true);
      return;
    }

    el("loginButton").disabled = true;
    setMessage("loginMessage", "Bezig met inloggen…");

    const { error } = await client.auth.signInWithPassword({ email, password });
    el("loginButton").disabled = false;

    if (error) {
      setMessage("loginMessage", "Inloggen mislukt. Controleer je gegevens.", true);
      return;
    }

    await refreshAuth();
  }

  async function register() {
    const playerName = el("registerPlayer").value.trim();
    const email = el("registerEmail").value.trim();
    const password = el("registerPassword").value;
    const password2 = el("registerPassword2").value;

    if (playerName.length < 2) {
      setMessage("loginMessage", "Vul een geldige spelersnaam in.", true);
      return;
    }
    if (!email) {
      setMessage("loginMessage", "Vul een geldig e-mailadres in.", true);
      return;
    }
    if (password.length < 8) {
      setMessage("loginMessage", "Gebruik een wachtwoord van minimaal 8 tekens.", true);
      return;
    }
    if (password !== password2) {
      setMessage("loginMessage", "De twee wachtwoorden zijn niet gelijk.", true);
      return;
    }

    el("registerButton").disabled = true;
    setMessage("loginMessage", "Account wordt aangemaakt…");

    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: { player_name: playerName }
      }
    });

    el("registerButton").disabled = false;

    if (error) {
      setMessage("loginMessage", `Registreren mislukt: ${error.message}`, true);
      return;
    }

    if (data?.session) {
      await refreshAuth();
    } else {
      setAuthTab("login");
      el("loginEmail").value = email;
      setMessage("loginMessage", "✅ Account aangemaakt. Bevestig eventueel eerst de e-mail en log daarna in.");
    }
  }

  function cleanCode(value) {
    return value.trim().toUpperCase();
  }

  async function createTribe() {
    const name = el("createTribeName").value.trim();
    const code = cleanCode(el("createTribeCode").value);

    if (name.length < 2) {
      setMessage("tribeMessage", "Vul een geldige groepsnaam in.", true);
      return;
    }
    if (!/^[A-Z0-9-]{4,24}$/.test(code)) {
      setMessage("tribeMessage", "De code moet 4–24 tekens bevatten: letters, cijfers of een streepje.", true);
      return;
    }

    el("createTribeButton").disabled = true;
    setMessage("tribeMessage", "Groep wordt aangemaakt…");

    const { data, error } = await client.rpc("create_tribe", {
      p_name: name,
      p_join_code: code
    });

    el("createTribeButton").disabled = false;

    if (error) {
      const msg = error.message?.includes("duplicate") || error.message?.includes("bestaat")
        ? "Deze koppelcode bestaat al. Kies een andere code."
        : error.message;
      setMessage("tribeMessage", `Aanmaken mislukt: ${msg}`, true);
      return;
    }

    setMessage("tribeMessage", `✅ Groep gemaakt met code ${code}.`);
    await refreshAuth();
  }

  async function joinTribe() {
    const code = cleanCode(el("joinTribeCode").value);

    if (!/^[A-Z0-9-]{4,24}$/.test(code)) {
      setMessage("tribeMessage", "Vul een geldige koppelcode in.", true);
      return;
    }

    el("joinTribeButton").disabled = true;
    setMessage("tribeMessage", "Bezig met koppelen…");

    const { data, error } = await client.rpc("join_tribe", {
      p_join_code: code
    });

    el("joinTribeButton").disabled = false;

    if (error) {
      setMessage("tribeMessage", `Koppelen mislukt: ${error.message}`, true);
      return;
    }

    setMessage("tribeMessage", "✅ Je bent aan de stamgroep gekoppeld.");
    await refreshAuth();
  }

  async function logout() {
    await client.auth.signOut();
    activeUser = null;
    activeProfile = null;
    activeTribe = null;
    showOnly("login");
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

    if (!activeUser || !activeProfile?.tribe_id) {
      state.textContent = "Je bent niet aan een stamgroep gekoppeld.";
      return;
    }
    if (typeof latestRows === "undefined" || !latestRows.length) {
      state.textContent = "Bereken eerst je dorpen.";
      return;
    }

    const rows = latestRows.filter(r => Number.isFinite(r.total) && Number.isFinite(r.halfTotal));
    if (!rows.length) {
      state.textContent = "Geen geldige off-dorpen gevonden.";
      return;
    }

    button.disabled = true;
    state.textContent = `Bezig met ${rows.length} dorpen uploaden…`;

    try {
      const now = new Date().toISOString();
      const base = {
        user_id: activeUser.id,
        tribe_id: activeProfile.tribe_id,
        world: WORLD
      };

      const { error: statusError } = await client
        .from("clear_status")
        .upsert({
          ...base,
          ...summary(rows),
          updated_at: now
        }, { onConflict: "user_id,world" });

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
        .upsert(records, { onConflict: "user_id,world,coord" });

      if (uploadError) throw uploadError;

      const currentCoords = new Set(records.map(r => r.coord));
      const { data: oldRows, error: oldError } = await client
        .from("clear_villages")
        .select("id,coord")
        .eq("user_id", activeUser.id)
        .eq("world", WORLD);

      if (oldError) throw oldError;

      const staleIds = (oldRows || [])
        .filter(r => !currentCoords.has(r.coord))
        .map(r => r.id);

      if (staleIds.length) {
        const { error: deleteError } = await client
          .from("clear_villages")
          .delete()
          .in("id", staleIds);

        if (deleteError) throw deleteError;
      }

      state.textContent = `✅ ${rows.length} dorpen geüpload als ${activeProfile.player_name}.`;
    } catch (error) {
      console.error(error);
      state.textContent = `Upload mislukt: ${error.message || "onbekende fout"}`;
    } finally {
      button.disabled = false;
    }
  }

  el("showLoginTab").addEventListener("click", () => setAuthTab("login"));
  el("showRegisterTab").addEventListener("click", () => setAuthTab("register"));
  el("loginButton").addEventListener("click", login);
  el("registerButton").addEventListener("click", register);
  el("loginPassword").addEventListener("keydown", e => { if (e.key === "Enter") login(); });
  el("registerPassword2").addEventListener("keydown", e => { if (e.key === "Enter") register(); });
  el("createTribeButton").addEventListener("click", createTribe);
  el("joinTribeButton").addEventListener("click", joinTribe);
  el("logoutButton").addEventListener("click", logout);
  el("tribeLogoutButton").addEventListener("click", logout);
  el("uploadToTribe").addEventListener("click", upload);

  client.auth.onAuthStateChange(() => {
    setTimeout(() => refreshAuth().catch(console.error), 0);
  });

  refreshAuth().catch(error => {
    console.error(error);
    setMessage("loginMessage", "Kon je sessie niet laden.", true);
  });
})();
