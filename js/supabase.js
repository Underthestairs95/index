const SUPABASE_URL = "https://wozdvncbghqrafxhpcjy.supabase.co";

const SUPABASE_KEY = "sb_publishable_0xnm_ZnN4OUMby7hSHOrNA_gI0xlKdR";

const supabaseClient = supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);

window.supabaseClient = supabaseClient;

console.log("✅ Verbonden met Supabase!");
