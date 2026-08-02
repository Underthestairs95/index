(() => {
  const projectUrl = "https://wozdvncbghqrafxhpcjy.supabase.co";
  const publishableKey =
    "sb_publishable_0xnm_ZnN4OUMby7hSHOrNA_gI0xlKdR";

  if (!window.supabase) {
    console.error("❌ Supabase-library is niet geladen.");
    return;
  }

  window.supabaseClient = window.supabase.createClient(
    projectUrl,
    publishableKey
  );

  console.log("✅ Verbonden met Supabase!");
})();
