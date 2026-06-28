// ── FIREBASE BACKEND ─────────────────────────────────────────────────────────
// Firebase config is loaded from firebase-config.js (gitignored, your real keys).
// If that file is missing, these placeholders are used — copy
// firebase-config.example.js to firebase-config.js and fill in your project.
const firebaseConfig = window.firebaseConfig || {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
if(!firebase.apps.length)firebase.initializeApp(firebaseConfig);
const auth=firebase.auth();
const fdb=firebase.firestore();

// In-memory cache of Firestore, kept live by onSnapshot listeners (see startListeners).
// The whole UI reads from this synchronously via DB.get / DB.obj — so render code
// stays unchanged. All writes go through the async helpers below.
const store={users:[],jobs:[],requests:[],messages:[],checkins:[],ratings:[],reports:[],balances:{},escrows:{}};

const DB={
  get(k){return store[k]||[];},
  obj(k){return store[k]||{};}
};
// Write helpers — every mutation persists to Firestore; the live listeners then
// update `store` and re-render the current view.
async function saveDoc(coll,obj){return fdb.collection(coll).doc(obj.id).set(obj);}
async function delDoc(coll,id){return fdb.collection(coll).doc(id).delete();}
async function setMeta(name,data){return fdb.collection('meta').doc(name).set(data);}
async function loadProfile(email){
  const s=await fdb.collection('users').where('email','==',email).limit(1).get();
  return s.empty?null:{id:s.docs[0].id,...s.docs[0].data()};
}
function authMsg(e){
  const m={
    'auth/invalid-email':'That email address looks invalid.',
    'auth/user-not-found':'No account found with that email.',
    'auth/wrong-password':'Incorrect password.',
    'auth/invalid-credential':'Incorrect email or password.',
    'auth/invalid-login-credentials':'Incorrect email or password.',
    'auth/email-already-in-use':'That email is already registered.',
    'auth/weak-password':'Password must be at least 6 characters.',
    'auth/too-many-requests':'Too many attempts. Please try again in a bit.',
    'auth/network-request-failed':'Network error — check your connection.',
    'auth/configuration-not-found':'Firebase isn\'t configured yet. Enable Email/Password sign-in and paste your config (see FIREBASE_SETUP.md).'
  };
  return m[e&&e.code]||(e&&e.message)||'Something went wrong.';
}
const uid=()=>Math.random().toString(36).slice(2,10);
const now=()=>new Date().toISOString();
const fmt=iso=>new Date(iso).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
const TYPES={yard:'🌿 Yard Work',tech:'💻 Tech Help',tutoring:'📚 Tutoring',pet:'🐾 Pet Care',grocery:'🛒 Grocery'};
const S_LABEL={open:'Open',requested:'Requested',booked:'Booked','in-progress':'In Progress',done:'Done',cancelled:'Cancelled'};
const S_COLOR={open:'badge-green',requested:'badge-amber',booked:'badge-blue','in-progress':'badge-blue',done:'badge-gray',cancelled:'badge-red'};

// ── LIVE SYNC ────────────────────────────────────────────────────────────────
// Subscribe to every collection so `store` mirrors Firestore in real time.
let unsubs=[];
function startListeners(){
  if(unsubs.length)return;
  ['users','jobs','requests','messages','checkins','ratings','reports'].forEach(c=>{
    unsubs.push(fdb.collection(c).onSnapshot(snap=>{
      store[c]=snap.docs.map(d=>({id:d.id,...d.data()}));
      if(c==='users'&&CU){const me=store.users.find(u=>u.id===CU.id);if(me)CU=me;} // keep CU fresh
      refresh();
    },err=>console.error('listen '+c,err)));
  });
  ['balances','escrows'].forEach(name=>{
    unsubs.push(fdb.collection('meta').doc(name).onSnapshot(d=>{
      store[name]=d.exists?d.data():{};refresh();
    },err=>console.error('listen '+name,err)));
  });
}
function stopListeners(){
  unsubs.forEach(u=>{try{u();}catch{}});unsubs=[];
  for(const k in store)store[k]=Array.isArray(store[k])?[]:{};
}
// Re-render the current list/dashboard view when cached data changes.
// (Form/detail views are intentionally skipped so we never wipe in-progress input.)
function refresh(){
  const r={jobs:renderJobs,'my-jobs':renderMyJobs,'my-posts':renderMyPosts,messages:renderMsgList,guardian:renderGuardian,admin:renderAdmin,profile:renderProfile,leaderboard:renderLeaderboard}[CV];
  if(r){try{r();}catch(e){}}
}

// ── DEMO ACCOUNTS ────────────────────────────────────────────────────────────
// The landing-page "Try a demo" buttons provision REAL Firebase accounts on first
// use (and seed a little sample content), so people can explore each role against
// the real backend. Remove these + the buttons before a strict public launch.
const DEMO={
  teen:{email:'teen.demo@goodturn.app',pw:'demo1234'},
  guardian:{email:'parent.demo@goodturn.app',pw:'demo1234'},
  poster:{email:'neighbor.demo@goodturn.app',pw:'demo1234'},
  admin:{email:'admin.demo@goodturn.app',pw:'demo1234'},
};
const SEED_VERSION=3; // bump to force the rich demo data to (re)seed
async function ensureDemoData(){
  // Loggable demo accounts (have real auth) + a cast of extra profiles (no login)
  // that populate the boards, ratings, and leaderboard. Profiles are upserted each
  // time; the heavier content is seeded once per SEED_VERSION.
  const profiles=[
    {id:'demo-admin',role:'admin',name:'Demo Admin',email:DEMO.admin.email,verified:true,photo:'DA',rating:5,ratingCount:0,suspended:false,guardianId:null,bio:'GoodTurn community admin (demo).'},
    {id:'demo-poster',role:'poster',name:'Jamie Neighbor',email:DEMO.poster.email,verified:true,photo:'JN',rating:4.8,ratingCount:24,suspended:false,guardianId:null,bio:'Friendly neighbor who posts small jobs around the block (demo).'},
    {id:'demo-guardian',role:'guardian',name:'Sam Parent',email:DEMO.guardian.email,verified:true,photo:'SP',rating:5,ratingCount:0,suspended:false,guardianId:null,teenIds:['demo-teen','nv-jordan','nv-sophie'],maxDistance:5,allowedTypes:['yard','tech','tutoring','pet','grocery']},
    {id:'demo-teen',role:'teen',name:'Alex Helper',email:DEMO.teen.email,verified:true,photo:'AH',rating:4.9,ratingCount:11,suspended:false,age:15,minor:true,guardianId:'demo-guardian',guardianConfirmed:true,bio:'Hardworking volunteer saving for college (demo).'},
    {id:'np-margaret',role:'poster',name:'Margaret Chen',email:'margaret@demo.local',verified:true,photo:'MC',rating:4.9,ratingCount:18,suspended:false,guardianId:null,bio:'Retired teacher who loves having helpful young people around.'},
    {id:'np-robert',role:'poster',name:'Robert Williams',email:'robert@demo.local',verified:true,photo:'RW',rating:4.7,ratingCount:13,suspended:false,guardianId:null,bio:'Software engineer with a bad back — needs occasional yard help.'},
    {id:'np-priya',role:'poster',name:'Priya Patel',email:'priya@demo.local',verified:true,photo:'PP',rating:4.8,ratingCount:9,suspended:false,guardianId:null,bio:'Busy parent of three — there is always something to do!'},
    {id:'np-linda',role:'poster',name:'Linda Gomez',email:'linda@demo.local',verified:true,photo:'LG',rating:4.6,ratingCount:6,suspended:false,guardianId:null,bio:'New to the neighborhood and happy to meet helpers.'},
    {id:'nv-maya',role:'teen',name:'Maya Thompson',email:'maya@demo.local',verified:true,photo:'MT',rating:5.0,ratingCount:14,suspended:false,age:19,minor:false,guardianId:null,bio:'College student — reliable and friendly.'},
    {id:'nv-diego',role:'teen',name:'Diego Ramirez',email:'diego@demo.local',verified:true,photo:'DR',rating:4.8,ratingCount:9,suspended:false,age:22,minor:false,guardianId:null,bio:'Handy with tools and tech.'},
    {id:'nv-jordan',role:'teen',name:'Jordan Kim',email:'jordan@demo.local',verified:true,photo:'JK',rating:4.7,ratingCount:6,suspended:false,age:16,minor:true,guardianId:'demo-guardian',guardianConfirmed:true,bio:'Good with pets and tutoring.'},
    {id:'nv-sophie',role:'teen',name:'Sophie Bennett',email:'sophie@demo.local',verified:true,photo:'SB',rating:4.9,ratingCount:5,suspended:false,age:17,minor:true,guardianId:'demo-guardian',guardianConfirmed:true,bio:'Loves gardening and dog walking.'},
    {id:'nv-liam',role:'teen',name:"Liam O'Connor",email:'liam@demo.local',verified:true,photo:'LO',rating:4.5,ratingCount:3,suspended:false,age:20,minor:false,guardianId:null,bio:'Available most weekends.'},
  ];
  for(const p of profiles)await fdb.collection('users').doc(p.id).set(p,{merge:true});

  const seedDoc=await fdb.collection('meta').doc('demo').get();
  if(!seedDoc.exists||seedDoc.data().version!==SEED_VERSION){
    const ds=n=>{const d=new Date();d.setDate(d.getDate()+n);return d.toISOString().split('T')[0];};
    const POOL={
      yard:['Mow the front lawn','Rake & bag leaves','Weed the flower beds','Trim the hedges','Spread fresh mulch'],
      tech:['Set up a new iPad','Fix the home WiFi','Organize photos & email','Smart TV setup','Phone & apps walkthrough'],
      tutoring:['Algebra II help','Reading practice','Essay review','SAT math prep','Science homework help'],
      pet:['Walk the dog (1 hr)','Feed & walk two dogs','Cat-sitting visit','Dog walk + park trip','Pet feeding while away'],
      grocery:['Weekly grocery run','Pharmacy pickup','Farmers market trip','Big-box store run','Quick corner-store errand'],
    };
    const desc={
      yard:'Mowing, raking, and a bit of weeding. Tools provided — about 1–2 hours of work.',
      tech:'Help getting a new device set up: WiFi, email, and a quick walkthrough of the basics.',
      tutoring:'Friendly homework help and review. Patience appreciated; materials provided.',
      pet:'Walk and feed a friendly dog. Leash, treats, and bags provided.',
      grocery:'A short grocery run from a list. Cash provided, plus a tip for your time.',
    };
    const addrs={'demo-poster':'12 Demo Lane','np-margaret':'47 Elm Street','np-robert':'12 Oak Avenue','np-priya':'88 Birch Court','np-linda':'5 Cedar Way'};
    const times=['8:00 AM – 10:00 AM','9:00 AM – 11:00 AM','10:00 AM – 12:00 PM','1:00 PM – 3:00 PM','2:00 PM – 4:00 PM'];
    const jobs=[];let n=0;const cnt={yard:0,tech:0,tutoring:0,pet:0,grocery:0};
    const add=(poster,type,price,status,vol,dayOffset)=>{
      n++;jobs.push({id:'dj-'+n,posterId:poster,assignedTeen:vol||null,type,
        title:POOL[type][cnt[type]++%POOL[type].length],desc:desc[type],
        address:addrs[poster],date:ds(dayOffset),time:times[n%times.length],price,status,created:now()});
    };
    // COMPLETED jobs → these drive the leaderboard (assignedTeen = who did it)
    const completed=[
      ['demo-poster','nv-maya','yard',35],['np-margaret','nv-maya','tech',25],['np-robert','nv-maya','pet',20],['np-priya','nv-maya','tutoring',40],['np-linda','nv-maya','grocery',15],['np-margaret','nv-maya','yard',30],
      ['demo-poster','demo-teen','yard',30],['np-margaret','demo-teen','tutoring',35],['np-robert','demo-teen','pet',20],['np-priya','demo-teen','tech',25],['np-linda','demo-teen','grocery',18],
      ['np-margaret','nv-diego','tech',30],['np-robert','nv-diego','yard',25],['np-priya','nv-diego','grocery',15],['demo-poster','nv-diego','tech',28],
      ['demo-poster','nv-jordan','pet',20],['np-linda','nv-jordan','tutoring',30],['np-robert','nv-jordan','pet',22],
      ['np-margaret','nv-sophie','yard',25],['np-priya','nv-sophie','pet',20],
      ['np-linda','nv-liam','grocery',16],
    ];
    completed.forEach(([p,v,t,price],i)=>add(p,t,price,'done',v,-(i+2)));
    // OPEN jobs → fill the job board (every category, every poster)
    const open=[
      ['demo-poster','yard',30,1],['demo-poster','tech',25,2],['demo-poster','grocery',18,3],['demo-poster','tutoring',32,3],
      ['np-margaret','tutoring',35,2],['np-margaret','pet',20,1],['np-margaret','tech',28,4],['np-margaret','grocery',16,2],
      ['np-robert','grocery',15,3],['np-robert','yard',25,3],['np-robert','tutoring',38,5],['np-robert','tech',24,4],
      ['np-priya','tech',30,2],['np-priya','pet',20,4],['np-priya','yard',26,1],['np-priya','grocery',17,3],
      ['np-linda','grocery',18,1],['np-linda','tutoring',40,5],['np-linda','pet',22,2],['np-linda','yard',28,4],
    ];
    open.forEach(([p,t,price,day])=>add(p,t,price,'open',null,day));
    // One BOOKED job for the logged-in volunteer (Alex) so Messages/Check-in are alive
    add('np-margaret','pet',22,'booked','demo-teen',1);const bookedId='dj-'+n;
    for(const j of jobs)await fdb.collection('jobs').doc(j.id).set(j);

    // Requests: Alex's own jobs + two live applicants on Jamie's open jobs
    const reqs=[];
    jobs.filter(j=>j.assignedTeen==='demo-teen').forEach((j,i)=>reqs.push({id:'dr-'+i,jobId:j.id,teenId:'demo-teen',guardianApproval:'approved',posterAcceptance:'accepted',created:now()}));
    const jamieOpen=jobs.filter(j=>j.posterId==='demo-poster'&&j.status==='open').slice(0,2);
    if(jamieOpen[0])reqs.push({id:'dr-ap1',jobId:jamieOpen[0].id,teenId:'nv-diego',guardianApproval:'approved',posterAcceptance:'pending',created:now()});
    if(jamieOpen[1])reqs.push({id:'dr-ap2',jobId:jamieOpen[1].id,teenId:'nv-liam',guardianApproval:'approved',posterAcceptance:'pending',created:now()});
    for(const r of reqs)await fdb.collection('requests').doc(r.id).set(r);

    await fdb.collection('checkins').doc('dc-booked').set({id:'dc-booked',jobId:bookedId,arrivedAt:null,doneAt:null,missed:false});
    const msgs=[
      {id:'dm-1',jobId:bookedId,senderId:'np-margaret',text:'Hi Alex! Pepper the dog is friendly — leash and treats are by the front door.',created:now()},
      {id:'dm-2',jobId:bookedId,senderId:'demo-teen',text:'Sounds great, I can come by at 10. Any route she likes best?',created:now()},
      {id:'dm-3',jobId:bookedId,senderId:'np-margaret',text:'The park loop is her favorite. Thank you so much!',created:now()},
    ];
    for(const m of msgs)await fdb.collection('messages').doc(m.id).set(m);
    await fdb.collection('meta').doc('escrows').set({[bookedId]:22},{merge:true});

    const ratings=[
      {id:'drt-1',jobId:'dj-6',fromId:'demo-poster',toId:'demo-teen',stars:5,comment:'Alex did a fantastic job — polite and thorough!',created:now()},
      {id:'drt-2',jobId:'dj-7',fromId:'np-margaret',toId:'demo-teen',stars:5,comment:'Wonderful with my granddaughter. Highly recommend.',created:now()},
      {id:'drt-3',jobId:'dj-6',fromId:'demo-teen',toId:'demo-poster',stars:5,comment:'Clear instructions and very kind. Would help again!',created:now()},
    ];
    for(const r of ratings)await fdb.collection('ratings').doc(r.id).set(r);
    await fdb.collection('meta').doc('demo').set({version:SEED_VERSION});
  }
  await fdb.collection('meta').doc('balances').set({
    'demo-poster':320,'demo-teen':210,'nv-maya':480,'nv-diego':260,'nv-jordan':140,'nv-sophie':95,'nv-liam':70,
    'np-margaret':500,'np-robert':400,'np-priya':350,'np-linda':150
  },{merge:true});
}

// ── STATE ────────────────────────────────────────────────────────────────────
let CU=null,CV='landing',JF='all',CJI=null,CTJ=null,SEL_ROLE='teen',SEL_STARS=0;
let provisioning=false; // set while we create/seed an account, so the auth listener defers

// Which physical page are we on? Set via <body data-page="…"> — landing | auth | app.
const PAGE=(document.body&&document.body.dataset.page)||'landing';
const ROLE_HOME={teen:'jobs',poster:'my-posts',guardian:'guardian',admin:'admin'};
// Top-level views that get their own #hash, so Back / Forward / refresh work.
const NAVABLE=['jobs','my-jobs','post-job','my-posts','messages','guardian','admin','profile','leaderboard'];

// ── BOOT ─────────────────────────────────────────────────────────────────────
// Firebase persists the session; this fires on load and on every login/logout.
auth.onAuthStateChanged(user=>{routePage(user);});
async function routePage(user){
  if(provisioning)return; // a sign-up/demo flow is driving navigation itself
  if(PAGE==='landing')return;               // marketing page is always viewable
  if(PAGE==='auth'){                          // login page: skip it if already signed in
    if(user)location.replace('app.html');
    return;
  }
  // Protected app page — require a signed-in user with a profile.
  if(!user){location.replace('login.html');return;}
  if(CU&&CU.email===user.email)return; // already initialised for this user
  let prof;
  try{prof=await loadProfile(user.email);}catch(e){toast(authMsg(e));return;}
  if(!prof){toast('No profile found for this account. Please sign up.');await auth.signOut();location.replace('login.html');return;}
  if(prof.suspended){toast('This account is suspended. Contact an admin.');await auth.signOut();location.replace('login.html');return;}
  CU=prof;startListeners();initApp();
  if(!user.emailVerified)setTimeout(()=>toast('Tip: verify your email via the link we sent.'),1000);
}

// ── AUTH ─────────────────────────────────────────────────────────────────────
function showAuth(tab){location.href='login.html'+(tab==='signup'?'?tab=signup':'');}
function switchAuthTab(t){
  document.getElementById('auth-login').classList.toggle('hidden',t!=='login');
  document.getElementById('auth-signup').classList.toggle('hidden',t!=='signup');
  document.getElementById('tab-login').classList.toggle('active',t==='login');
  document.getElementById('tab-signup').classList.toggle('active',t==='signup');
  document.getElementById('auth-title').textContent=t==='login'?'Welcome back':'Create your account';
  document.getElementById('auth-sub').textContent=t==='login'?'Sign in to your GoodTurn account':'Join the neighborhood help network';
}
function selectRole(r){
  SEL_ROLE=r;
  ['teen','poster','guardian'].forEach(x=>document.getElementById('role-'+x).classList.toggle('selected',x===r));
  document.getElementById('su-age-grp').classList.toggle('hidden',r!=='teen'); // age only for volunteers
  updateGuardianField();
}
// A volunteer under 18 must link a parent/guardian; 18+ don't need one.
function updateGuardianField(){
  const ageEl=document.getElementById('su-age');
  const age=ageEl?parseInt(ageEl.value,10):NaN;
  const minor=SEL_ROLE==='teen'&&!isNaN(age)&&age<18;
  document.getElementById('su-guard-grp').classList.toggle('hidden',!minor);
}
async function doLogin(){
  const em=document.getElementById('login-email').value.trim();
  const pw=document.getElementById('login-pw').value;
  if(!em||!pw){toast('Enter your email and password');return;}
  try{await auth.signInWithEmailAndPassword(em,pw);} // route() handles navigation
  catch(e){toast(authMsg(e));}
}
async function quickLogin(role){
  const d=DEMO[role];if(!d)return;
  provisioning=true;
  try{
    try{await auth.signInWithEmailAndPassword(d.email,d.pw);}
    catch(e){
      if(['auth/user-not-found','auth/invalid-credential','auth/invalid-login-credentials'].includes(e.code)){
        await auth.createUserWithEmailAndPassword(d.email,d.pw); // first use: create it
      }else throw e;
    }
    await ensureDemoData();
    const prof=await loadProfile(d.email);
    provisioning=false;
    if(prof)location.href='app.html';
    else toast('Could not load the demo account.');
  }catch(e){provisioning=false;toast(authMsg(e));}
}
async function doSignup(){
  const name=document.getElementById('su-name').value.trim();
  const email=document.getElementById('su-email').value.trim();
  const pw=document.getElementById('su-pw').value;
  if(!name||!email||pw.length<6){toast('Fill all fields; password min 6 chars');return;}
  let age=null,minor=false,guardianEmail=null;
  if(SEL_ROLE==='teen'){
    age=parseInt(document.getElementById('su-age').value,10);
    if(isNaN(age)||age<13||age>120){toast('Please enter a valid age (13 or older).');return;}
    minor=age<18; // under-18 volunteers get the safety settings
    if(minor){
      guardianEmail=document.getElementById('su-guard').value.trim();
      if(!guardianEmail){toast('Parent/guardian email required for volunteers under 18.');return;}
    }
  }
  provisioning=true;
  // Create the login first — this signs the user in, which is required before we're
  // allowed to read the database to find their parent's account.
  let cred;
  try{cred=await auth.createUserWithEmailAndPassword(email,pw);}
  catch(e){provisioning=false;toast(authMsg(e));return;}
  const uidv=cred.user.uid;
  let guardianProfile=null;
  if(SEL_ROLE==='teen'&&minor){
    try{guardianProfile=await loadProfile(guardianEmail);}catch(e){guardianProfile=null;}
    if(!guardianProfile||guardianProfile.role!=='guardian'){
      try{await cred.user.delete();}catch{} // roll back the orphan login so they can retry
      toast('No parent account found with that email. Ask your parent to sign up first.');
      switchAuthTab('signup');
      setTimeout(()=>{provisioning=false;},800); // ignore the sign-out event from the rollback
      return;
    }
  }
  const nu={
    id:uidv,role:SEL_ROLE,name,email,
    age:SEL_ROLE==='teen'?age:null,
    minor:SEL_ROLE==='teen'?minor:false,
    verified:SEL_ROLE!=='poster',
    photo:name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase(),
    rating:0,ratingCount:0,suspended:false,
    guardianId:guardianProfile?guardianProfile.id:null,bio:'',
    guardianConfirmed:guardianProfile?true:false,
    teenIds:SEL_ROLE==='guardian'?[]:[],
    allowedTypes:SEL_ROLE==='guardian'?['yard','tech','tutoring','pet','grocery']:[],
    maxDistance:SEL_ROLE==='guardian'?5:null,
  };
  try{
    await saveDoc('users',nu);
    if(guardianProfile){
      const teenIds=Array.isArray(guardianProfile.teenIds)?guardianProfile.teenIds.slice():[];
      if(!teenIds.includes(uidv))teenIds.push(uidv);
      await fdb.collection('users').doc(guardianProfile.id).update({teenIds});
    }
    await fdb.collection('meta').doc('balances').set({[uidv]:SEL_ROLE==='poster'?200:0},{merge:true});
    try{await cred.user.sendEmailVerification();}catch{}
  }catch(e){provisioning=false;toast(authMsg(e));return;}
  provisioning=false;
  location.href='app.html'; // the app page boots fresh for the new user
}
async function doReset(){
  const em=document.getElementById('login-email').value.trim();
  if(!em){toast('Enter your email above first, then tap reset.');return;}
  try{await auth.sendPasswordResetEmail(em);toast('Password reset email sent to '+em+'.');}
  catch(e){toast(authMsg(e));}
}
async function logout(){try{await auth.signOut();}catch(e){} location.href='index.html';}

// ── APP INIT ──────────────────────────────────────────────────────────────────
function initApp(){
  const nav=document.getElementById('nav');if(nav)nav.classList.remove('hidden');
  const np=document.getElementById('nav-public');if(np)np.classList.add('hidden');
  document.getElementById('nav-avatar').textContent=CU.photo||CU.name[0];
  ensureDemoData().catch(()=>{}); // make sure the demo world exists (one-time, version-gated)
  renderNav();
  routeHash(); // render the view named in the URL hash (or the role's home)
}
function routeHash(){
  if(!CU)return;
  let v=(location.hash||'').replace(/^#\/?/,'');
  if(!NAVABLE.includes(v))v=ROLE_HOME[CU.role]||'profile';
  showView(v);
}
window.addEventListener('hashchange',()=>{if(CU&&PAGE==='app')routeHash();});
function renderNav(){
  if(!CU)return;
  const tabs={
    teen:[{id:'jobs',l:'Find Jobs'},{id:'my-jobs',l:'My Jobs'},{id:'messages',l:'Messages'},{id:'leaderboard',l:'Leaderboard'}],
    poster:[{id:'my-posts',l:'My Posts'},{id:'post-job',l:'Post Job'},{id:'messages',l:'Messages'},{id:'leaderboard',l:'Leaderboard'}],
    guardian:[{id:'guardian',l:'Dashboard'},{id:'messages',l:'Messages'},{id:'leaderboard',l:'Leaderboard'}],
    admin:[{id:'admin',l:'Admin Panel'},{id:'leaderboard',l:'Leaderboard'}],
  }[CU.role]||[];
  document.getElementById('nav-tabs').innerHTML=tabs.map(t=>`<button class="nav-tab${CV===t.id?' active':''}" onclick="showView('${t.id}')">${t.l}</button>`).join('');
}

// ── ROUTER ────────────────────────────────────────────────────────────────────
function showView(v){
  // Cross-page jumps: landing and auth live on their own physical pages.
  if(v==='landing'){location.href='index.html';return;}
  if(v==='auth'){location.href='login.html';return;}
  CV=v;
  if(NAVABLE.includes(v)&&location.hash!=='#'+v)location.hash='#'+v; // give top-level views a URL
  document.querySelectorAll('[id^="view-"]').forEach(e=>e.classList.add('hidden'));
  const el=document.getElementById('view-'+v);
  if(el){el.classList.remove('hidden');el.classList.remove('va');void el.offsetWidth;el.classList.add('va');}
  renderNav();
  const rmap={jobs:renderJobs,'my-jobs':renderMyJobs,'my-posts':renderMyPosts,messages:renderMsgList,guardian:renderGuardian,admin:renderAdmin,profile:renderProfile,leaderboard:renderLeaderboard};
  if(rmap[v])rmap[v]();
  window.scrollTo(0,0);
}

// ── UTILS ──────────────────────────────────────────────────────────────────────
function gU(id){return DB.get('users').find(u=>u.id===id);}
function gJ(id){return DB.get('jobs').find(j=>j.id===id);}
function stars(n){return'★'.repeat(Math.round(n))+'☆'.repeat(5-Math.round(n));}
function ava(user,sz=36){
  const bg=['#16a34a','#f59e0b','#3b82f6','#8b5cf6','#ef4444'][user.name.charCodeAt(0)%5];
  return`<div style="width:${sz}px;height:${sz}px;border-radius:50%;background:${bg};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${Math.floor(sz*.38)}px;flex-shrink:0;">${user.photo||user.name[0]}</div>`;
}
const CP=[/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/,/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/,/\b(whatsapp|telegram|signal|snapchat|text me|call me|my number|dm me)\b/i];
function filterMsg(t){return CP.some(p=>p.test(t))?null:t;}

// ── JOB BOARD ──────────────────────────────────────────────────────────────────
function renderJobs(){
  const jobs=DB.get('jobs').filter(j=>j.status==='open'&&(JF==='all'||j.type===JF));
  const wrap=document.getElementById('job-list-wrap');
  if(!jobs.length){wrap.innerHTML='<div class="empty"><div class="empty-icon">🔍</div><div class="empty-title">No jobs here yet</div><p>Check back soon or try another filter.</p></div>';return;}
  wrap.innerHTML='<div class="job-list">'+jobs.map(j=>{
    const p=gU(j.posterId);
    const aiScore=74+(j.price%26);
    return`<div class="jcard" onclick="showJobDetail('${j.id}')">
      <div class="jcard-hdr"><div class="jtitle">${j.title}</div><div class="jprice">$${j.price}</div></div>
      <div class="jmeta"><span class="tag">${TYPES[j.type]}</span><span class="badge badge-green">Open</span><span style="color:var(--text2);font-size:13px;">📅 ${j.date} · ${j.time}</span><span style="margin-left:auto;background:linear-gradient(135deg,#f0fdf4,#dcfce7);color:#15803d;font-size:11px;font-weight:700;padding:3px 9px;border-radius:20px;border:1px solid #86efac;white-space:nowrap;">✦ ${aiScore}% match</span></div>
      <div class="jdesc">${j.desc.slice(0,120)}${j.desc.length>120?'…':''}</div>
      <div class="jposter">${ava(p,32)}<div><div style="font-weight:600;font-size:14px;">${p.name}</div><div style="font-size:13px;color:var(--text2);">${p.ratingCount?stars(p.rating)+' '+p.rating.toFixed(1):'New poster'}</div></div>${p.verified?'<span class="badge badge-green" style="margin-left:auto;">✓ Verified</span>':'<span class="badge badge-amber" style="margin-left:auto;">Pending</span>'}</div>
    </div>`;
  }).join('')+'</div>';
}
function filterJobs(t,el){JF=t;document.querySelectorAll('.fchip').forEach(c=>c.classList.remove('active'));el.classList.add('active');renderJobs();}

// ── JOB DETAIL ────────────────────────────────────────────────────────────────
function showJobDetail(jid){
  CJI=jid;const job=gJ(jid);const poster=gU(job.posterId);
  const reqs=DB.get('requests');
  const myReq=CU.role==='teen'?reqs.find(r=>r.jobId===jid&&r.teenId===CU.id):null;
  const showAddr=['booked','in-progress','done'].includes(job.status)&&(CU.role!=='teen'||(myReq&&myReq.posterAcceptance==='accepted'));
  const pRatings=DB.get('ratings').filter(r=>r.toId===poster.id);

  let act='';
  if(CU.role==='teen'){
    if(job.status!=='open') act='<div class="alert alert-info">This job is no longer accepting requests.</div>';
    else if(myReq){
      if(myReq.guardianApproval==='pending') act='<div class="alert alert-warn">⏳ Waiting for your guardian to approve this job.</div>';
      else if(myReq.guardianApproval==='rejected') act='<div class="alert alert-danger">Your guardian did not approve this job.</div>';
      else if(myReq.posterAcceptance==='pending') act=`<div class="alert alert-info">${CU.minor?'✅ Guardian approved! ':'✅ '}Waiting for ${poster.name} to accept you.</div>`;
      else act='<div class="alert alert-success">🎉 You\'re booked! <button class="btn btn-primary btn-sm" onclick="showView(\'my-jobs\')">My Jobs</button></div>';
    } else {
      act=`<button class="btn btn-primary btn-lg" style="width:100%;" onclick="requestJob('${jid}')">Request This Job</button><p style="text-align:center;font-size:13px;color:var(--text2);margin-top:8px;">${CU.minor?"Your guardian will be asked to approve before you're booked.":'The poster will review your request.'}</p>`;
    }
  }

  const back=CU.role==='teen'?'jobs':'my-posts';
  document.getElementById('job-detail-content').innerHTML=`
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
      <button class="back-btn" onclick="showView('${back}')">←</button>
      <div style="flex:1;"><div style="font-size:24px;font-weight:800;">${job.title}</div>
      <div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap;"><span class="tag">${TYPES[job.type]}</span><span class="badge ${S_COLOR[job.status]||'badge-gray'}">${S_LABEL[job.status]}</span></div></div>
      <div style="font-size:28px;font-weight:800;color:var(--green);">$${job.price}</div>
    </div>
    <div class="info-grid">
      <div class="info-item"><div class="info-label">Date</div><div class="info-value">📅 ${job.date}</div></div>
      <div class="info-item"><div class="info-label">Time</div><div class="info-value">⏰ ${job.time}</div></div>
      <div class="info-item"><div class="info-label">Task</div><div class="info-value">${TYPES[job.type]}</div></div>
      <div class="info-item"><div class="info-label">Address</div><div class="info-value">${showAddr?'📍 '+job.address:'📍 Shared after booking'}</div></div>
    </div>
    <div class="card" style="margin-bottom:20px;"><div style="font-weight:700;margin-bottom:10px;">About this job</div><div style="color:var(--text2);line-height:1.7;">${job.desc}</div></div>
    <div class="card" style="margin-bottom:20px;">
      <div style="font-weight:700;margin-bottom:14px;">Posted by</div>
      <div style="display:flex;align-items:center;gap:14px;">${ava(poster,52)}<div>
        <div style="font-weight:700;font-size:17px;">${poster.name}</div>
        <div style="font-size:13px;color:var(--text2);">${poster.bio||''}</div>
        ${poster.ratingCount?`<div class="stars" style="margin-top:4px;">${stars(poster.rating)} <span style="font-size:13px;color:var(--text2);">${poster.rating.toFixed(1)} (${poster.ratingCount} reviews)</span></div>`:'<div style="font-size:13px;color:var(--text2);">New to GoodTurn</div>'}
        <span class="badge ${poster.verified?'badge-green':'badge-amber'}" style="margin-top:4px;">${poster.verified?'✓ Verified Poster':'Pending Verification'}</span>
      </div></div>
      ${pRatings.length?'<div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border);">'+pRatings.slice(0,2).map(r=>{const f=gU(r.fromId);return`<div style="margin-bottom:10px;"><div style="font-size:13px;color:var(--dim);">${f?.name||'?'} · ${'★'.repeat(r.stars)}</div><div style="font-size:14px;">${r.comment}</div></div>`}).join('')+'</div>':''}
    </div>
    ${act}
  `;
  showView('job-detail');
}

async function requestJob(jid){
  if(DB.get('requests').find(r=>r.jobId===jid&&r.teenId===CU.id)){toast('Already requested.');return;}
  if(CU.minor){
    // Under 18: needs a linked guardian who must approve first.
    const guard=gU(CU.guardianId);
    if(!guard){toast('You need a linked guardian to request jobs.');return;}
    await saveDoc('requests',{id:'r-'+uid(),jobId:jid,teenId:CU.id,guardianApproval:'pending',posterAcceptance:'pending',created:now()});
    toast(`Request sent! Waiting for ${guard.name} to approve.`);
  } else {
    // 18+: no guardian step — the request goes straight to the poster.
    await saveDoc('requests',{id:'r-'+uid(),jobId:jid,teenId:CU.id,guardianApproval:'approved',posterAcceptance:'pending',created:now()});
    toast('Request sent to the poster!');
  }
  showJobDetail(jid);
}

// ── MY JOBS (teen) ────────────────────────────────────────────────────────────
function renderMyJobs(){
  const reqs=DB.get('requests').filter(r=>r.teenId===CU.id);
  const jobs=DB.get('jobs');
  const el=document.getElementById('my-jobs-content');
  if(!reqs.length){el.innerHTML='<div class="empty"><div class="empty-icon">💼</div><div class="empty-title">No jobs yet</div><p>Browse the board and request a job to get started.</p><button class="btn btn-primary" style="margin-top:16px;" onclick="showView(\'jobs\')">Find Jobs</button></div>';return;}
  el.innerHTML=reqs.map(req=>{
    const job=jobs.find(j=>j.id===req.jobId);if(!job)return'';
    const poster=gU(job.posterId);
    let st='';
    if(req.guardianApproval==='pending')st='<div class="alert alert-warn" style="margin-top:12px;">⏳ Waiting for guardian approval</div>';
    else if(req.guardianApproval==='rejected')st='<div class="alert alert-danger" style="margin-top:12px;">Guardian did not approve this job</div>';
    else if(req.posterAcceptance==='pending')st=`<div class="alert alert-info" style="margin-top:12px;">✅ ${CU.minor?'Guardian approved · ':''}Waiting for ${poster.name} to accept you</div>`;
    else if(req.posterAcceptance==='accepted'&&job.status==='booked')st=`<div class="alert alert-success" style="margin-top:12px;">🎉 You're booked!</div><div style="margin-top:10px;display:flex;gap:8px;"><button class="btn btn-primary btn-sm" onclick="openThread('${job.id}')">Messages</button><button class="btn btn-secondary btn-sm" onclick="openCheckin('${job.id}')">Check-In</button></div>`;
    else if(job.status==='done'){const rated=DB.get('ratings').find(r=>r.jobId===job.id&&r.fromId===CU.id);st=`<div class="alert alert-success" style="margin-top:12px;">✅ Complete! $${job.price} earned.</div><div style="margin-top:8px;">${rated?'<span class="badge badge-green">⭐ Rated</span>':`<button class="btn btn-amber btn-sm" onclick="showRateScreen('${job.id}','${job.posterId}')">Leave Rating</button>`}</div>`;}
    return`<div class="card" style="margin-bottom:14px;"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;"><div><div style="font-size:17px;font-weight:700;cursor:pointer;" onclick="showJobDetail('${job.id}')">${job.title}</div><div style="font-size:13px;color:var(--text2);margin-top:2px;">with ${poster.name} · $${job.price} · ${job.date}</div></div><span class="badge ${S_COLOR[job.status]||'badge-gray'}">${S_LABEL[job.status]}</span></div>${st}</div>`;
  }).join('');
}

// ── MY POSTS (poster) ─────────────────────────────────────────────────────────
function renderMyPosts(){
  const jobs=DB.get('jobs').filter(j=>j.posterId===CU.id);
  const el=document.getElementById('my-posts-content');
  let html=!CU.verified?'<div class="alert alert-warn"><strong>Poster account pending admin verification.</strong> Your jobs will go live once approved.</div>':'';
  if(!jobs.length){el.innerHTML=html+'<div class="empty"><div class="empty-icon">📋</div><div class="empty-title">No jobs posted yet</div><button class="btn btn-primary" style="margin-top:16px;" onclick="showView(\'post-job\')">Post Your First Job</button></div>';return;}
  html+='<div class="job-list">'+jobs.map(j=>{
    const pending=DB.get('requests').filter(r=>r.jobId===j.id&&r.guardianApproval==='approved'&&r.posterAcceptance==='pending').length;
    return`<div class="jcard" onclick="openManageJob('${j.id}')">
      <div class="jcard-hdr"><div class="jtitle">${j.title}</div><div class="jprice">$${j.price}</div></div>
      <div class="jmeta"><span class="tag">${TYPES[j.type]}</span><span class="badge ${S_COLOR[j.status]}">${S_LABEL[j.status]}</span>${pending?`<span class="badge badge-amber">${pending} applicant${pending>1?'s':''}</span>`:''}</div>
      <div class="jdesc">${j.desc.slice(0,100)}…</div>
    </div>`;
  }).join('')+'</div>';
  el.innerHTML=html;
}

function openManageJob(jid){
  CJI=jid;const job=gJ(jid);
  const reqs=DB.get('requests').filter(r=>r.jobId===jid);
  const escrows=DB.obj('escrows');
  const eligible=reqs.filter(r=>r.guardianApproval==='approved');
  const assignedTeen=job.assignedTeen?gU(job.assignedTeen):null;
  const funded=!!escrows[jid];

  let rHtml=eligible.length?eligible.map(req=>{
    const t=gU(req.teenId);
    return`<div class="adm-row">${ava(t,40)}<div style="flex:1;"><div style="font-weight:700;">${t.name}</div><div style="font-size:13px;color:var(--text2);">${t.ratingCount?stars(t.rating)+' '+t.rating.toFixed(1)+' · '+t.ratingCount+' jobs':'New worker'}</div><div style="font-size:12px;color:var(--green);">✓ Guardian approved</div></div>${req.posterAcceptance==='accepted'?'<span class="badge badge-green">Accepted</span>':`<button class="btn btn-primary btn-sm" onclick="acceptTeen('${req.id}')">Accept</button>`}</div>`;
  }).join(''):'<div class="alert alert-info">'+(reqs.filter(r=>r.guardianApproval==='pending').length?`${reqs.filter(r=>r.guardianApproval==='pending').length} request(s) waiting for guardian approval.`:'No requests yet.')+'</div>';

  let actHtml='';
  if(job.status==='booked'){
    actHtml=`<button class="btn btn-primary btn-sm" style="margin-bottom:16px;" onclick="openThread('${jid}')">Open Message Thread</button>`;
    if(!funded){
      actHtml+=`<div class="escrow-card"><div style="font-weight:700;margin-bottom:8px;">Fund Escrow to Lock In the Job</div><div class="escrow-amt">$${job.price}</div><p style="font-size:14px;color:var(--text2);margin:8px 0;">Funds are held securely and released to ${assignedTeen?.name||'the volunteer'} after both of you confirm completion.</p><div class="mock-note">💳 <strong>Demo mode:</strong> In production, this connects to Stripe. No real card data is handled here.</div><button class="btn btn-primary" style="margin-top:14px;width:100%;" onclick="fundEscrow('${jid}')">Fund Escrow — $${job.price}</button></div>`;
    } else {
      actHtml+=`<div class="escrow-card"><div style="font-weight:700;margin-bottom:4px;">Escrow Funded ✅</div><div class="escrow-amt">$${job.price}</div><p style="font-size:13px;color:var(--green-dark);margin-top:6px;">Money releases to ${assignedTeen?.name||'the volunteer'} after job is confirmed complete.</p></div><button class="btn btn-secondary" onclick="confirmDone('${jid}')">Confirm Job Complete</button>`;
    }
  } else if(job.status==='done'){
    const rated=DB.get('ratings').find(r=>r.jobId===jid&&r.fromId===CU.id);
    actHtml=`<div class="alert alert-success">Job is complete!</div>${rated?'<span class="badge badge-green">⭐ You rated this worker</span>':`<button class="btn btn-amber" onclick="showRateScreen('${jid}','${job.assignedTeen}')">Rate the Worker</button>`}`;
  }

  document.getElementById('manage-job-content').innerHTML=`
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
      <button class="back-btn" onclick="showView('my-posts')">←</button>
      <div><div style="font-size:22px;font-weight:800;">${job.title}</div><span class="badge ${S_COLOR[job.status]}">${S_LABEL[job.status]}</span></div>
    </div>
    ${assignedTeen?`<div class="alert alert-success">Booked with: <strong>${assignedTeen.name}</strong></div>`:''}
    <div class="card" style="margin-bottom:16px;"><div style="font-weight:700;margin-bottom:12px;">Applicants</div>${rHtml}</div>
    ${actHtml}
  `;
  showView('manage-job');
}

async function acceptTeen(rid){
  const req=DB.get('requests').find(r=>r.id===rid);if(!req)return;
  req.posterAcceptance='accepted';await saveDoc('requests',req);
  const job=gJ(req.jobId);job.status='booked';job.assignedTeen=req.teenId;await saveDoc('jobs',job);
  if(!DB.get('checkins').find(c=>c.jobId===req.jobId)){await saveDoc('checkins',{id:'c-'+uid(),jobId:req.jobId,arrivedAt:null,doneAt:null,missed:false});}
  toast('Volunteer accepted! Job is now booked. Fund escrow next.');
  openManageJob(req.jobId);
}

async function fundEscrow(jid){
  const job=gJ(jid);const bal={...DB.obj('balances')};
  if((bal[CU.id]||0)<job.price){toast('Insufficient mock balance.');return;}
  bal[CU.id]=(bal[CU.id]||0)-job.price;await setMeta('balances',bal);
  const e={...DB.obj('escrows')};e[jid]=job.price;await setMeta('escrows',e);
  toast('Escrow funded! Funds release after both confirm completion.');
  openManageJob(jid);
}

async function confirmDone(jid){
  const job=gJ(jid);job.status='done';await saveDoc('jobs',job);
  const e={...DB.obj('escrows')};const amt=e[jid];
  if(amt){const bal={...DB.obj('balances')};bal[job.assignedTeen]=(bal[job.assignedTeen]||0)+amt;await setMeta('balances',bal);delete e[jid];await setMeta('escrows',e);}
  toast('Job marked complete! Payment released.');
  if(job.assignedTeen&&!DB.get('ratings').find(r=>r.jobId===jid&&r.fromId===CU.id)){showRateScreen(jid,job.assignedTeen);}
  else openManageJob(jid);
}

// ── POST JOB ──────────────────────────────────────────────────────────────────
async function postJob(){
  const v=id=>document.getElementById(id).value.trim();
  const title=v('pj-title'),type=document.getElementById('pj-type').value,desc=v('pj-desc'),addr=v('pj-addr'),date=v('pj-date'),time=v('pj-time');
  const price=parseFloat(document.getElementById('pj-price').value);
  if(!title||!desc||!addr||!date||!time||!price){toast('Please fill in all fields');return;}
  if(!CU.verified){toast('Your account needs admin verification first.');return;}
  await saveDoc('jobs',{id:'j-'+uid(),posterId:CU.id,title,type,desc,address:addr,date,time,price,status:'open',assignedTeen:null,created:now()});
  toast('Job posted!');
  ['pj-title','pj-desc','pj-addr','pj-date','pj-time','pj-price'].forEach(id=>{document.getElementById(id).value='';});
  showView('my-posts');
}

// ── MESSAGES ──────────────────────────────────────────────────────────────────
function renderMsgList(){
  const jobs=DB.get('jobs'),reqs=DB.get('requests'),msgs=DB.get('messages'),el=document.getElementById('messages-content');
  let jids=[];
  if(CU.role==='teen') jids=reqs.filter(r=>r.teenId===CU.id&&r.posterAcceptance==='accepted').map(r=>r.jobId);
  else if(CU.role==='poster') jids=jobs.filter(j=>j.posterId===CU.id&&j.status!=='open').map(j=>j.id);
  else if(CU.role==='guardian'){
    const u=DB.get('users').find(x=>x.id===CU.id);
    const tids=(u?.teenIds)||[];
    jids=reqs.filter(r=>tids.includes(r.teenId)&&r.posterAcceptance==='accepted').map(r=>r.jobId);
  }
  if(!jids.length){el.innerHTML='<div class="empty"><div class="empty-icon">💬</div><div class="empty-title">No threads yet</div><p>Threads open once a job is booked.</p></div>';return;}
  el.innerHTML=jids.map(jid=>{
    const job=jobs.find(j=>j.id===jid);if(!job)return'';
    const last=msgs.filter(m=>m.jobId===jid).slice(-1)[0];
    const other=CU.role==='teen'?gU(job.posterId):(job.assignedTeen?gU(job.assignedTeen):gU(job.posterId));
    return other?`<div class="card" style="cursor:pointer;margin-bottom:12px;display:flex;align-items:center;gap:14px;" onclick="openThread('${jid}')">${ava(other,44)}<div style="flex:1;min-width:0;"><div style="font-weight:700;">${job.title}</div><div style="font-size:13px;color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${last?last.text.slice(0,60)+(last.text.length>60?'…':''):'No messages yet'}</div></div>${last?`<div style="font-size:11px;color:var(--dim);white-space:nowrap;">${fmt(last.created)}</div>`:''}</div>`:'';
  }).join('');
}

function openThread(jid){CTJ=jid;renderThread(jid);showView('thread');}
function renderThread(jid){
  const job=gJ(jid),msgs=DB.get('messages').filter(m=>m.jobId===jid);
  const poster=gU(job.posterId),teen=job.assignedTeen?gU(job.assignedTeen):null;
  const guard=teen?gU(teen.guardianId):null;
  document.getElementById('thread-content').innerHTML=`
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
      <button class="back-btn" onclick="showView('messages')">←</button>
      <div style="flex:1;"><div style="font-weight:700;">${job.title}</div><div style="font-size:13px;color:var(--text2);">${poster.name}${teen?' · '+teen.name:''}${guard?' · '+guard.name+' (guardian)':''}</div></div>
    </div>
    <div class="thread-banner">${guard?`👁️ <span><strong>${guard.name} can see this thread.</strong> All job messages are visible to this volunteer's parent. Keep things on-platform.</span>`:`🔒 <span><strong>Keep all communication on GoodTurn.</strong> Phone numbers, emails, and off-platform invites are automatically blocked.</span>`}</div>
    <div class="msg-list" id="mlist-${jid}">
      ${msgs.map(m=>{const s=gU(m.senderId);const mine=m.senderId===CU.id;return`<div class="mb ${mine?'mine':'theirs'}"><div class="mmeta">${s?.name||'?'} · ${fmt(m.created)}</div><div class="mtext">${m.text}</div></div>`;}).join('')||'<div style="text-align:center;color:var(--dim);padding:20px;">No messages yet — say hello!</div>'}
    </div>
    <div id="msg-block" class="msg-blocked hidden">🚫 Message blocked — it looks like it contains a phone number, email, or outside contact. Please keep all communication on GoodTurn.</div>
    <div class="msg-row"><input type="text" id="msg-in" placeholder="Type a message…" onkeydown="if(event.key==='Enter')sendMsg('${jid}')"><button class="btn btn-primary" onclick="sendMsg('${jid}')">Send</button></div>
  `;
  setTimeout(()=>{const l=document.getElementById('mlist-'+jid);if(l)l.scrollTop=l.scrollHeight;},50);
}
async function sendMsg(jid){
  const inp=document.getElementById('msg-in'),t=inp.value.trim();if(!t)return;
  const blk=document.getElementById('msg-block');
  if(!filterMsg(t)){blk.classList.remove('hidden');setTimeout(()=>blk.classList.add('hidden'),5000);return;}
  blk.classList.add('hidden');
  inp.value='';
  await saveDoc('messages',{id:'m-'+uid(),jobId:jid,senderId:CU.id,text:t,created:now()});
  renderThread(jid);
}

// ── CHECK-IN ──────────────────────────────────────────────────────────────────
function openCheckin(jid){CJI=jid;renderCheckin(jid);showView('checkin');}
function renderCheckin(jid){
  const job=gJ(jid),ci=DB.get('checkins').find(c=>c.jobId===jid)||{},guard=gU(CU.guardianId);
  let icon='📍',lbl='Ready to go?',sub="Tap \"I'm Here\" when you arrive.",btns='';
  if(!ci.arrivedAt){btns=`<button class="btn btn-primary btn-lg" style="width:100%;" onclick="doCheckin('${jid}','arrived')">I'm Here ✅</button>`;}
  else if(!ci.doneAt){icon='🔨';lbl='You\'re on the job!';sub=`Arrived at ${fmt(ci.arrivedAt)}. Tap when you're done.`;btns=`<button class="btn btn-amber btn-lg" style="width:100%;" onclick="doCheckin('${jid}','done')">All Done! 🎉</button>`;}
  else{icon='🎉';lbl='Job Complete!';sub=`Finished at ${fmt(ci.doneAt)}. Great work!`;}
  document.getElementById('checkin-content').innerHTML=`
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;"><button class="back-btn" onclick="showView('my-jobs')">←</button><div style="font-size:18px;font-weight:700;">Check-In</div></div>
    <div class="ci-card"><div class="ci-icon">${icon}</div><div class="ci-label">${lbl}</div><div class="ci-sub">${sub}</div>
    <div class="ci-info"><div style="font-weight:700;margin-bottom:8px;">${job.title}</div><div style="font-size:14px;color:var(--text2);">📍 ${job.address}</div><div style="font-size:14px;color:var(--text2);">⏰ ${job.date} · ${job.time}</div>${guard?`<div style="font-size:14px;color:var(--green);margin-top:6px;">👪 ${guard.name} receives your check-in status</div>`:''}</div>
    <div style="display:flex;flex-direction:column;gap:12px;">${btns}</div></div>
    ${ci.missed?'<div class="missed-alert"><div style="font-weight:700;color:var(--red);">⚠️ Check-in alert sent</div><div style="font-size:14px;margin-top:6px;">Your guardian was notified because you missed your expected check-in window. Tap "All Done!" as soon as you finish.</div></div>':''}
  `;
}
async function doCheckin(jid,type){
  let ci=DB.get('checkins').find(c=>c.jobId===jid);
  if(!ci){ci={id:'c-'+uid(),jobId:jid,arrivedAt:null,doneAt:null,missed:false};}
  if(type==='arrived'){ci.arrivedAt=now();toast('Arrived! Guardian notified.');}
  else{ci.doneAt=now();const j=gJ(jid);if(j&&j.status==='booked'){j.status='in-progress';await saveDoc('jobs',j);}toast('Done and safe! Guardian notified. Great work!');}
  await saveDoc('checkins',ci);renderCheckin(jid);
}

// ── RATINGS ───────────────────────────────────────────────────────────────────
function showRateScreen(jid,toId){
  SEL_STARS=0;const job=gJ(jid),toUser=gU(toId);const back=CU.role==='teen'?'my-jobs':'my-posts';
  document.getElementById('rate-content').innerHTML=`
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;"><button class="back-btn" onclick="showView('${back}')">←</button><div style="font-size:18px;font-weight:700;">Leave a Rating</div></div>
    <div class="card"><div style="text-align:center;margin-bottom:20px;">${ava(toUser,60)}<div style="font-size:18px;font-weight:700;margin-top:10px;">${toUser.name}</div><div style="font-size:14px;color:var(--text2);">for "${job.title}"</div></div>
    <div style="text-align:center;margin-bottom:20px;"><div style="font-weight:600;margin-bottom:10px;">How did it go?</div>
    <div class="star-row" style="justify-content:center;">${[1,2,3,4,5].map(n=>`<button class="star-btn" onclick="pickStar(${n},this)">☆</button>`).join('')}</div></div>
    <div class="fg"><label>Comment (optional)</label><textarea id="rate-cmt" rows="3" placeholder="What was great? What could improve?"></textarea></div>
    <button class="btn btn-primary btn-lg" style="width:100%;" onclick="submitRating('${jid}','${toId}')">Submit Rating</button></div>
  `;
  showView('rate');
}
function pickStar(n,el){
  SEL_STARS=n;
  el.closest('.star-row').querySelectorAll('.star-btn').forEach((b,i)=>b.textContent=i<n?'★':'☆');
}
async function submitRating(jid,toId){
  if(!SEL_STARS){toast('Please select a rating');return;}
  const cmt=document.getElementById('rate-cmt').value.trim();
  if(DB.get('ratings').find(r=>r.jobId===jid&&r.fromId===CU.id)){toast('Already rated');return;}
  const rt={id:'rt-'+uid(),jobId:jid,fromId:CU.id,toId,stars:SEL_STARS,comment:cmt,created:now()};
  await saveDoc('ratings',rt);
  const all=DB.get('ratings').filter(r=>r.toId===toId);
  if(!all.find(r=>r.id===rt.id))all.push(rt); // include the just-added rating
  const u=gU(toId);
  if(u){u.rating=parseFloat((all.reduce((s,r)=>s+r.stars,0)/all.length).toFixed(1));u.ratingCount=all.length;await saveDoc('users',u);}
  SEL_STARS=0;
  toast('Rating submitted!');
  showView(CU.role==='teen'?'my-jobs':'my-posts');
}

// ── LEADERBOARD ───────────────────────────────────────────────────────────────
let LB_KIND='volunteers'; // 'volunteers' | 'neighbors'
function switchLeaderboard(kind){LB_KIND=kind;renderLeaderboard();}
function lbEntries(kind){
  const users=DB.get('users'),jobs=DB.get('jobs');
  if(kind==='neighbors'){
    return users.filter(u=>u.role==='poster'&&!u.suspended).map(u=>{
      const posted=jobs.filter(j=>j.posterId===u.id);
      const done=posted.filter(j=>j.status==='done').length;
      return {u,score:posted.length,unit:'jobs offered',s1:'📋 '+posted.length+' posted',s2:'✅ '+done+' completed'};
    }).sort((a,b)=>b.score-a.score||(b.u.rating||0)-(a.u.rating||0)||a.u.name.localeCompare(b.u.name));
  }
  return users.filter(u=>u.role==='teen'&&!u.suspended).map(u=>{
    const done=jobs.filter(j=>j.assignedTeen===u.id&&j.status==='done');
    const earned=done.reduce((s,j)=>s+(j.price||0),0);
    return {u,score:done.length,unit:'jobs done',s1:'✅ '+done.length+' done',s2:'⭐ '+(u.ratingCount?u.rating.toFixed(1):'—'),sub:'$'+earned+' earned'};
  }).sort((a,b)=>b.score-a.score||(b.u.rating||0)-(a.u.rating||0)||a.u.name.localeCompare(b.u.name));
}
function renderLeaderboard(){
  const list=lbEntries(LB_KIND);
  const top=list.slice(0,3),rest=list.slice(3);
  const unit=LB_KIND==='neighbors'?'offered':'done';
  // 1st / 2nd / 3rd styling; displayed in podium order 2nd · 1st · 3rd
  const meta=[
    {ic:'🏆',bg:'linear-gradient(135deg,#f59e0b,#d97706)',place:'Champion',badge:'badge-amber',first:true},
    {ic:'🥈',bg:'linear-gradient(135deg,#cbd5e1,#94a3b8)',place:'2nd Place',badge:'badge-gray'},
    {ic:'🥉',bg:'linear-gradient(135deg,#f59e0b,#b45309)',place:'3rd Place',badge:'badge-amber'},
  ];
  const card=i=>{
    const e=top[i];if(!e)return'<div></div>';const m=meta[i];
    return`<div class="podium-card ${i===0?'podium-1':''}${e.u.id===CU.id?' lb-me':''}">
      <div class="podium-medal" style="background:${m.bg};">${m.ic}</div>
      <div style="display:flex;justify-content:center;margin-bottom:8px;">${ava(e.u,46)}</div>
      <div class="podium-name">${e.u.name}</div>
      <div class="podium-score">${e.score}</div>
      <div class="podium-unit">${LB_KIND==='neighbors'?'jobs offered':'jobs done'}</div>
      <span class="podium-place badge ${m.badge}">${m.place}</span>
      <div class="podium-stats"><span>${e.s1}</span><span>${e.s2}</span></div>
    </div>`;
  };
  const podium=top.length?`<div class="podium">${card(1)}${card(0)}${card(2)}</div>`:'';
  const rows=rest.map((e,idx)=>`<div class="lb-row${e.u.id===CU.id?' lb-me':''}">
      <div class="lb-rank">#${idx+4}</div>${ava(e.u,40)}
      <div style="flex:1;min-width:0;"><div style="font-weight:700;">${e.u.name}</div><div style="font-size:12px;color:var(--text2);">${e.s1} · ${e.s2}</div></div>
      <div style="text-align:right;"><div class="lb-pts">${e.score}</div><div style="font-size:11px;color:var(--dim);font-weight:600;">${unit}</div></div>
    </div>`).join('');
  const empty=`<div class="empty"><div class="empty-icon">🏆</div><div class="empty-title">No ${LB_KIND==='neighbors'?'neighbors':'volunteers'} yet</div><p>Complete some jobs to climb the board!</p></div>`;
  document.getElementById('leaderboard-content').innerHTML=`
    <div style="text-align:center;"><div class="sec-title" style="font-size:26px;">🏆 Leaderboard</div>
    <p style="color:var(--text2);font-size:14px;margin-top:4px;">See who's giving back the most in the community.</p></div>
    <div class="lb-tabs">
      <button class="lb-tab ${LB_KIND==='volunteers'?'active':''}" onclick="switchLeaderboard('volunteers')">🙋 Top Volunteers</button>
      <button class="lb-tab ${LB_KIND==='neighbors'?'active':''}" onclick="switchLeaderboard('neighbors')">🏡 Top Neighbors</button>
    </div>
    ${list.length?podium+rows:empty}
  `;
}

// ── GUARDIAN DASH ─────────────────────────────────────────────────────────────
function renderGuardian(){
  const allU=DB.get('users'),guard=allU.find(x=>x.id===CU.id);
  const tids=(guard?.teenIds)||[];
  const reqs=DB.get('requests'),jobs=DB.get('jobs'),cis=DB.get('checkins');
  const pending=reqs.filter(r=>tids.includes(r.teenId)&&r.guardianApproval==='pending');
  const active=jobs.filter(j=>tids.includes(j.assignedTeen)&&['booked','in-progress'].includes(j.status));

  document.getElementById('guardian-content').innerHTML=`
    <div style="font-size:24px;font-weight:800;margin-bottom:20px;">Guardian Dashboard</div>
    <div class="gd-sec"><div class="gd-title">👪 My Volunteers</div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
        ${tids.map(tid=>{const t=allU.find(u=>u.id===tid);if(!t)return'';return`<div class="card" style="display:flex;align-items:center;gap:12px;padding:14px;">${ava(t,40)}<div><div style="font-weight:700;">${t.name}</div><div style="font-size:13px;color:var(--text2);">${t.ratingCount?stars(t.rating)+' '+t.rating.toFixed(1):'No ratings yet'}</div></div></div>`;}).join('')}
        ${!tids.length?'<div style="color:var(--text2);">No volunteers linked yet. Ask your under-18 volunteer to sign up with your email.</div>':''}
      </div>
    </div>
    <div class="gd-sec"><div class="gd-title">⏳ Pending Approvals <span class="badge badge-amber">${pending.length}</span></div>
      ${pending.length?pending.map(req=>{
        const job=jobs.find(j=>j.id===req.jobId),teen=allU.find(u=>u.id===req.teenId),poster=job?gU(job.posterId):null;
        if(!job||!teen)return'';
        return`<div class="appr-card"><div style="font-weight:700;font-size:16px;margin-bottom:4px;">${job.title}</div><div style="font-size:13px;color:var(--text2);margin-bottom:8px;">${teen.name} wants to take this job for ${poster?.name||'?'}</div><div style="font-size:13px;margin-bottom:4px;">📅 ${job.date} · ⏰ ${job.time} · 💰 $${job.price}</div><div style="font-size:13px;margin-bottom:12px;">📍 Address shared after your approval and poster acceptance</div><div style="display:flex;gap:10px;"><button class="btn btn-primary" onclick="approveJob('${req.id}',true)">Approve</button><button class="btn btn-danger" onclick="approveJob('${req.id}',false)">Decline</button><button class="btn btn-secondary btn-sm" onclick="showJobDetail('${job.id}')">View Job</button></div></div>`;
      }).join(''):'<div style="color:var(--text2);font-size:14px;padding:12px 0;">No pending approvals.</div>'}
    </div>
    <div class="gd-sec"><div class="gd-title">🔨 Active Jobs</div>
      ${active.length?active.map(job=>{
        const teen=allU.find(u=>u.id===job.assignedTeen);
        const ci=cis.find(c=>c.jobId===job.id);
        const cs=!ci?.arrivedAt?'🔴 Not yet arrived':!ci?.doneAt?'🟡 At the job':'🟢 Done and safe';
        return`<div class="actjob-card"><div style="font-weight:700;">${job.title}</div><div style="font-size:13px;color:var(--text2);">${teen?.name} · $${job.price}</div><div style="font-size:13px;margin-top:6px;">📍 ${job.address}</div><div style="font-size:13px;">📅 ${job.date} · ${job.time}</div><div style="font-size:14px;font-weight:600;margin-top:8px;">${cs}</div><button class="btn btn-secondary btn-sm" style="margin-top:10px;" onclick="openThread('${job.id}')">View Thread</button></div>`;
      }).join(''):'<div style="color:var(--text2);font-size:14px;padding:12px 0;">No active jobs right now.</div>'}
    </div>
    <div class="gd-sec"><div class="gd-title">⚙️ Safety Settings</div>
      <div class="card">
        <div class="lim-row"><div><div style="font-weight:600;">Max job distance</div><div style="font-size:13px;color:var(--text2);">Volunteers under 18 can only request jobs within this radius</div></div>
        <select style="width:110px;" onchange="saveSetting('maxDistance',+this.value)">${[1,2,3,5,10].map(d=>`<option value="${d}" ${(guard?.maxDistance||5)==d?'selected':''}>${d} miles</option>`).join('')}</select></div>
        <div style="padding-top:14px;"><div style="font-weight:600;margin-bottom:8px;">Allowed task types</div><div style="display:flex;flex-wrap:wrap;gap:6px;">${Object.entries(TYPES).map(([k,v])=>{const on=(guard?.allowedTypes||['yard','tech','tutoring','pet','grocery']).includes(k);return`<button class="fchip${on?' active':''}" onclick="toggleType('${k}',this)">${v}</button>`;}).join('')}</div></div>
        <div class="mock-note" style="margin-top:12px;">📍 <strong>Coming soon:</strong> Live location sharing, geofencing alerts. In a full version, you'd get an alert if your teen goes out of range of the job address.</div>
      </div>
    </div>
  `;
}
async function approveJob(rid,approve){
  const r=DB.get('requests').find(x=>x.id===rid);
  if(r){r.guardianApproval=approve?'approved':'rejected';await saveDoc('requests',r);}
  toast(approve?'Job approved! The poster will see and can accept.':'Job declined.');renderGuardian();
}
async function saveSetting(key,val){
  const u=gU(CU.id);if(u){u[key]=val;CU[key]=val;await saveDoc('users',u);}toast('Setting saved.');
}
async function toggleType(t,el){
  const u=gU(CU.id);if(!u)return;
  u.allowedTypes=u.allowedTypes||['yard','tech','tutoring','pet','grocery'];
  const i=u.allowedTypes.indexOf(t);i>=0?u.allowedTypes.splice(i,1):u.allowedTypes.push(t);
  el.classList.toggle('active');CU.allowedTypes=u.allowedTypes;await saveDoc('users',u);
}

// ── ADMIN ─────────────────────────────────────────────────────────────────────
function renderAdmin(){
  const users=DB.get('users'),reports=DB.get('reports');
  const pending=users.filter(u=>u.role==='poster'&&!u.verified&&!u.suspended);
  const openReps=reports.filter(r=>r.status==='open');
  document.getElementById('admin-content').innerHTML=`
    <div style="font-size:24px;font-weight:800;margin-bottom:24px;">Admin Dashboard</div>
    <div class="adm-sec"><h2>⏳ Poster Applications <span class="badge badge-amber">${pending.length}</span></h2>
      ${pending.length?pending.map(u=>`<div class="adm-row">${ava(u,44)}<div style="flex:1;"><div style="font-weight:700;">${u.name}</div><div style="font-size:13px;color:var(--text2);">${u.email}</div><div style="font-size:12px;color:var(--text2);">${u.bio||'No bio'}</div></div><button class="btn btn-primary btn-sm" onclick="adm('verify','${u.id}')">Approve</button><button class="btn btn-danger btn-sm" onclick="adm('suspend','${u.id}')">Reject</button></div>`).join(''):'<div style="color:var(--text2);font-size:14px;">No pending applications.</div>'}
    </div>
    <div class="adm-sec"><h2>🚩 Reports <span class="badge badge-red">${openReps.length}</span></h2>
      ${openReps.length?openReps.map(rep=>{const fr=gU(rep.fromId),ab=gU(rep.aboutId);return`<div class="adm-row"><div style="flex:1;"><div style="font-weight:700;">Report about ${ab?.name||'?'}</div><div style="font-size:13px;color:var(--text2);">By ${fr?.name||'?'} · ${rep.reason}</div></div><button class="btn btn-danger btn-sm" onclick="adm('suspend','${rep.aboutId}')">Suspend User</button><button class="btn btn-secondary btn-sm" onclick="adm('dismiss','${rep.id}')">Dismiss</button></div>`;}).join(''):'<div style="color:var(--text2);font-size:14px;">No open reports.</div>'}
    </div>
    <div class="adm-sec"><h2>👥 All Users</h2>
      ${users.filter(u=>u.role!=='admin').map(u=>`<div class="adm-row">${ava(u,36)}<div style="flex:1;"><div style="font-weight:700;">${u.name} <span class="badge ${u.role==='teen'?'badge-blue':u.role==='poster'?'badge-green':'badge-gray'}">${u.role}</span>${u.suspended?'<span class="badge badge-red">Suspended</span>':''}</div><div style="font-size:13px;color:var(--text2);">${u.email} · ${u.verified?'✓ Verified':'Pending'} · ⭐ ${u.ratingCount?u.rating:'—'}</div></div>${!u.suspended?`<button class="btn btn-danger btn-sm" onclick="adm('suspend','${u.id}')">Suspend</button>`:`<button class="btn btn-secondary btn-sm" onclick="adm('unsuspend','${u.id}')">Restore</button>`}${u.role==='poster'&&!u.verified?`<button class="btn btn-primary btn-sm" onclick="adm('verify','${u.id}')">Verify</button>`:''}</div>`).join('')}
    </div>
  `;
}
async function adm(action,id){
  if(action==='dismiss'){const x=DB.get('reports').find(y=>y.id===id);if(x){x.status='closed';await saveDoc('reports',x);}toast('Report dismissed.');renderAdmin();return;}
  const u=gU(id);if(!u)return;
  if(action==='verify'){u.verified=true;toast('Poster verified!');}
  else if(action==='suspend'){u.suspended=true;toast('User suspended.');}
  else if(action==='unsuspend'){u.suspended=false;toast('User restored.');}
  await saveDoc('users',u);renderAdmin();
}

// ── PROFILE ───────────────────────────────────────────────────────────────────
function renderProfile(){
  const user=DB.get('users').find(u=>u.id===CU.id)||CU;
  const ratings=DB.get('ratings').filter(r=>r.toId===user.id);
  const bal=(DB.obj('balances')[user.id]||0).toFixed(2);
  document.getElementById('profile-content').innerHTML=`
    <div class="prof-hdr">
      <div class="prof-avatar" style="background:${'#'+((user.name.charCodeAt(0)*997+user.name.charCodeAt(user.name.length-1)*1009)&0xFFFFFF).toString(16).padStart(6,'0').slice(0,6)}">${user.photo||user.name[0]}</div>
      <div><div style="font-size:26px;font-weight:800;">${user.name}</div>
      <div style="color:var(--text2);">${user.role.charAt(0).toUpperCase()+user.role.slice(1)} · ${user.verified?'✓ Verified':'Pending'}</div>
      ${user.ratingCount?`<div style="margin-top:4px;" class="stars">${stars(user.rating)} <span style="font-size:16px;font-weight:800;color:var(--text);">${user.rating.toFixed(1)}</span> <span style="font-size:13px;color:var(--text2);">(${user.ratingCount} ratings)</span></div>`:'<div style="font-size:13px;color:var(--text2);margin-top:4px;">No ratings yet</div>'}
      ${user.suspended?'<span class="badge badge-red" style="margin-top:6px;">Suspended</span>':''}</div>
    </div>
    <div class="card" style="margin-bottom:16px;"><div style="font-weight:700;margin-bottom:12px;">Mock Wallet</div>
      <div class="bal-row"><div><div style="font-size:13px;color:var(--text2);">Available Balance</div><div style="font-size:32px;font-weight:800;color:var(--green);">$${bal}</div></div></div>
      <div class="mock-note" style="margin-top:12px;">💳 <strong>Demo mode:</strong> In production, payouts would go through Stripe Connect. No real money is involved here.</div>
    </div>
    ${user.bio?`<div class="card" style="margin-bottom:16px;"><p style="color:var(--text2);">${user.bio}</p></div>`:''}
    ${ratings.length?`<div class="card" style="margin-bottom:16px;"><div style="font-weight:700;margin-bottom:14px;">Reviews (${ratings.length})</div>${ratings.slice().reverse().map(r=>{const f=gU(r.fromId);return`<div style="padding:12px 0;border-bottom:1px solid var(--border);"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;"><div style="font-weight:600;font-size:14px;">${f?.name||'?'}</div><div class="stars" style="font-size:14px;">${stars(r.stars)}</div></div>${r.comment?`<div style="font-size:14px;color:var(--text2);">${r.comment}</div>`:''}</div>`;}).join('')}</div>`:''}
    <div class="card" style="margin-bottom:16px;"><div style="font-weight:700;margin-bottom:14px;">Edit Profile</div>
      <div class="fg"><label>Bio</label><textarea id="edit-bio" rows="3" placeholder="Tell the community about yourself…">${user.bio||''}</textarea></div>
      <button class="btn btn-secondary" onclick="saveBio()">Save</button>
    </div>
    <button class="btn btn-danger btn-sm" onclick="showReportModal()">Report / Block a User</button>
  `;
}
async function saveBio(){
  const b=document.getElementById('edit-bio').value.trim();
  const u=gU(CU.id);if(u){u.bio=b;CU.bio=b;await saveDoc('users',u);}toast('Profile updated!');
}
function showReportModal(){
  const users=DB.get('users').filter(u=>u.id!==CU.id);
  document.getElementById('modal-content').innerHTML=`<div class="modal-title">Report / Block a User</div>
    <div class="fg"><label>User</label><select id="rep-user">${users.map(u=>`<option value="${u.id}">${u.name} (${u.role})</option>`).join('')}</select></div>
    <div class="fg"><label>Reason</label><textarea id="rep-reason" rows="3" placeholder="Describe the issue…"></textarea></div>
    <div style="display:flex;gap:10px;"><button class="btn btn-danger" onclick="submitReport()">Submit</button><button class="btn btn-secondary" onclick="closeModal()">Cancel</button></div>`;
  document.getElementById('modal').classList.remove('hidden');
}
async function submitReport(){
  const abt=document.getElementById('rep-user').value,rsn=document.getElementById('rep-reason').value.trim();
  if(!rsn){toast('Please enter a reason.');return;}
  await saveDoc('reports',{id:'rp-'+uid(),fromId:CU.id,aboutId:abt,reason:rsn,status:'open',created:now()});
  closeModal();toast('Report submitted. Admin will review it.');
}

// ── MODAL / TOAST ─────────────────────────────────────────────────────────────
function closeModal(){document.getElementById('modal').classList.add('hidden');}
let _tt;
function toast(msg){const e=document.getElementById('toast');e.textContent=msg;e.classList.add('show');clearTimeout(_tt);_tt=setTimeout(()=>e.classList.remove('show'),3500);}

// ── LANDING ANIMATIONS ────────────────────────────────────────────────────────
(function initEffects(){
  // Canvas particle system for hero
  function initParticles(){
    const canvas=document.getElementById('hero-canvas');if(!canvas)return;
    const ctx=canvas.getContext('2d');let W,H,pts=[];
    function resize(){W=canvas.width=canvas.offsetWidth;H=canvas.height=canvas.offsetHeight;}
    resize();window.addEventListener('resize',resize,{passive:true});
    for(let i=0;i<65;i++)pts.push({x:Math.random()*2000,y:Math.random()*1000,r:Math.random()*1.5+.2,vy:-.12-Math.random()*.3,vx:(Math.random()-.5)*.1,o:Math.random()*.4+.08});
    (function draw(){
      ctx.clearRect(0,0,W,H);
      pts.forEach(p=>{
        ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
        ctx.fillStyle='rgba(74,222,128,'+p.o+')';ctx.fill();
        p.y+=p.vy;p.x+=p.vx;
        if(p.y<-6){p.y=H+6;p.x=Math.random()*W;}
      });
      requestAnimationFrame(draw);
    })();
  }
  initParticles();

  // Scroll reveal via IntersectionObserver — fire as soon as any part enters viewport
  function setupReveal(){
    const els=document.querySelectorAll('.reveal,.reveal-left,.reveal-scale');
    if(!els.length)return;
    const io=new IntersectionObserver(entries=>{
      entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});
    },{threshold:0,rootMargin:'0px 0px 0px 0px'});
    els.forEach(el=>io.observe(el));
  }
  // Defer slightly so layout is fully computed before observing
  setTimeout(setupReveal, 80);

  // Animated counter for stats
  function countUp(el){
    const target=+el.dataset.target,prefix=el.dataset.prefix||'',suffix=el.dataset.suffix||'',dec=el.dataset.decimal?+el.dataset.decimal:0;
    const dur=1800,t0=performance.now();
    (function tick(now){
      const p=Math.min((now-t0)/dur,1),ease=1-Math.pow(1-p,4),val=target*ease;
      el.textContent=prefix+(dec?val.toFixed(dec):Math.round(val).toLocaleString())+suffix;
      if(p<1)requestAnimationFrame(tick);
    })(t0);
  }
  setTimeout(()=>{
    const ioCount=new IntersectionObserver(entries=>{
      entries.forEach(e=>{if(e.isIntersecting){countUp(e.target);ioCount.unobserve(e.target);}});
    },{threshold:.2});
    document.querySelectorAll('.stat-num[data-target]').forEach(el=>ioCount.observe(el));

    const ioLine=new IntersectionObserver(entries=>{
      entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('grow');ioLine.unobserve(e.target);}});
    },{threshold:.2});
    document.querySelectorAll('.steps-line-fill').forEach(el=>ioLine.observe(el));
  },120);

  // 3D tilt on feature cards
  document.querySelectorAll('.feat-card').forEach(card=>{
    card.addEventListener('mousemove',e=>{
      const r=card.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;
      card.style.transform='perspective(700px) rotateX('+(-y*10)+'deg) rotateY('+(x*10)+'deg) translateY(-6px) scale(1.02)';
    });
    card.addEventListener('mouseleave',()=>{card.style.transform='';});
  });

  // Public nav scroll darkening
  const pubNav=document.getElementById('nav-public');
  window.addEventListener('scroll',()=>{
    if(pubNav&&!pubNav.classList.contains('hidden')){
      const s=window.scrollY;
      pubNav.style.background=s>80?'rgba(2,8,4,.96)':'rgba(2,12,5,.7)';
      pubNav.style.boxShadow=s>80?'0 4px 30px rgba(0,0,0,.5)':'none';
    }
  },{passive:true});
})();

// ── PER-PAGE INIT ─────────────────────────────────────────────────────────────
// On the login page, honour ?tab=signup and open the right tab.
if(PAGE==='auth'){
  const tab=new URLSearchParams(location.search).get('tab');
  switchAuthTab(tab==='signup'?'signup':'login');
}
