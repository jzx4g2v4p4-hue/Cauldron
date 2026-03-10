/**
 * CAULDRON SYNC SERVER
 * Run: node server.js
 * Master connects to ws://YOUR_LOCAL_IP:3000
 * Students connect to the same IP — shown in the app
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve the client app
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ── Session store ──────────────────────────────────────────────
// sessions[code] = { master: ws, students: Set<ws>, state: {} }
const sessions = {};

function getLocalIP() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '127.0.0.1';
}

function broadcast(session, message, exclude = null) {
  const msg = JSON.stringify(message);
  if (session.master && session.master !== exclude && session.master.readyState === WebSocket.OPEN) {
    session.master.send(msg);
  }
  for (const student of session.students) {
    if (student !== exclude && student.readyState === WebSocket.OPEN) {
      student.send(msg);
    }
  }
}

function countClients(session) {
  return (session.master ? 1 : 0) + session.students.size;
}

// ── WebSocket handler ──────────────────────────────────────────
wss.on('connection', (ws) => {
  let role = null;
  let code = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {

      // Master creates a session
      case 'create': {
        code = msg.code;
        role = 'master';
        if (!sessions[code]) {
          sessions[code] = { master: null, students: new Set(), state: {} };
        }
        sessions[code].master = ws;
        ws.send(JSON.stringify({ type: 'created', code }));
        console.log(`[+] Master created session ${code}`);
        break;
      }

      // Student joins
      case 'join': {
        code = msg.code;
        role = 'student';
        const session = sessions[code];
        if (!session) {
          ws.send(JSON.stringify({ type: 'error', message: 'Session not found' }));
          return;
        }
        session.students.add(ws);
        // Send current state to new student
        if (Object.keys(session.state).length > 0) {
          ws.send(JSON.stringify({ type: 'state', ...session.state }));
        }
        // Tell master how many students
        if (session.master && session.master.readyState === WebSocket.OPEN) {
          session.master.send(JSON.stringify({
            type: 'students',
            count: session.students.size
          }));
        }
        ws.send(JSON.stringify({ type: 'joined', code }));
        console.log(`[+] Student joined ${code} (${session.students.size} students)`);
        break;
      }

      // Master broadcasts timer state to all students
      case 'state': {
        if (!code || !sessions[code]) return;
        sessions[code].state = msg;
        broadcast(sessions[code], msg, ws); // exclude sender
        break;
      }

      // Master sends a control command (play/pause/reset/next)
      case 'control': {
        if (!code || !sessions[code]) return;
        broadcast(sessions[code], msg, ws);
        break;
      }
    }
  });

  ws.on('close', () => {
    if (!code || !sessions[code]) return;
    const session = sessions[code];
    if (role === 'master') {
      session.master = null;
      broadcast(session, { type: 'master_disconnected' });
      console.log(`[-] Master left session ${code}`);
      // Clean up empty session after delay
      setTimeout(() => {
        if (!sessions[code]?.master) delete sessions[code];
      }, 60000);
    } else if (role === 'student') {
      session.students.delete(ws);
      if (session.master && session.master.readyState === WebSocket.OPEN) {
        session.master.send(JSON.stringify({
          type: 'students',
          count: session.students.size
        }));
      }
      console.log(`[-] Student left ${code} (${session.students.size} remaining)`);
    }
  });

  ws.on('error', () => ws.terminate());
});

// ── Start ──────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log('\n🔥 CAULDRON SERVER RUNNING');
  console.log('──────────────────────────────────');
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Network: http://${ip}:${PORT}`);
  console.log(`  WS:      ws://${ip}:${PORT}`);
  console.log('──────────────────────────────────');
  console.log('  Share the Network address with students');
  console.log('  (all devices must be on same WiFi)\n');
});
