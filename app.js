// ==================== Configuration ====================
const SUPABASE_URL = 'https://uvytcbkxhhhgnikujvms.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2eXRjYmt4aGhoZ25pa3Vqdm1zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0MTQ0NzIsImV4cCI6MjA3Njk5MDQ3Mn0.XcaHyWsYcp5e349MWojgRowknACstDWb1JKzh72NPpw';
const ROW_ID = 1;

// ==================== Initialize Supabase ====================
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  realtime: { params: { eventsPerSecond: 40 } }
});

// ==================== Application State ====================
let state = {
  mode: 'milk',
  target_count: 3,
  current_count: 0,
  is_running: false
};

let appWriteAt = 0; // Timestamp for echo suppression

// ==================== DOM Elements ====================
const milkBtn = document.getElementById('milkBtn');
const cookBtn = document.getElementById('cookBtn');
const timerBtn = document.getElementById('timerBtn');
const connBox = document.getElementById('conn');
const modeTxt = document.getElementById('modeTxt');
const tgtTxt = document.getElementById('tgtTxt');
const cntTxt = document.getElementById('cntTxt');
const runTxt = document.getElementById('runTxt');
const progBox = document.getElementById('progBox');
const fill = document.getElementById('fill');
const ctl1 = document.getElementById('ctl1');
const bigTgt = document.getElementById('bigTgt');
const tgRow = document.getElementById('tgRow');
const ctRow = document.getElementById('ctRow');
const tgLabel = document.getElementById('tgLabel');
const ctLabel = document.getElementById('ctLabel');

// ==================== Helper Functions ====================
function secToMMSS(seconds) {
  seconds = Number(seconds) || 0;
  const m = Math.floor(seconds / 60);
  const ss = ('0' + (seconds % 60)).slice(-2);
  return `${m}:${ss}`;
}

function setConn(ok) {
  connBox.className = 'conn ' + (ok ? 'ok' : 'bad');
  connBox.textContent = ok ? '✅ Live' : '❌ Offline';
}

function getStep() {
  return state.mode === 'timer' ? 30 : 1;
}

// ==================== UI Rendering ====================
function render() {
  const m = state.mode;
  
  // Mode text and button states
  modeTxt.textContent = m === 'milk' ? 'MILK' : m === 'cooker' ? 'COOKER' : 'TIMER';
  milkBtn.classList.toggle('active', m === 'milk');
  cookBtn.classList.toggle('active', m === 'cooker');
  timerBtn.classList.toggle('active', m === 'timer');

  // Big display
  bigTgt.textContent = m === 'timer' ? secToMMSS(state.target_count) : state.target_count;

  // Target row
  if (m === 'timer') {
    tgLabel.textContent = 'Target';
    tgtTxt.textContent = secToMMSS(state.target_count);
  } else {
    tgLabel.textContent = 'Target';
    tgtTxt.textContent = state.target_count;
  }

  // Count row
  if (m === 'timer') {
    ctRow.style.display = 'flex';
    ctLabel.textContent = 'Elapsed';
    cntTxt.textContent = secToMMSS(state.current_count);
  } else if (m === 'cooker') {
    ctRow.style.display = 'flex';
    ctLabel.textContent = 'Count';
    cntTxt.textContent = state.current_count;
  } else {
    ctRow.style.display = 'none';
  }

  // Target adjustment controls
  ctl1.style.display = (m === 'cooker' || m === 'timer') ? 'flex' : 'none';

  // Progress bar
  progBox.style.display = (m === 'timer' || m === 'cooker') ? 'block' : 'none';

  let pct = 0;
  if (m === 'timer' && state.target_count > 0) {
    pct = Math.min(100, 100 * state.current_count / state.target_count);
  } else if (m === 'cooker' && state.target_count > 0) {
    pct = Math.min(100, 100 * state.current_count / state.target_count);
  }
  fill.style.width = pct + '%';
  fill.textContent = pct ? Math.round(pct) + '%' : '0%';

  // Running status
  runTxt.innerHTML = state.is_running
    ? '<span class="status run">RUNNING</span>'
    : '<span class="status halt">STOPPED</span>';
}

// ==================== Data Loading ====================
async function loadOnce() {
  const { data, error } = await sb
    .from('cooking_system')
    .select('mode,target_count,current_count,is_running')
    .eq('id', ROW_ID)
    .single();

  if (!error && data) {
    state = data;
    render();
    setConn(true);
  } else {
    setConn(false);
  }
}

