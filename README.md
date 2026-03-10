# 🔥 CAULDRON — Synchronized Training Timer

American Drenger Defense System | Belt Progression Timer

---

## SETUP (One-Time)

### Requirements
- Node.js installed on the master device (the one running the timer)
- All devices on the **same WiFi network**

### Install
```bash
cd cauldron
npm install
```

### Run the server
```bash
node server.js
```

You'll see output like:
```
🔥 CAULDRON SERVER RUNNING
──────────────────────────────────
  Local:   http://localhost:3000
  Network: http://192.168.1.45:3000   ← THIS IS YOUR IP
──────────────────────────────────
```

---

## USING THE APP

### MASTER (Instructor)
1. Open `http://YOUR_IP:3000` in your phone browser
2. Enter your **Network IP** in the SERVER IP field (e.g. `192.168.1.45`)
3. Pick a belt color → Select **MASTER**
4. Share the **4-letter session code** with your students
5. Hit **START CAULDRON** → control the timer for everyone

### STUDENTS
1. Open `http://YOUR_IP:3000` on their phone (same WiFi)
2. Enter the same IP in SERVER IP
3. Pick the same belt → Select **STUDENT**
4. Enter the session code → **JOIN SESSION**
5. Their screen mirrors the master's timer exactly

---

## MUSIC (Your Suno Tracks)

1. In the timer screen, tap 🎵 briefly to **play/pause music**
2. Long-press 🎵 (hold 0.6s) to **open the music drawer**
3. Paste your Suno **direct audio URL** for each belt
4. Tap **SAVE TRACKS** — URLs are remembered on that device
5. Music plays locally on each device (each person pastes their own URLs)

**To get a Suno direct audio URL:**
- Open your track on suno.com
- Right-click the audio → "Copy audio address"
- Or use the share link → look for the `.mp3` URL

---

## BELT COLORS & TIMING

| Belt   | Transition        | Rounds | Work | Rest |
|--------|-------------------|--------|------|------|
| 🟡 Yellow | White → Yellow  | 8      | 60s  | 30s  |
| 🟠 Orange | Yellow → Orange | 8      | 60s  | 30s  |
| 🟢 Green  | Orange → Green  | 8      | 60s  | 30s  |
| 🔵 Blue   | Green → Blue    | 8      | 60s  | 30s  |

Each 30-second rest interval advances the **active technique step** (1→2→3→4).

---

## HOW THE SYNC WORKS

- The master device runs a **Node.js WebSocket server** on your local WiFi
- Every tick, the master broadcasts timer state to all connected students
- If master **pauses**, everyone pauses simultaneously
- If connection drops, students see a banner and the app reconnects automatically

---

## TIPS

- **Keep screen on**: The app uses the Wake Lock API to prevent sleep during training
- **Bookmark it**: Add to home screen on iOS/Android for full-screen feel
  - iOS: Safari → Share → Add to Home Screen
  - Android: Chrome → Menu → Add to Home Screen
- **Solo practice**: Students can also tap "Practice solo" to use the timer independently

---

## FILES

```
cauldron/
├── server.js          ← WebSocket + HTTP server (run this)
├── public/
│   └── index.html     ← The entire app (master + student)
├── package.json
└── README.md
```
