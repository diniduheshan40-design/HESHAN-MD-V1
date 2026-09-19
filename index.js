// ============================================================================
// 📦 PACKAGES
// ============================================================================
const express = require('express');
const pino = require('pino');
const mongoose = require('mongoose');
const fetch = require('node-fetch');
const NodeCache = require('node-cache');
const {
  default: makeWASocket,
  DisconnectReason,
  delay,
  Browsers,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

// 🛡️ Global Crash Protection
process.on('unhandledRejection', (err) => console.error('Unhandled Rejection:', err?.message || err));
process.on('uncaughtException', (err) => console.error('Uncaught Exception:', err?.message || err));

// 🟢 Config & Auth
const { MONGODB_URI } = require('./config');
const { useMongoDBAuthState, Auth } = require('./auth');

const BOT_NAME = 'HESHAN MD V1';
const OWNER_NUMBER = '94719845166';
const OWNER_JID = `${OWNER_NUMBER}@s.whatsapp.net`;

const activeSessions = {};
const isStarting = {};

// ============================================================================
// 🌐 UI PORTAL (CYBER NEON THEME)
// ============================================================================

function renderPortalHtml() {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${BOT_NAME} • PAIRING STATION</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&family=JetBrains+Mono:wght@700;800&display=swap" rel="stylesheet">
      <style>
        :root {
          --bg-core: #050b14;
          --panel-bg: rgba(10, 25, 41, 0.75);
          --accent-cyan: #06b6d4;
          --accent-glow: rgba(6, 182, 212, 0.4);
          --cyan-soft: #67e8f9;
          --border-glass: rgba(6, 182, 212, 0.25);
          --border-focus: rgba(34, 211, 238, 0.8);
          --text-main: #f8fafc;
          --text-muted: #94a3b8;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          background-color: var(--bg-core);
          background-image: 
            radial-gradient(circle at 50% 0%, rgba(6, 182, 212, 0.2) 0%, transparent 60%),
            radial-gradient(circle at 80% 90%, rgba(14, 116, 144, 0.15) 0%, transparent 50%);
          color: var(--text-main);
          font-family: 'Outfit', sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          padding: 24px;
        }
        .portal-card {
          background: var(--panel-bg);
          backdrop-filter: blur(28px) saturate(160%);
          -webkit-backdrop-filter: blur(28px) saturate(160%);
          border: 1px solid var(--border-glass);
          border-radius: 28px;
          padding: 44px 34px;
          width: 100%;
          max-width: 440px;
          text-align: center;
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.7), 0 0 40px var(--accent-glow);
          position: relative;
          overflow: hidden;
        }
        .portal-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0; height: 3px;
          background: linear-gradient(90deg, transparent, var(--accent-cyan), transparent);
        }
        .badge-status {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: var(--cyan-soft);
          background: rgba(6, 182, 212, 0.12);
          border: 1px solid rgba(6, 182, 212, 0.3);
          padding: 5px 14px;
          border-radius: 30px;
          margin-bottom: 20px;
        }
        .badge-dot {
          width: 6px; height: 6px;
          background: var(--accent-cyan);
          border-radius: 50%;
          box-shadow: 0 0 8px var(--accent-cyan);
        }
        .app-title {
          font-size: 32px;
          font-weight: 800;
          letter-spacing: -0.5px;
          background: linear-gradient(135deg, #ffffff 40%, var(--cyan-soft) 80%, var(--accent-cyan) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          margin-bottom: 6px;
        }
        .app-desc {
          font-size: 13.5px;
          color: var(--text-muted);
          margin-bottom: 30px;
        }
        .input-wrap { position: relative; margin-bottom: 16px; }
        .phone-input {
          width: 100%;
          padding: 16px 20px;
          border-radius: 16px;
          border: 1px solid var(--border-glass);
          background: rgba(5, 15, 25, 0.7);
          color: var(--text-main);
          font-size: 17px;
          font-weight: 600;
          letter-spacing: 0.8px;
          text-align: center;
          outline: none;
          transition: all 0.3s ease;
        }
        .phone-input:focus {
          border-color: var(--border-focus);
          box-shadow: 0 0 25px rgba(6, 182, 212, 0.4);
          background: rgba(8, 22, 36, 0.9);
        }
        .btn-action {
          width: 100%;
          padding: 16px;
          border-radius: 16px;
          border: none;
          background: linear-gradient(135deg, #0891b2 0%, var(--accent-cyan) 100%);
          color: #ffffff;
          font-size: 14.5px;
          font-weight: 700;
          letter-spacing: 0.5px;
          cursor: pointer;
          transition: all 0.25s ease;
          box-shadow: 0 8px 24px rgba(6, 182, 212, 0.3);
          margin-bottom: 12px;
        }
        .btn-action:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 30px rgba(6, 182, 212, 0.5);
        }
        .btn-reset {
          width: 100%;
          padding: 13px;
          border-radius: 14px;
          border: 1px solid rgba(6, 182, 212, 0.25);
          background: rgba(6, 182, 212, 0.08);
          color: var(--cyan-soft);
          font-size: 12.5px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.25s ease;
        }
        .btn-reset:hover {
          background: rgba(6, 182, 212, 0.2);
          border-color: rgba(6, 182, 212, 0.5);
        }
        .code-container {
          display: none;
          margin-top: 24px;
          animation: fadeIn 0.4s ease;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .code-box {
          font-family: 'JetBrains Mono', monospace;
          font-size: 32px;
          font-weight: 800;
          letter-spacing: 5px;
          color: #ecfeff;
          background: rgba(6, 182, 212, 0.15);
          border: 1.5px dashed rgba(103, 232, 249, 0.5);
          padding: 18px;
          border-radius: 16px;
          cursor: pointer;
          transition: all 0.25s ease;
        }
        .copy-tag {
          font-size: 11.5px;
          color: var(--text-muted);
          margin-top: 8px;
        }
        .footer-note {
          margin-top: 28px;
          font-size: 11px;
          letter-spacing: 1px;
          color: rgba(255, 255, 255, 0.25);
          text-transform: uppercase;
        }
      </style>
    </head>
    <body>
      <div class="portal-card">
        <div class="badge-status">
          <span class="badge-dot"></span> Online Station
        </div>
        <h1 class="app-title">${BOT_NAME}</h1>
        <p class="app-desc">Enter WhatsApp number with country code</p>

        <div class="input-wrap">
          <input type="text" id="phone" class="phone-input" placeholder="e.g. 9470xxxxxxx" />
        </div>

        <button id="btn" class="btn-action" onclick="fetchPairCode()">GET PAIRING CODE</button>
        <button class="btn-reset" onclick="cleanSessionSlot()">CLEAN SESSION</button>

        <div class="code-container" id="codeWrapper">
          <div class="code-box" id="codeDisplay" onclick="copyCode()"></div>
          <div class="copy-tag">Click code to copy to clipboard</div>
        </div>

        <p class="footer-note">Powered by Heshan MD</p>
      </div>

      <script>
        async function fetchPairCode() {
          const phone = document.getElementById('phone').value.replace(/[^0-9]/g, '');
          if (!phone || phone.length < 10) return alert('කරුණාකර නිවැරදි Country Code සහිත අංකය ඇතුළත් කරන්න!');

          const btn = document.getElementById('btn');
          const wrapper = document.getElementById('codeWrapper');
          const display = document.getElementById('codeDisplay');

          btn.innerText = 'GENERATING CODE...';
          btn.disabled = true;
          wrapper.style.display = 'none';

          try {
            const res = await fetch('/pair?num=' + phone);
            const data = await res.json();
            if (data.code) {
              display.innerText = data.code;
              wrapper.style.display = 'block';
              navigator.clipboard.writeText(data.code).catch(()=>{});
              alert('✅ Pairing Code: ' + data.code);
            } else {
              alert(data.error || 'Connection rate-limited. Please wait 15 seconds.');
            }
          } catch(e) {
            alert('Server connection error. Refresh page and retry!');
          }
          btn.innerText = 'GET PAIRING CODE';
          btn.disabled = false;
        }

        async function cleanSessionSlot() {
          const phone = document.getElementById('phone').value.replace(/[^0-9]/g, '');
          if (!phone) return alert('Clean කිරීමට Phone Number එක ඇතුළත් කරන්න!');
          if (confirm('+' + phone + ' සඳහා session එක clean කරන්නද?')) {
            try {
              const res = await fetch('/reset-num?num=' + phone);
              const data = await res.json();
              if (data.success) {
                alert('✅ Session Cleared! දැන් අලුතින් Pair Code එක ගන්න.');
              }
            } catch(e) {
              alert('Clean request failed!');
            }
          }
        }

        function copyCode() {
          const code = document.getElementById('codeDisplay').innerText;
          if (code) {
            navigator.clipboard.writeText(code);
            alert('✅ Copied to clipboard: ' + code);
          }
        }
      </script>
    </body>
    </html>
  `;
}

// ============================================================================
// 🔌 SOCKET & CONNECTION CONTROLLER
// ============================================================================

async function initWhatsApp(phoneNumber) {
  if (activeSessions[phoneNumber]) return activeSessions[phoneNumber];
  if (isStarting[phoneNumber]) return;
  isStarting[phoneNumber] = true;

  try {
    const { state, saveCreds, clearSessionData } = await useMongoDBAuthState(phoneNumber);
    const logger = pino({ level: 'silent' });
    const msgRetryCounterCache = new NodeCache({ stdTTL: 180, checkperiod: 60 });
    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307] }));

    const sock = makeWASocket({
      version,
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
      logger,
      printQRInTerminal: false,
      browser: Browsers.macOS('Safari'),
      msgRetryCounterCache,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      connectTimeoutMs: 45000,
      defaultQueryTimeoutMs: 20000,
      keepAliveIntervalMs: 30000,
      markOnlineOnConnect: true
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === 'open') {
        console.log(`✅ [${BOT_NAME}] CONNECTED: ${phoneNumber}`);
        activeSessions[phoneNumber] = sock;
        delete isStarting[phoneNumber];

        const botNum = phoneNumber.replace(/[^0-9]/g, '');
        const botJid = `${botNum}@s.whatsapp.net`;

        // 1. Bot run වන අංකයට සාර්ථකව සම්බන්ධ වූ බව දැනුම් දීම
        await sock.sendMessage(botJid, { 
          text: `*✦ ${BOT_NAME} CONNECTED ✦*\n━━━━━━━━━━━━━━━━━━━━━\nStatus: Online (24/7 Cloud)\nCore: Clean Base Ready.` 
        }).catch(() => {});

        // 2. Owner අංකයට (94719845166) alert එකක් යැවීම
        if (botNum !== OWNER_NUMBER) {
          await sock.sendMessage(OWNER_JID, {
            text: `*🔔 NEW SESSION CONNECTED*\n━━━━━━━━━━━━━━━━━━━━━\nBot: +${botNum}\nSystem: Active`
          }).catch(() => {});
        }
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        console.log(`⚠️ Connection closed (${phoneNumber}), Code: ${statusCode}`);

        try {
          sock.ev.removeAllListeners();
          sock.ws?.close();
        } catch (e) {}

        delete activeSessions[phoneNumber];
        delete isStarting[phoneNumber];

        if (statusCode !== DisconnectReason.loggedOut && statusCode !== 401) {
          setTimeout(() => initWhatsApp(phoneNumber), 8000);
        } else {
          console.log(`❌ Permanent logout: ${phoneNumber}`);
          if (typeof clearSessionData === 'function') await clearSessionData();
        }
      }
    });

    // 📩 Message Entrypoint & Access Control
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      const msg = messages[0];
      if (!msg || !msg.message) return;

      const chatJid = msg.key.remoteJid;
      const isGroup = chatJid?.endsWith('@g.us');
      const senderJid = msg.key.fromMe 
        ? (sock.user?.id || '') 
        : (isGroup ? (msg.key.participant || msg.participant || '') : chatJid);
      
      const senderNum = senderJid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');

      // 👑 Full Access Validation (Owner හෝ Bot Self Account එක)
      const isOwner = senderNum === OWNER_NUMBER || msg.key.fromMe;

      const text = (
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        msg.message.videoMessage?.caption ||
        ''
      ).trim();

      if (!text) return;

      // 🛠️ Basic Command Structure Handling
      if (text.toLowerCase() === '.ping') {
        await sock.sendMessage(chatJid, { text: 'pong 🏓' }, { quoted: msg });
      }

      // Owner Only Command Example
      if (text.toLowerCase() === '.owner') {
        await sock.sendMessage(chatJid, { 
          text: `👑 *Owner Access:* ${isOwner ? 'Authorized' : 'Unauthorized'}\nNumber: +${OWNER_NUMBER}` 
        }, { quoted: msg });
      }
    });

    return sock;
  } catch (err) {
    delete isStarting[phoneNumber];
    console.error('initWhatsApp Error:', err.message);
  }
}

function stopAndRemoveSession(num) {
  if (!activeSessions[num]) return;
  try {
    activeSessions[num].ev.removeAllListeners();
    activeSessions[num].ws?.close();
  } catch (e) {}
  delete activeSessions[num];
}

// ============================================================================
// 🌐 HTTP ROUTES
// ============================================================================

function registerHttpRoutes(app) {
  app.get('/', (req, res) => {
    res.send(renderPortalHtml());
  });

  app.get('/reset-num', async (req, res) => {
    let num = req.query.num;
    if (!num) return res.status(400).json({ error: 'Number required' });
    num = num.replace(/[^0-9]/g, '');

    try {
      stopAndRemoveSession(num);
      await Auth.deleteMany({ _id: new RegExp('^' + num, 'i') });
      return res.json({ success: true, message: `Session cleared for ${num}` });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.get('/pair', async (req, res) => {
    let num = req.query.num;
    if (!num) return res.status(400).json({ error: 'Number required' });
    num = num.replace(/[^0-9]/g, '');

    stopAndRemoveSession(num);
    await Auth.deleteMany({ _id: new RegExp('^' + num, 'i') });

    let pairSock = null;
    try {
      const { state, saveCreds } = await useMongoDBAuthState(num);
      const logger = pino({ level: 'silent' });
      const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307] }));

      pairSock = makeWASocket({
        version,
        auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
        logger,
        printQRInTerminal: false,
        browser: Browsers.macOS('Safari'),
        connectTimeoutMs: 30000,
        defaultQueryTimeoutMs: 20000,
        keepAliveIntervalMs: 25000,
        emitOwnEvents: false
      });

      pairSock.ev.on('creds.update', saveCreds);

      pairSock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
          activeSessions[num] = pairSock;
          console.log(`✅ [${BOT_NAME}] PAIRED & CONNECTED: ${num}`);
        } else if (connection === 'close') {
          const code = lastDisconnect?.error?.output?.statusCode;
          if (code !== DisconnectReason.loggedOut && code !== 401) {
            setTimeout(() => initWhatsApp(num), 5000);
          }
        }
      });

      await delay(1500);

      if (!pairSock.authState.creds.registered) {
        let code = await pairSock.requestPairingCode(num);
        code = code?.match(/.{1,4}/g)?.join('-') || code;
        return res.json({ code });
      } else {
        await Auth.deleteMany({ _id: new RegExp('^' + num, 'i') });
        return res.status(400).json({ error: 'Session cleared! Please try again.' });
      }
    } catch (err) {
      if (pairSock) {
        try { pairSock.ws?.close(); } catch(e){}
      }
      return res.status(500).json({ error: 'Rate-limited. Wait 15 seconds and retry.' });
    }
  });
}

function startKeepAlivePing() {
  const keepAliveUrl = process.env.RENDER_EXTERNAL_URL;
  if (!keepAliveUrl) return;

  setInterval(async () => {
    try {
      await fetch(keepAliveUrl);
    } catch (e) {}
  }, 4 * 60 * 1000);
}

async function reconnectAllSavedSessions() {
  try {
    const sessions = await Auth.find({ _id: /-creds$/ }).lean();
    for (const session of sessions) {
      const pNumber = session._id.split('-creds')[0];
      await initWhatsApp(pNumber);
      await delay(2000);
    }
  } catch (e) {
    console.error('Error reconnecting sessions:', e.message);
  }
}

// ============================================================================
// 🚀 SERVER INIT
// ============================================================================

async function main() {
  try {
    await mongoose.connect(MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000
    });
    console.log('🍃 MongoDB Connected!');

    const app = express();
    const port = process.env.PORT || 3000;
    app.use(express.json());

    registerHttpRoutes(app);

    app.listen(port, () => {
      console.log(`🚀 [${BOT_NAME}] Server running on port ${port}`);
      startKeepAlivePing();
    });

    await reconnectAllSavedSessions();
  } catch (err) {
    console.error('Startup Error:', err);
  }
}

main();