// ==================== Realtime Subscription ====================
function subRealtime() {
  sb.channel('smartkitchen_rt')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'cooking_system',
      filter: `id=eq.${ROW_ID}`
    }, (payload) => {
      const row = payload.new || payload.old;
      if (!row) return;

      // Suppress echo from our own writes
      if (Date.now() - appWriteAt < 250) return;

      // Update state from realtime event
      state = {
        mode: row.mode,
        target_count: row.target_count,
        current_count: row.current_count,
        is_running: row.is_running
      };
      render();
    })
    .subscribe(status => {
      setConn(status === 'SUBSCRIBED');
    });
}

// ==================== Control Functions ====================
async function setMode(mode) {
  if (!['milk', 'cooker', 'timer'].includes(mode)) return;

  // Optimistic update
  state.mode = mode;
  state.is_running = false;
  state.current_count = 0;
  render();

  // Write to database
  appWriteAt = Date.now();
  await sb.from('cooking_system')
    .update({
      mode,
      is_running: false,
      current_count: 0
    })
    .eq('id', ROW_ID);
}

async function changeTarget(dir) {
  const step = getStep();
  let next = state.target_count + dir * step;

  // Apply limits based on mode
  if (state.mode === 'cooker') {
    next = Math.max(1, Math.min(20, next));
  } else if (state.mode === 'timer') {
    next = Math.max(30, Math.min(3600, next));
  } else {
    return;
  }

  // Optimistic update
  state.target_count = next;
  render();

  // Write to database
  appWriteAt = Date.now();
  await sb.from('cooking_system')
    .update({ target_count: next })
    .eq('id', ROW_ID);
}

async function toggleRun(run) {
  // Optimistic update
  state.is_running = !!run;
  if (run && state.mode !== 'milk') {
    state.current_count = 0;
  }
  render();

  // Prepare update object
  const upd = run
    ? { is_running: true, ...(state.mode !== 'milk' ? { current_count: 0 } : {}) }
    : { is_running: false };

  // Write to database
  appWriteAt = Date.now();
  await sb.from('cooking_system')
    .update(upd)
    .eq('id', ROW_ID);
}
// ============================================
// PWA Installation & Service Worker
// ============================================

let deferredPrompt;
const installContainer = document.getElementById('installContainer');
const installBtn = document.getElementById('installBtn');
const updateNotification = document.getElementById('updateNotification');
const reloadBtn = document.getElementById('reloadBtn');

// Register Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/robotics/service-worker.js', {
      scope: '/robotics/'
    })
      .then((registration) => {
        console.log('[PWA] Service Worker registered:', registration.scope);
        
        // Check for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New version available
              console.log('[PWA] New version available');
              updateNotification.style.display = 'flex';
            }
          });
        });
      })
      .catch((error) => {
        console.error('[PWA] Service Worker registration failed:', error);
      });
  });
}

// Reload app when update button clicked
if (reloadBtn) {
  reloadBtn.addEventListener('click', () => {
    window.location.reload();
  });
}

// Before Install Prompt (Install Button)
window.addEventListener('beforeinstallprompt', (e) => {
  console.log('[PWA] Before install prompt fired');
  e.preventDefault();
  deferredPrompt = e;
  
  // Show install button (only if not already installed)
  if (!window.matchMedia('(display-mode: standalone)').matches) {
    installContainer.style.display = 'block';
  }
});

// Install Button Click
if (installBtn) {
  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) {
      console.log('[PWA] Install prompt not available');
      return;
    }
    
    // Show install prompt
    deferredPrompt.prompt();
    
    // Wait for user choice
    const { outcome } = await deferredPrompt.userChoice;
    console.log('[PWA] User choice:', outcome);
    
    if (outcome === 'accepted') {
      console.log('[PWA] App installed');
    }
    
    // Clear the prompt
    deferredPrompt = null;
    installContainer.style.display = 'none';
  });
}

// App Installed (Hide install button)
window.addEventListener('appinstalled', () => {
  console.log('[PWA] App installed successfully');
  installContainer.style.display = 'none';
  deferredPrompt = null;
});

// Detect if running as installed app
if (window.matchMedia('(display-mode: standalone)').matches) {
  console.log('[PWA] Running as installed app');
  installContainer.style.display = 'none';
}

// Handle URL parameters (shortcuts)
const urlParams = new URLSearchParams(window.location.search);
const modeParam = urlParams.get('mode');
if (modeParam && ['milk', 'cooker', 'timer'].includes(modeParam)) {
  // Wait for app to load, then set mode
  setTimeout(() => {
    setMode(modeParam);
  }, 1000);
}

// Online/Offline Detection
window.addEventListener('online', () => {
  console.log('[PWA] Back online');
  setConn(true);
});

window.addEventListener('offline', () => {
  console.log('[PWA] Offline mode');
  setConn(false);
});

// ==================== Initialize App ====================
loadOnce().then(subRealtime);
