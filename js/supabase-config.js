(() => {
  const projectUrl = "https://wozdvncbghqrafxhpcjy.supabase.co";
  const publishableKey = "sb_publishable_0xnm_ZnN4OUMby7hSHOrNA_gI0xlKdR";
  if (!window.supabase) throw new Error("Supabase-library ontbreekt.");
  window.supabaseClient = window.supabase.createClient(projectUrl, publishableKey);
  console.log("✅ Verbonden met Supabase!");
})();
