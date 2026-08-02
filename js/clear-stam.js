(() => {
  const client = window.supabaseClient;
  const WORLD = 116;
  let activeUser = null;
  let activeProfile = null;
  const el = id => document.getElementById(id);

  function message(text, error=false){
    el('loginMessage').textContent=text;
    el('loginMessage').className=error?'status error':'status';
  }
  function showLogin(){el('loginView').classList.remove('hidden');el('appView').classList.add('hidden');}
  function showApp(){el('loginView').classList.add('hidden');el('appView').classList.remove('hidden');el('currentPlayer').textContent=activeProfile?.player_name||activeUser?.email||'Stamlid';}

  async function profileFor(user){
    const {data,error}=await client.from('profiles').select('id,player_name,role').eq('id',user.id).single();
    if(error) throw error;
    return data;
  }
  async function refreshAuth(){
    const {data,error}=await client.auth.getUser();
    if(error||!data?.user){activeUser=null;activeProfile=null;showLogin();return;}
    activeUser=data.user;activeProfile=await profileFor(activeUser);showApp();
  }
  async function login(){
    const email=el('loginEmail').value.trim(), password=el('loginPassword').value;
    if(!email||!password){message('Vul e-mailadres en wachtwoord in.',true);return;}
    el('loginButton').disabled=true;message('Bezig met inloggen…');
    const {error}=await client.auth.signInWithPassword({email,password});
    el('loginButton').disabled=false;
    if(error){message('Inloggen mislukt. Controleer je gegevens.',true);return;}
    await refreshAuth();
  }
  async function logout(){await client.auth.signOut();showLogin();}

  function summary(rows){
    return {
      total_offs:rows.length,
      ready:rows.filter(r=>r.total<=1).length,
      under_12h:rows.filter(r=>r.total>1&&r.total<=43200).length,
      under_1d:rows.filter(r=>r.total>43200&&r.total<=86400).length,
      under_2d:rows.filter(r=>r.total>86400&&r.total<=172800).length,
      under_3d:rows.filter(r=>r.total>172800&&r.total<=259200).length,
      under_5d:rows.filter(r=>r.total>259200&&r.total<=432000).length,
      under_7d:rows.filter(r=>r.total>432000&&r.total<=604800).length,
      over_7d:rows.filter(r=>r.total>604800).length,
      average_seconds:rows.length?Math.round(rows.reduce((a,r)=>a+r.total,0)/rows.length):0,
      barracks_bottleneck:rows.filter(r=>r.bottleneck==='axe').length,
      stable_bottleneck:rows.filter(r=>r.bottleneck==='light').length,
      garage_bottleneck:rows.filter(r=>r.bottleneck==='ram').length
    };
  }

  async function upload(){
    const state=el('uploadState'), button=el('uploadToTribe');
    if(!activeUser){state.textContent='Je bent niet ingelogd.';return;}
    if(typeof latestRows==='undefined'||!latestRows.length){state.textContent='Bereken eerst je dorpen.';return;}
    const rows=latestRows.filter(r=>Number.isFinite(r.total)&&Number.isFinite(r.halfTotal));
    if(!rows.length){state.textContent='Geen geldige off-dorpen gevonden.';return;}
    button.disabled=true;state.textContent=`Bezig met ${rows.length} dorpen uploaden…`;
    try{
      const now=new Date().toISOString();
      const {error:sError}=await client.from('clear_status').upsert({user_id:activeUser.id,world:WORLD,...summary(rows),updated_at:now},{onConflict:'user_id,world'});
      if(sError) throw sError;
      const records=rows.map(r=>({user_id:activeUser.id,world:WORLD,village_name:r.name||r.coord,coord:r.coord,total_seconds:Math.round(r.total),half_total_seconds:Math.round(r.halfTotal),bottleneck:r.bottleneck,ready_at:new Date(Date.now()+r.total*1000).toISOString(),updated_at:now}));
      const {error:uError}=await client.from('clear_villages').upsert(records,{onConflict:'user_id,world,coord'});
      if(uError) throw uError;
      const coords=new Set(records.map(r=>r.coord));
      const {data:old,error:oError}=await client.from('clear_villages').select('id,coord').eq('user_id',activeUser.id).eq('world',WORLD);
      if(oError) throw oError;
      const stale=(old||[]).filter(r=>!coords.has(r.coord)).map(r=>r.id);
      if(stale.length){const {error:dError}=await client.from('clear_villages').delete().in('id',stale);if(dError) throw dError;}
      state.textContent=`✅ ${rows.length} dorpen geüpload als ${activeProfile.player_name}.`;
    }catch(err){console.error(err);state.textContent=`Upload mislukt: ${err.message||'onbekende fout'}`;}
    finally{button.disabled=false;}
  }

  el('loginButton').addEventListener('click',login);
  el('loginPassword').addEventListener('keydown',e=>{if(e.key==='Enter')login();});
  el('logoutButton').addEventListener('click',logout);
  el('uploadToTribe').addEventListener('click',upload);
  client.auth.onAuthStateChange(()=>setTimeout(()=>refreshAuth().catch(console.error),0));
  refreshAuth().catch(err=>{console.error(err);message('Kon je sessie niet laden.',true);});
})();
