require("dotenv").config();
const mqtt = require("mqtt");
const admin = require("firebase-admin");

const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL,
});

const db = admin.database();

const MQTT_URL = process.env.MQTT_URL;
const MQTT_BASE = process.env.MQTT_BASE;

const client = mqtt.connect(MQTT_URL);

client.on("connect", () => {
  console.log("Connected to MQTT broker");

  const scanTopic = `${MQTT_BASE}/rfid/scan`;
  const eventsTopic = `${MQTT_BASE}/events`; // Added events listener

  client.subscribe([scanTopic, eventsTopic], (err) => {
    if (err) {
      console.error("Subscribe error:", err);
    } else {
      console.log("Subscribed to:", scanTopic, "and", eventsTopic);
    }
  });
});

client.on("message", async (topic, message) => {
  console.log("\n--- MQTT message received ---");
  console.log("Topic:", topic);
  const msgStr = message.toString().trim();
  console.log("Payload:", msgStr);

  // ==========================================
  // 1. HANDLE ARDUINO EVENTS (OTPs & Sensors)
  // ==========================================
  if (topic === `${MQTT_BASE}/events`) {
    
    // A. Handle OTP Submission
    if (msgStr.startsWith("OTP:")) {
      const enteredOtp = msgStr.split(":")[1];
      console.log(`Checking database for OTP: ${enteredOtp}`);

      try {
        const otpRef = db.ref(`otps/${enteredOtp}`);
        const snapshot = await otpRef.get();

        if (snapshot.exists()) {
          const otpData = snapshot.val();

          if (otpData.status === "unused") {
            console.log(`OTP valid for Locker ${otpData.lockerId}. Opening...`);
            
            // Mark as used in database
            await otpRef.update({ status: "used" });

            // Send command back to NodeMCU
            const commandTopic = `${MQTT_BASE}/commands`;
            const payload = JSON.stringify({
              authorized: "true",
              lockerId: otpData.lockerId.toString()
            });
            client.publish(commandTopic, payload);

            // Log the drop-off event
            await db.ref("logs").push({
              action: "otp_used",
              uid: "-",
              residentName: "Delivery Rider",
              lockerId: otpData.lockerId,
              authorized: true,
              createdAt: admin.database.ServerValue.TIMESTAMP,
            });

          } else {
            console.log("OTP has already been used. Denying access.");
            client.publish(`${MQTT_BASE}/commands`, "DENY");
          }
        } else {
          console.log("OTP not found in database. Denying access.");
          client.publish(`${MQTT_BASE}/commands`, "DENY");
        }
      } catch (error) {
        console.error("Firebase error while checking OTP:", error);
      }
    }

    // B. Handle Hardware Sensor Updates
    else if (msgStr.startsWith("PACKAGE:")) {
      // Example: PACKAGE:2:PRESENT
      const parts = msgStr.split(":");
      const lockerId = parts[1];
      const state = parts[2]; // PRESENT or ABSENT

      const newStatus = state === "PRESENT" ? "occupied" : "vacant";
      await db.ref(`lockers/${lockerId}/status`).set(newStatus);
      console.log(`Updated Locker ${lockerId} status to ${newStatus}`);
    }

    // C. Handle Lock Status Updates (Added to sync with Vue Dashboard)
    else if (msgStr.startsWith("EVENT:")) {
      // Example: EVENT:1:UNLOCKED
      const parts = msgStr.split(":");
      const lockerId = parts[1];
      const status = parts[2]; // LOCKED or UNLOCKED

      if (status === "LOCKED") {
        await db.ref(`lockers/${lockerId}/locked`).set(true);
        console.log(`Updated Locker ${lockerId} lock status to: true (LOCKED)`);
      } else if (status === "UNLOCKED") {
        await db.ref(`lockers/${lockerId}/locked`).set(false);
        console.log(`Updated Locker ${lockerId} lock status to: false (UNLOCKED)`);
      }
    }
    return;
  }

  // ==========================================
  // 2. HANDLE RFID SCANS (Resident Pickup)
  // ==========================================
  if (topic === `${MQTT_BASE}/rfid/scan`) {
    let data;
    try {
      data = JSON.parse(msgStr);
    } catch (error) {
      console.error("Invalid JSON:", error.message);
      return;
    }

    const uid = data.uid;
    if (!uid) return;

    try {
      const userSnapshot = await db.ref(`rfidUsers/${uid}`).get();
      let authorized = false;
      let lockerId = null;
      let residentName = "Unknown";

      if (userSnapshot.exists()) {
        const userData = userSnapshot.val();
        authorized = userData.authorized === true;
        lockerId = userData.lockerId || null;
        residentName = userData.name || "Unnamed";
      }

      const logRef = await db.ref("logs").push({
        uid,
        residentName,
        lockerId,
        authorized,
        action: authorized ? "rfid_authorized" : "rfid_denied",
        source: "NodeMCU_RC522",
        createdAt: admin.database.ServerValue.TIMESTAMP,
      });

      await db.ref("latestScan").set({
        uid, residentName, lockerId, authorized,
        logId: logRef.key, updatedAt: admin.database.ServerValue.TIMESTAMP,
      });

      if (lockerId !== null && authorized) {
        // Send unlock command to NodeMCU
        const commandTopic = `${MQTT_BASE}/commands`;
        const payload = JSON.stringify({
          authorized: "true",
          lockerId: lockerId.toString()
        });
        client.publish(commandTopic, payload);
      } else {
        client.publish(`${MQTT_BASE}/commands`, "DENY");
      }
    } catch (error) {
      console.error("Firebase error on RFID scan:", error);
    }
  }
});