<template>
  <main class="page">
    <div v-if="isLoading" class="loader-overlay">
      <div class="spinner"></div>
      <p>Initializing DropSafe...</p>
    </div>
    
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
            <p style="margin-bottom: 15px;">
              <span :class="locker.status === 'vacant' ? 'status-secure' : 'status-alert'">
                Status: {{ locker.status === 'vacant' ? 'Empty' : 'Package Inside' }}
              </span>
            </p>
            <p style="font-size: 12px; color: var(--text-muted); font-family: monospace;">Assigned UID: {{ locker.assignedUid || "none" }}</p>
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

const isLoggedIn = ref(false);
const inputUsername = ref('');
const inputPassword = ref('');
const loginError = ref('');
const activeUserKey = ref('');
const isLoading = ref(true); // Added loading state

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

  setTimeout(() => {
    isLoading.value = false;
  }, 1500);
});
</script>

<style>
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

:root {
  --bg-page: #0B0F19;
  --bg-card: #131A2A;
  --bg-panel: rgba(26, 34, 53, 0.6);
  --bg-input: #1F2937;
  --border-color: rgba(255, 255, 255, 0.08);
  --grad-primary: linear-gradient(135deg, #6366F1 0%, #A855F7 100%);
  --grad-alert: linear-gradient(135deg, #FF512F 0%, #F09819 100%);
  --accent-purple: #8B5CF6;
  --accent-cyan: #06B6D4;
  --text-main: #F8FAFC;
  --text-muted: #CBD5E1;
}

body { margin: 0; font-family: 'Plus Jakarta Sans', sans-serif; background: var(--bg-page); color: var(--text-main); }
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.02); border-radius: 10px; }
::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.15); border-radius: 10px; }

/* Loading Overlay */
.loader-overlay {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: var(--bg-page); display: flex; flex-direction: column;
  justify-content: center; align-items: center; z-index: 9999;
}
.spinner {
  width: 50px; height: 50px; border: 4px solid rgba(139, 92, 246, 0.2);
  border-left-color: var(--accent-purple); border-radius: 50%;
  animation: spin 1s linear infinite; margin-bottom: 20px;
}
@keyframes spin { to { transform: rotate(360deg); } }
.loader-overlay p {
  color: var(--text-muted); font-weight: 500; letter-spacing: 1px;
  animation: pulse 2s infinite;
}
@keyframes pulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }

.page { padding: 40px 20px; display: flex; justify-content: center; align-items: center; min-height: 100vh; box-sizing: border-box; }
.card { width: 100%; max-width: 1150px; background: var(--bg-card); border-radius: 24px; padding: 40px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7); border: 1px solid var(--border-color); }
.login-card { max-width: 420px; padding: 50px 40px; }

h1 { 
  font-weight: 800; font-size: 36px; letter-spacing: -1px; margin-bottom: 5px; 
  background: var(--grad-primary); background-clip: text; -webkit-background-clip: text; -webkit-text-fill-color: transparent;
}
.subtitle { color: var(--text-muted); font-size: 15px; font-weight: 500; }

.input-group input {
  width: 100%; padding: 16px; background: var(--bg-input); border: 1px solid var(--border-color); 
  border-radius: 10px; font-size: 15px; color: var(--text-main);
}

.login-btn {
  background: var(--grad-primary); color: #FFF; font-weight: 700; padding: 16px; 
  border-radius: 10px; width: 100%; cursor: pointer;
}

.generate-btn {
  background: var(--grad-alert); color: #FFF; font-weight: 700; padding: 18px; 
  border-radius: 16px; width: 100%; cursor: pointer;
}

.otp-code { 
  font-size: 48px; font-weight: 800; letter-spacing: 16px; margin: 15px 0; 
  background: var(--grad-alert); background-clip: text; -webkit-background-clip: text; -webkit-text-fill-color: transparent; 
  display: block; 
}

.panel { background: var(--bg-panel); border-radius: 16px; padding: 30px; border: 1px solid var(--border-color); }

.status-secure { 
  background: rgba(6, 182, 212, 0.1); color: var(--accent-cyan); 
  padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 800; border: 1px solid rgba(6, 182, 212, 0.3);
}
.status-alert { 
  background: rgba(249, 115, 22, 0.1); color: #F97316; 
  padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 800; border: 1px solid rgba(249, 115, 22, 0.3);
}

.table-container { max-height: 400px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 10px; }
table { width: 100%; border-collapse: collapse; }
th { background: rgba(255,255,255,0.03); padding: 16px; text-transform: uppercase; font-size: 11px; color: var(--text-muted); }
td { padding: 16px; border-bottom: 1px solid var(--border-color); }
</style>