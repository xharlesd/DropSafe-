<template>
  <main class="page">
    
    <section class="card login-card" v-if="!isLoggedIn">
      <div class="login-header">
        <h1>DropSafe</h1>
        <p class="subtitle">Secure Home Delivery Lockbox</p>
      </div>

      <div class="login-form">
        <div class="input-group">
          <label>Username</label>
          <input type="text" v-model="inputUsername" placeholder="Enter username" @keyup.enter="handleLogin">
        </div>
        
        <div class="input-group">
          <label>Password</label>
          <input type="password" v-model="inputPassword" placeholder="Enter password" @keyup.enter="handleLogin">
        </div>

        <p class="error-msg" v-if="loginError">{{ loginError }}</p>

        <button class="login-btn" @click="handleLogin">Log In</button>
      </div>
    </section>

    <section class="card" v-else>
      <div class="header-bar">
        <div>
          <h1>DropSafe Dashboard</h1>
          <p class="subtitle">RFID, OTP, locker status, and history monitor</p>
        </div>
        
        <div class="user-profile">
          <p>Logged in as: <strong>{{ activeUser.name }}</strong></p>
          <button class="logout-btn" @click="handleLogout">Log Out</button>
        </div>
      </div>

      <div class="grid">
        <div class="panel">
          <h2>Latest RFID Scan</h2>
          <p><strong>UID:</strong> <span class="data-highlight">{{ latestScan.uid || "None" }}</span></p>
          <p><strong>Resident:</strong> {{ latestScan.residentName || "None" }}</p>
          <p>
            <strong>Authorized:</strong>
            <span :class="latestScan.authorized ? 'status-secure' : 'status-alert'" style="margin-left: 8px;">
              {{ latestScan.authorized === true ? "Yes" : latestScan.authorized === false ? "No" : "None" }}
            </span>
          </p>
          <p><strong>Locker:</strong> {{ latestScan.lockerId || "None" }}</p>
        </div>

        <div class="panel" v-if="activeUser.role === 'resident'">
          <h2>Generate OTP</h2>
          
          <div class="resident-info">
            <p>Welcome, <strong>{{ activeUser.name }}</strong>.</p>
            <p style="margin-top: 5px;">You are authorized to generate an OTP for <strong>Locker {{ activeUser.lockerId }}</strong>.</p>
          </div>

          <button class="generate-btn" @click="generateOtp">Generate OTP for Locker {{ activeUser.lockerId }}</button>

          <div v-if="generatedOtp" class="otp-display">
            <p class="subtitle" style="margin:0; font-weight: 600; color: var(--text-main);">Give this code to your delivery rider:</p>
            <span class="otp-code">{{ generatedOtp }}</span>
          </div>
        </div>
        
        <div class="panel admin-notice" v-if="activeUser.role === 'admin'">
          <h2>Administrator Mode</h2>
          <p style="font-weight: 600; color: var(--accent-cyan);">You have overarching monitoring access.</p>
          <p style="color: var(--text-muted); margin-top: 10px; font-size: 14px;"><em>OTP generation is disabled for administrators to maintain resident privacy and trust.</em></p>
        </div>
      </div>

      <div class="panel" style="margin-top: 30px;">
        <h2>Locker Status</h2>
        <div class="locker-grid">
          <div class="locker" v-for="locker in lockerList" :key="locker.id">
            <h3>Locker {{ locker.id }}</h3>
            
            <div class="badge-container">
              <span :class="locker.status === 'vacant' ? 'status-secure' : (locker.status === 'reserved' ? 'status-pending' : 'status-alert')">
                {{ locker.status === 'vacant' ? 'Empty' : (locker.status === 'reserved' ? 'Awaiting Delivery' : 'Package Inside') }}
              </span>
              
              <span :class="locker.locked !== false ? 'status-secure' : 'status-alert'">
                <i class="icon-lock"></i> {{ locker.locked !== false ? 'Locked' : 'Unlocked' }}
              </span>
            </div>

            <p style="font-size: 12px; color: var(--text-muted); font-family: monospace; margin-top: 15px; margin-bottom: 0;">Assigned UID: {{ locker.assignedUid || "none" }}</p>
          </div>
        </div>
      </div>

      <div class="panel" style="margin-top: 30px;">
        <h2>History Log</h2>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>Action</th>
                <th>UID</th>
                <th>Resident / User</th>
                <th>Locker</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="log in filteredLogs" :key="log.id">
                <td style="color: var(--text-muted); font-size: 13px;">{{ formatTime(log.createdAt) }}</td>
                <td><span class="action-badge">{{ log.action }}</span></td>
                <td style="font-family: monospace; color: var(--text-muted);">{{ log.uid || "-" }}</td>
                <td style="font-weight: 600;">{{ log.residentName || "-" }}</td>
                <td>{{ log.lockerId || "-" }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  </main>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { db } from "./firebase";
import { ref as dbRef, onValue, set, push, serverTimestamp } from "firebase/database";

// --- Prototype Authentication Logic ---
const isLoggedIn = ref(false);
const inputUsername = ref('');
const inputPassword = ref('');
const loginError = ref('');
const activeUserKey = ref('');

const users = {
  admin: { username: 'admin', password: 'admin123', name: 'Administrator', role: 'admin' },
  res1: { username: 'res1', password: 'pass123', name: 'Resident 1', role: 'resident', lockerId: 1 },
  res2: { username: 'res2', password: 'pass123', name: 'Resident 2', role: 'resident', lockerId: 2 },
  res3: { username: 'res3', password: 'pass123', name: 'Resident 3', role: 'resident', lockerId: 3 }
};

const activeUser = computed(() => users[activeUserKey.value] || {});

function handleLogin() {
  loginError.value = '';
  const foundUserKey = Object.keys(users).find(key => 
    users[key].username === inputUsername.value && 
    users[key].password === inputPassword.value
  );

  if (foundUserKey) {
    activeUserKey.value = foundUserKey;
    isLoggedIn.value = true;
    inputPassword.value = ''; 
  } else {
    loginError.value = 'Invalid username or password.';
  }
}

function handleLogout() {
  isLoggedIn.value = false;
  activeUserKey.value = '';
  inputUsername.value = '';
  generatedOtp.value = ''; 
}
// ---------------------------------

const latestScan = ref({});
const lockers = ref({});
const logsRaw = ref({});
const generatedOtp = ref("");

const lockerList = computed(() => {
  const allLockers = Object.entries(lockers.value || {}).map(([id, data]) => ({ id, ...data }));
  if (activeUser.value.role === 'admin') {
    return allLockers;
  } else {
    return allLockers.filter(locker => Number(locker.id) === activeUser.value.lockerId);
  }
});

const filteredLogs = computed(() => {
  const allLogs = Object.entries(logsRaw.value || {})
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  if (activeUser.value.role === 'admin') {
    return allLogs.slice(0, 50); 
  } else {
    return allLogs.filter(log => log.lockerId === activeUser.value.lockerId).slice(0, 20); 
  }
});

function createFourDigitOtp() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

async function generateOtp() {
  if (activeUser.value.role !== 'resident') return;
  const code = createFourDigitOtp();
  const lockerTarget = activeUser.value.lockerId;
  generatedOtp.value = code;

  await set(dbRef(db, `otps/${code}`), {
    code,
    lockerId: lockerTarget,
    status: "unused",
    createdAt: serverTimestamp(),
  });

  await set(dbRef(db, `lockers/${lockerTarget}/status`), "reserved");

  await push(dbRef(db, "logs"), {
    action: "otp_generated",
    uid: "-",
    residentName: activeUser.value.name,
    lockerId: lockerTarget,
    authorized: true,
    otp: code,
    createdAt: serverTimestamp(),
  });
}

function formatTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

onMounted(() => {
  onValue(dbRef(db, "latestScan"), (snapshot) => { latestScan.value = snapshot.val() || {}; });
  onValue(dbRef(db, "lockers"), (snapshot) => { lockers.value = snapshot.val() || {}; });
  onValue(dbRef(db, "logs"), (snapshot) => { logsRaw.value = snapshot.val() || {}; });
});
</script>

<style>
/* --- THEME: MODERN GRADIENT & GLASSMORPHISM --- */
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

:root {
  --bg-page: #0B0F19;
  --bg-card: #131A2A;
  --bg-panel: rgba(26, 34, 53, 0.6);
  --bg-input: #1F2937;
  --border-color: rgba(255, 255, 255, 0.08);

  --grad-primary: linear-gradient(135deg, #6366F1 0%, #A855F7 100%); 
  --grad-alert: linear-gradient(135deg, #FF512F 0%, #F09819 100%); 
  --grad-secure: linear-gradient(135deg, #00C9FF 0%, #92FE9D 100%); 
  
  --accent-purple: #8B5CF6;
  --accent-orange: #F97316;
  --accent-cyan: #06B6D4;

  --text-main: #F8FAFC;
  --text-muted: #CBD5E1; 
  
  --glow-primary: 0 8px 25px -5px rgba(139, 92, 246, 0.5);
  --glow-alert: 0 8px 25px -5px rgba(249, 115, 22, 0.4);
  
  --radius-lg: 24px;
  --radius-md: 16px;
  --radius-sm: 10px;
}

body {
  margin: 0;
  font-family: 'Plus Jakarta Sans', sans-serif;
  background: var(--bg-page);
  background-image: 
    radial-gradient(at 0% 0%, rgba(99, 102, 241, 0.15) 0px, transparent 50%),
    radial-gradient(at 100% 100%, rgba(249, 115, 22, 0.1) 0px, transparent 50%);
  color: var(--text-main);
}

::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.02); border-radius: 10px; }
::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.15); border-radius: 10px; }
::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.25); }
::placeholder { color: var(--text-muted); opacity: 0.7; }

