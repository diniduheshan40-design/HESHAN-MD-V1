// ============================================================================
// 📦 PACKAGES
// ============================================================================
const express = require('express');
const pino = require('pino');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const NodeCache = require('node-cache');
const fetch = require('node-fetch');
const {
  default: makeWASocket,
  DisconnectReason,
  delay,
  Browsers,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

// 🛡️ Process Crash Guards
process.on('uncaughtException', (err) => {
  console.error('🛡️ Uncaught Exception:', err?.message || err);
});
process.on('unhandledRejection', (err) => {
  console.error('🛡️ Unhandled Rejection:', err?.message || err);
});

// 🟢 Config & DB Models
let configUri = '';
let BOT_NAME = 'HESHAN MD V1';
let OWNER_NUMBER = '94719845166';

try {
  const config = require('./config');
  configUri = config.MONGODB_URI;
  if (config.BOT_NAME) BOT_NAME = config.BOT_NAME;
  if (config.OWNER_NUMBER) OWNER_NUMBER = config.OWNER_NUMBER;
} catch (e) {}

const MONGODB_URI = process.env.MONGODB_URI || configUri || 'mongodb+srv://diniduheshan40_db_user:Heshan2007@cluster0.5gazebm.mongodb.net/?appName=Cluster0';
const { useMongoDBAuthState, Auth } = require('./auth');

const REAL_OWNER_NUMBER = OWNER_NUMBER;
const activeSessions = {};
global.activeSessions = activeSessions;
const isStarting = {};
const reconnectAttempts = {};
const commands = new Map();

// ============================================================================
// 📂 COMMAND LOADER
// ============================================================================

function loadAllCommands() {
  const cmdDir = path.join(__dirname, 'commands');
  if (!fs.existsSync(cmdDir)) return;
  const files = fs.readdirSync(cmdDir).filter((f) => f.endsWith('.js'));
  commands.clear();

  for (const file of files) {
    try {
      delete require.cache[require.resolve(path.join(cmdDir, file))];
      let cmd = require(path.join(cmdDir, file));
      if (cmd.default) cmd = cmd.default;
      const cmdName = file.replace('.js', '').toLowerCase();
      if (cmd.name) commands.set(cmd.name.toLowerCase(), cmd);
      commands.set(cmdName, cmd);
      if (Array.isArray(cmd.alias)) {
        cmd.alias.forEach((al) => commands.set(al.toLowerCase(), cmd));
      }
    } catch (e) {
      console.error(`❌ Error loading ${file}:`, e.message);
    }
  }
  console.log(`✅ Loaded ${commands.size} commands!`);
}

// ============================================================================
// 🌐 UI PORTAL
// ============================================================================

function renderPortalHtml() {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${BOT_NAME} • PAIRING</title>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&family=JetBrains+Mono:wght@700&display=swap" rel="stylesheet">
      <style>
        :root {
          --bg: #090305;
          --card: rgba(20, 6, 10, 0.85);
          --accent: #e11d48;
          --glow: rgba(225, 29, 72, 0.4);
          --border: rgba(244, 63, 94, 0.3);
          --text: #ffffff;
          --muted: #9f8e93;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          background-color: var(--bg);
          color: var(--text);
          font-family: 'Outfit', sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          padding: 20px;
        }
        .box {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 24px;
          padding: 35px 25px;
          width: 100%;
          max-width: 400px;
          text-align: center;
          box-shadow: 0 0 35px var(--glow);
        }
        h1 { font-size: 26px; font-weight: 800; margin-bottom: 6px; color: #fff; }
        p { font-size: 13px; color: var(--muted); margin-bottom: 25px; }
        input {
          width: 100%;
          padding: 15px;
          border-radius: 14px;
          border: 1px solid var(--border);
          background: rgba(0,0,0,0.5);
          color: #fff;
          font-size: 16px;
          text-align: center;
          outline: none;
          margin-bottom: 12px;
        }
        button {
          width: 100%;
          padding: 14px;
          border-radius: 14px;
          border: none;
          background: var(--accent);
          color: #fff;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          margin-bottom: 10px;
        }
        .btn-clean {
          background: rgba(225, 29, 72, 0.15);
          color: #fb7185;
          border: 1px solid var(--border);
        }
        #codeArea {
          display: none;
          margin-top: 20px;
        }
        .code-box {
          font-family: 'JetBrains Mono', monospace;
          font-size: 28px;
          font-weight: 800;
          letter-spacing: 4px;
          color: #ffe4e6;
          background: rgba(225, 29, 72, 0.2);
          border: 1px dashed var(--accent);
          padding: 15px;
          border-radius: 14px;
          cursor: pointer;
        }
      </style>
    </head>
    <body>
      <div class="box">
        <h1>${BOT_NAME}</h1>
        <p>Enter number with country code (e.g. 9471xxxxxxx)</p>
        <input type="text" id="num" placeholder="94719845166" />
        <button id="btn" onclick="getCode()">GET PAIRING CODE</button>
        <button class="btn-clean" onclick="cleanSession()">CLEAN SESSION</button>

        <div id="codeArea">
          <div class="code-box" id="codeText" onclick="copy()"></div>
          <p style="margin-top:8px; font-size:11px;">Click code to copy</p>
        </div>
      </div>

      <script>
        async function getCode() {
          const num = document.getElementById('num').value.replace(/[^0-9]/g, '');
          if (!num || num.length < 10) return alert('කරුණාකර නිවැරදි Country Code සහිත අංකය ඇතුළත් කරන්න!');
          
          const btn = document.getElementById('btn');
          const area = document.getElementById('codeArea');
          const text = document.getElementById('codeText');

          btn.innerText = 'GENERATING CODE...';
          btn.disabled = true;
          area.style.display = 'none';

          try {
            const res = await fetch('/pair?num=' + num);
            const data = await res.json();
            if (data.code) {
              text.innerText = data.code;
              area.style.display = 'block';
              navigator.clipboard.writeText(data.code).catch(()=>{});
              alert('Code: ' + data.code + '\\n\\nතත්පර 15ක් ඇතුළත WhatsApp එකට දාන්න!');
            } else {
              alert(data.error || 'Server busy, try again in 10s');
            }
          } catch(e) {
            alert('Server error! Refresh page and retry.');
          }
          btn.innerText = 'GET PAIRING CODE';
          btn.disabled = false;
        }

        async function cleanSession() {
          const num = document.getElementById('num').value.replace(/[^0-9]/g, '');
          if (!num) return alert('Clean කිරීමට Phone Number එක ඇතුළත් කරන්න!');
          const res = await fetch('/reset-num?num=' + num);
          const data = await res.json();
          if (data.success) alert('Session Cleared! දැන් අලුතින් Code ගන්න.');
        }

        function copy() {
          navigator.clipboard.writeText(document.getElementById('codeText').innerText);
          alert('Copied!');
        }
      </script>
    </body>
    </html>
  `;
}

// ============================================================================
// 🔌 SOCKET & MESSAGE HANDLERS
// ============================================================================

function bindSocketEvents(sock, phoneNumber) {
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
      console.log(`✅ [${BOT_NAME}] CONNECTED: ${phoneNumber}`);
      activeSessions[phoneNumber] = sock;
      delete isStarting[phoneNumber];

      const botNum = phoneNumber.replace(/[^0-9]/g, '');
      const botJid = `${botNum}@s.whatsapp.net`;
      const ownerJid = `${REAL_OWNER_NUMBER}@s.whatsapp.net`;

      const welcome = `*⚡ ${BOT_NAME} ONLINE ⚡*\n━━━━━━━━━━━━━━━━━━━━━\n✅ Connected: +${botNum}\n🚀 Bot is ready 24/7!\n━━━━━━━━━━━━━━━━━━━━━`;
      await sock.sendMessage(botJid, { text: welcome }).catch(() => {});
      if (!botNum.includes(REAL_OWNER_NUMBER)) {
        await sock.sendMessage(ownerJid, { text: `*🔔 New Session:* +${botNum}` }).catch(() => {});
      }
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      console.log(`⚠️ Connection closed (${phoneNumber}), Code: ${code}`);

      try {
        sock.ev.removeAllListeners();
        sock.ws?.close();
      } catch (e) {}

      delete activeSessions[phoneNumber];
      delete isStarting[phoneNumber];

      if (code !== DisconnectReason.loggedOut && code !== 401) {
        setTimeout(() => initWhatsApp(phoneNumber), 6000);
      } else {
        console.log(`❌ Logged out: ${phoneNumber}`);
        try {
          await Auth.deleteMany({ _id: new RegExp('^' + phoneNumber, 'i') });
        } catch (e) {}
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg || !msg.message) return;

    const chatJid = msg.key.remoteJid;
    if (!chatJid || chatJid === 'status@broadcast') return;

    const isGroup = chatJid.endsWith('@g.us');
    const senderJid = msg.key.fromMe
      ? (sock.user?.id || '')
      : (isGroup ? (msg.key.participant || msg.participant || '') : chatJid);

    const cleanSenderNum = senderJid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
    const isOwner = cleanSenderNum === REAL_OWNER_NUMBER || msg.key.fromMe;

    const text = (
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      msg.message.videoMessage?.caption ||
      ''
    ).trim();

    if (!text) return;

    const prefixMatch = text.match(/^[./!#]/);
    if (!prefixMatch) return;

    const prefix = prefixMatch[0];
    const args = text.slice(prefix.length).trim().split(/ +/);
    const cmdName = args.shift().toLowerCase();

    const cmd = commands.get(cmdName);
    if (cmd && typeof (cmd.execute || cmd.run) === 'function') {
      try {
        const executor = cmd.execute || cmd.run;
        await executor(sock, msg, args, {
          chatJid,
          isGroup,
          isOwner,
          senderNum: cleanSenderNum,
          senderJid,
          botName: BOT_NAME,
          prefix,
          safeReply: (t) => sock.sendMessage(chatJid, typeof t === 'string' ? { text: t } : t, { quoted: msg })
        });
      } catch (err) {
        console.error(`Command error (${cmdName}):`, err.message);
      }
    }
  });
}

async function initWhatsApp(phoneNumber) {
  if (activeSessions[phoneNumber]) return activeSessions[phoneNumber];
  if (isStarting[phoneNumber]) return;
  isStarting[phoneNumber] = true;

  try {
    const { state, saveCreds } = await useMongoDBAuthState(phoneNumber);
    const logger = pino({ level: 'silent' });
    const msgRetryCounterCache = new NodeCache({ stdTTL: 180, checkperiod: 60 });
    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307] }));

    const sock = makeWASocket({
      version,
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
      logger,
      printQRInTerminal: false,
      browser: ['Chrome (Linux)', '', ''], // Standard WhatsApp Web Client
      msgRetryCounterCache,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 0,
      keepAliveIntervalMs: 20000,
      markOnlineOnConnect: false
    });

    sock.ev.on('creds.update', saveCreds);
    bindSocketEvents(sock, phoneNumber);

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
// 🌐 HTTP ROUTES (100% RELIABLE PAIRING LOGIC)
// ============================================================================

function registerHttpRoutes(app) {
  app.get('/', (req, res) => res.send(renderPortalHtml()));

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
    try {
      await Auth.deleteMany({ _id: new RegExp('^' + num, 'i') });
    } catch (e) {}

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
        browser: ['Chrome (Linux)', '', ''], // WhatsApp Web compliant signature
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 25000,
        emitOwnEvents: false
      });

      pairSock.ev.on('creds.update', saveCreds);
      bindSocketEvents(pairSock, num);

      // Server එක WhatsApp සමඟ Handshake එක අවසන් කරන තෙක් රැඳී සිටීම
      let isCodeSent = false;
      
      const timeout = setTimeout(() => {
        if (!isCodeSent) {
          isCodeSent = true;
          return res.status(500).json({ error: 'Connection timeout. Click again!' });
        }
      }, 25000);

      // Creds check එකට පෙර තත්පර 3ක steady connection delay එකක්
      await delay(3500);

      if (!pairSock.authState.creds.registered) {
        let code = await pairSock.requestPairingCode(num);
        code = code?.match(/.{1,4}/g)?.join('-') || code;
        clearTimeout(timeout);
        isCodeSent = true;
        return res.json({ code });
      } else {
        clearTimeout(timeout);
        return res.status(400).json({ error: 'Session already active. Click Clean Session.' });
      }
    } catch (err) {
      console.error('Pairing Error:', err);
      if (pairSock) {
        try { pairSock.ws?.close(); } catch (e) {}
      }
      return res.status(500).json({ error: 'Failed to generate code. Retry in 10s.' });
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
    console.log(`🔍 Restoring ${sessions.length} sessions...`);
    for (const session of sessions) {
      const pNumber = session._id.split('-creds')[0];
      await initWhatsApp(pNumber);
      await delay(5000);
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
      serverSelectionTimeoutMS: 5000
    });
    console.log('🍃 MongoDB Connected!');

    loadAllCommands();

    const app = express();
    const port = process.env.PORT || 3000;
    app.use(express.json());

    registerHttpRoutes(app);

    app.listen(port, () => {
      console.log(`🚀 [${BOT_NAME}] Live on port ${port}`);
      startKeepAlivePing();
    });

    await reconnectAllSavedSessions();
  } catch (err) {
    console.error('Startup Error:', err);
  }
}

main();

