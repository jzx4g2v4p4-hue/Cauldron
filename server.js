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


function extractSunoPlaylistRef(raw = '') {
  const input = String(raw || '').trim();
  if (!input) return null;

  const uuidMatch = input.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i);
  if (uuidMatch) return { type: 'id', value: uuidMatch[0] };

  try {
    const u = new URL(input.startsWith('http') ? input : `https://${input}`);
    const parts = u.pathname.split('/').filter(Boolean);
    const idx = parts.findIndex((p) => p === 'playlist' || p === 'playlists' || p === 'p');
    if (idx >= 0 && parts[idx + 1]) return { type: 'id', value: parts[idx + 1] };
    if (parts[0] === 's' && parts[1]) return { type: 'share', value: parts[1] };
  } catch {}

  if (/^[A-Za-z0-9_-]{8,}$/.test(input)) {
    return { type: 'share', value: input };
  }

  return null;
}

function parseSunoTracks(payload) {
  const buckets = [
    payload?.clips,
    payload?.tracks,
    payload?.songs,
    payload?.items,
    payload?.data?.clips,
    payload?.data?.tracks,
    payload?.data?.songs,
    payload?.data?.items,
    payload?.playlist?.clips,
    payload?.playlist?.tracks,
    payload?.playlist?.songs,
    payload?.playlist?.items,
    payload?.results,
  ].filter(Array.isArray);

  const out = [];
  const seen = new Set();
  for (const arr of buckets) {
    for (const t of arr) {
      const rawUrl = t?.audio_url || t?.audioUrl || t?.stream_url || t?.streamUrl || t?.url;
      const title = t?.title || t?.name || t?.display_name || t?.song_name;
      if (!rawUrl || typeof rawUrl !== 'string') continue;
      let url = rawUrl.trim();
      if (!/^https?:\/\//i.test(url)) continue;
      if (url.includes('suno.com/song/') || url.includes('suno.ai/song/')) {
        const m = url.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
        if (m) url = `https://cdn1.suno.ai/${m[1]}.mp3`;
      }
      if (seen.has(url)) continue;
      seen.add(url);
      out.push({
        name: (typeof title === 'string' && title.trim()) ? title.trim() : 'Untitled Suno Track',
        url,
      });
    }
  }
  return out;
}

async function fetchJsonMaybe(url) {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (Cauldron Playlist Sync)',
      'accept': 'application/json,text/plain,*/*',
      'referer': 'https://suno.com/',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const txt = await res.text();
  try { return JSON.parse(txt); } catch { throw new Error('Invalid JSON'); }
}

async function fetchPlaylistTracks(playlistRef) {
  const ref = typeof playlistRef === 'string' ? { type: 'id', value: playlistRef } : playlistRef;
  const candidates = ref?.type === 'share'
    ? [
        `https://studio-api.suno.ai/api/playlist/by-share/${ref.value}`,
        `https://suno.com/api/playlist/by-share/${ref.value}`,
        `https://suno.com/api/playlists/by-share/${ref.value}`,
      ]
    : [
        `https://studio-api.suno.ai/api/playlist/${ref.value}`,
        `https://studio-api.suno.ai/api/playlist/${ref.value}?page=1`,
        `https://suno.com/api/playlist/${ref.value}`,
        `https://suno.com/api/playlists/${ref.value}`,
      ];

  for (const endpoint of candidates) {
    try {
      const data = await fetchJsonMaybe(endpoint);
      const tracks = parseSunoTracks(data);
      if (tracks.length) return { tracks, source: endpoint, playlistRef: ref.value };
    } catch {}
  }

  throw new Error(`Unable to read tracks from Suno ${ref?.type === 'share' ? 'share link' : 'playlist'} endpoint`);
}



app.get('/api/suno/playlist', async (req, res) => {
  const playlistUrl = String(req.query.url || '').trim();
  const playlistRef = extractSunoPlaylistRef(playlistUrl);
  if (!playlistRef) {
    res.status(400).json({ error: 'Provide a valid Suno playlist URL, share link, or playlist ID.' });
    return;
  }

  try {
    const { tracks, source, playlistRef: resolvedRef } = await fetchPlaylistTracks(playlistRef);
    res.json({
      playlistId: playlistRef.type === 'id' ? resolvedRef : null,
      shareId: playlistRef.type === 'share' ? resolvedRef : null,
      fetchedFrom: source,
      count: tracks.length,
      tracks,
    });
  } catch (err) {
    res.status(502).json({
      error: 'Could not fetch this Suno playlist right now.',
      detail: err?.message || 'Unknown error',
    });
  }
});

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