.page {
  padding: 40px 20px;
  display: flex;
  justify-content: center;
  align-items: center; 
  min-height: 100vh; 
  box-sizing: border-box; 
}

.card {
  width: 100%;
  max-width: 1150px;
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: 40px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
  border: 1px solid var(--border-color);
  backdrop-filter: blur(12px);
}

.login-card {
  max-width: 420px;
  margin: auto; 
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 50px 40px;
}

h1 { 
  font-weight: 800; font-size: 36px; letter-spacing: -1px; margin-bottom: 5px; 
  background: var(--grad-primary); background-clip: text;
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
}
h2 { font-weight: 700; font-size: 19px; color: var(--text-main); margin-top: 0; margin-bottom: 20px; }
h3 { font-weight: 700; font-size: 16px; color: var(--text-main); margin: 0 0 15px 0;}
.subtitle { color: var(--text-muted); font-size: 15px; margin-top: 0; font-weight: 500;}

.input-group { margin-bottom: 22px; }
.input-group label { display: block; font-size: 13px; font-weight: 600; color: var(--text-muted); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;}
.input-group input {
  width: 100%; padding: 16px; background: var(--bg-input); border: 1px solid var(--border-color); 
  border-radius: var(--radius-sm); font-size: 15px; color: var(--text-main); box-sizing: border-box; transition: all 0.3s ease;
}
.input-group input:focus { outline: none; border-color: var(--accent-purple); box-shadow: 0 0 0 4px rgba(139, 92, 246, 0.15); }
.error-msg { color: #F87171; font-size: 14px; text-align: center; margin-bottom: 15px; font-weight: 600; background: rgba(248, 113, 113, 0.1); padding: 10px; border-radius: 8px;}

.login-btn {
  background: var(--grad-primary); color: #FFF; font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 700; font-size: 16px;
  padding: 16px; border: none; border-radius: var(--radius-sm); cursor: pointer; width: 100%; 
  transition: all 0.3s ease; box-shadow: var(--glow-primary);
}
.login-btn:hover { transform: translateY(-2px); box-shadow: 0 12px 30px -5px rgba(139, 92, 246, 0.6); filter: brightness(1.1);}

.generate-btn {
  background: var(--grad-alert); color: #FFF; font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 700; font-size: 16px;
  padding: 18px 24px; border: none; border-radius: var(--radius-md); cursor: pointer;
  width: 100%; transition: all 0.3s ease; box-shadow: var(--glow-alert);
}
.generate-btn:hover { transform: translateY(-2px); box-shadow: 0 12px 30px -5px rgba(249, 115, 22, 0.6); filter: brightness(1.1);}
.generate-btn:active { transform: scale(0.98); }

.logout-btn {
  background: rgba(255, 255, 255, 0.05); color: var(--text-muted); border: 1px solid var(--border-color); padding: 10px 18px;
  border-radius: var(--radius-sm); font-weight: 600; cursor: pointer; transition: all 0.2s; font-size: 13px;
}
.logout-btn:hover { background: rgba(248, 113, 113, 0.1); color: #F87171; border-color: rgba(248, 113, 113, 0.3); }

.header-bar {
  display: flex; justify-content: space-between; align-items: center;
  border-bottom: 1px solid var(--border-color); padding-bottom: 25px; margin-bottom: 30px;
}
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; }
.panel {
  background: var(--bg-panel); border-radius: var(--radius-md); padding: 30px;
  border: 1px solid var(--border-color); box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(8px);
}

.user-profile {
  background: rgba(255, 255, 255, 0.03); padding: 12px 24px; border-radius: 50px;
  border: 1px solid var(--border-color); display: flex; align-items: center; gap: 20px;
}
.user-profile p { margin: 0; font-size: 14px; font-weight: 500;}
.resident-info { 
  background: rgba(139, 92, 246, 0.08); padding: 18px; border-radius: var(--radius-sm); 
  border-left: 4px solid var(--accent-purple); margin-bottom: 25px; color: var(--text-main); font-size: 14px;
}
.admin-notice { border-left: 4px solid var(--accent-cyan); padding-left: 15px; background: rgba(6, 182, 212, 0.05); }
.data-highlight { color: #FFF; font-family: monospace; font-size: 15px; background: rgba(255, 255, 255, 0.1); padding: 4px 8px; border-radius: 6px; letter-spacing: 1px;}

.otp-display {
  margin-top: 25px; text-align: center; background: rgba(249, 115, 22, 0.08); padding: 30px;
  border-radius: var(--radius-md); border: 1px solid rgba(249, 115, 22, 0.2);
}
.otp-code { 
  font-size: 48px; font-weight: 800; letter-spacing: 16px; margin: 15px 0 5px 16px; 
  background: var(--grad-alert); background-clip: text; -webkit-background-clip: text; -webkit-text-fill-color: transparent; 
  display: block; 
}

.locker-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
.locker {
  background: rgba(255, 255, 255, 0.02); border-radius: var(--radius-md); padding: 25px 20px;
  text-align: center; border: 1px solid var(--border-color); transition: all 0.3s ease;
  display: flex; flex-direction: column; justify-content: center; align-items: center;
}
.locker:hover { background: rgba(255, 255, 255, 0.04); transform: translateY(-3px); }

/* NEW: Badge Container for dual statuses */
.badge-container {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-bottom: 10px;
}

.status-secure { 
  background: rgba(6, 182, 212, 0.1); color: var(--accent-cyan); 
  padding: 8px 16px; border-radius: 30px; font-size: 12px; font-weight: 800; 
  text-transform: uppercase; border: 1px solid rgba(6, 182, 212, 0.3); letter-spacing: 0.5px;
}

.status-alert { 
  background: rgba(249, 115, 22, 0.1); color: var(--accent-orange); 
  padding: 8px 16px; border-radius: 30px; font-size: 12px; font-weight: 800; 
  text-transform: uppercase; border: 1px solid rgba(249, 115, 22, 0.3); letter-spacing: 0.5px;
}

/* NEW: Styling for the Awaiting Delivery state */
.status-pending { 
  background: rgba(139, 92, 246, 0.1); 
  color: var(--accent-purple); 
  padding: 8px 16px; border-radius: 30px; font-size: 12px; font-weight: 800; 
  text-transform: uppercase; border: 1px solid rgba(139, 92, 246, 0.3); letter-spacing: 0.5px;
}

.table-container { max-height: 400px; overflow-y: auto; border-radius: var(--radius-sm); border: 1px solid var(--border-color); }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { padding: 18px 16px; border-bottom: 1px solid var(--border-color); text-align: left; }
th { background-color: rgba(255, 255, 255, 0.03); color: var(--text-muted); font-weight: 600; position: sticky; top: 0; text-transform: uppercase; font-size: 12px; letter-spacing: 1px; backdrop-filter: blur(10px);}
tbody tr { transition: background 0.2s; }
tbody tr:hover { background-color: rgba(255, 255, 255, 0.03); }
.action-badge { background: rgba(255, 255, 255, 0.08); color: var(--text-main); padding: 6px 12px; border-radius: 6px; font-family: monospace; font-size: 12px; font-weight: 500; }
</style>