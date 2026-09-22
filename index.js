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
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

// 🟢 Crash Guards
process.on('uncaughtException', (err) => {
  console.error('🛡️ Uncaught Exception:', err?.message || err);
});
process.on('unhandledRejection', (err) => {
  console.error('🛡️ Unhandled Rejection:', err?.message || err);
});

// 🟢 Configuration
const BOT_NAME = 'HESHAN MD V1';
const MONGODB_URI = 'mongodb+srv://diniduheshan40_db_user:Heshan2007@cluster0.5gazebm.mongodb.net/?appName=Cluster0';
const { useMongoDBAuthState, Auth } = require('./auth');

// 🧠 Runtime State
const activeSessions = {};
const isStarting = {};
const reconnectAttempts = {};
const commands = new Map();

// ============================================================================
// 📂 COMMAND LOADER (Ping සහ අනෙකුත් commands සඳහා)
// ============================================================================

function loadAllCommands() {
  const cmdDir = path.join(__dirname, 'commands');
  if (!fs.existsSync(cmdDir)) return;
  const cmdFiles = fs.readdirSync(cmdDir).filter((f) => f.endsWith('.js'));
  for (const file of cmdFiles) {
    try {
      let cmd = require(path.join(cmdDir, file));
      if (cmd.default) cmd = cmd.default;
      const cmdName = file.replace('.js', '').toLowerCase();
      if (cmd && cmd.name) commands.set(cmd.name.toLowerCase(), cmd);
      commands.set(cmdName, cmd);
      if (cmd && cmd.alias) {
        const aliases = Array.isArray(cmd.alias) ? cmd.alias : [cmd.alias];
        for (const al of aliases) commands.set(al.toLowerCase(), cmd);
      }
    } catch (e) {
      console.error(`❌ Error loading ${file}:`, e.message);
    }
  }
}

function getCommandExecutor(cmd) {
  if (typeof cmd === 'function') return cmd;
  if (cmd && typeof cmd.execute === 'function') return cmd.execute;
  if (cmd && typeof cmd.run === 'function') return cmd.run;
  return null;
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
      <title>${BOT_NAME} • PAIRING STATION</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=JetBrains+Mono:wght@700;800&display=swap" rel="stylesheet">
      <style>
        :root {
          --bg-core: #090305;
          --panel-bg: rgba(20, 6, 10, 0.75);
          --accent-red: #e11d48;
          --accent-glow: rgba(225, 29, 72, 0.35);
          --crimson-soft: #fb7185;
          --border-glass: rgba(244, 63, 94, 0.22);
          --border-focus: rgba(244, 63, 94, 0.65);
          --text-main: #fcfcfd;
          --text-muted: #9f8e93;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }
        
        body {
          background-color: var(--bg-core);
          background-image: 
            radial-gradient(circle at 50% 0%, rgba(225, 29, 72, 0.18) 0%, transparent 60%),
            radial-gradient(circle at 10% 90%, rgba(159, 18, 57, 0.12) 0%, transparent 45%);
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
          backdrop-filter: blur(28px);
          -webkit-backdrop-filter: blur(28px);
          border: 1px solid var(--border-glass);
          border-radius: 28px;
          padding: 44px 34px;
          width: 100%;
          max-width: 440px;
          text-align: center;
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.65), 0 0 45px var(--accent-glow);
          position: relative;
        }

        .badge-status {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: var(--crimson-soft);
          background: rgba(225, 29, 72, 0.12);
          border: 1px solid rgba(225, 29, 72, 0.28);
          padding: 5px 14px;
          border-radius: 30px;
          margin-bottom: 20px;
        }

        .badge-dot {
          width: 6px;
          height: 6px;
          background: var(--accent-red);
          border-radius: 50%;
          box-shadow: 0 0 8px var(--accent-red);
        }

        .app-title {
          font-size: 30px;
          font-weight: 800;
          letter-spacing: -0.5px;
          background: linear-gradient(135deg, #ffffff 40%, var(--crimson-soft) 80%, var(--accent-red) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          margin-bottom: 6px;
        }

        .app-desc {
          font-size: 13.5px;
          color: var(--text-muted);
          margin-bottom: 30px;
        }

        .phone-input {
          width: 100%;
          padding: 16px 20px;
          border-radius: 16px;
          border: 1px solid var(--border-glass);
          background: rgba(12, 3, 6, 0.7);
          color: var(--text-main);
          font-size: 17px;
          font-weight: 600;
          text-align: center;
          outline: none;
          margin-bottom: 16px;
          transition: 0.3s;
        }

        .phone-input:focus {
          border-color: var(--border-focus);
          box-shadow: 0 0 24px rgba(225, 29, 72, 0.35);
        }

        .btn-action {
          width: 100%;
          padding: 16px;
          border-radius: 16px;
          border: none;
          background: linear-gradient(135deg, #be123c 0%, var(--accent-red) 100%);
          color: #ffffff;
          font-size: 14.5px;
          font-weight: 700;
          cursor: pointer;
          transition: 0.25s;
          margin-bottom: 12px;
        }

        .btn-action:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 30px rgba(225, 29, 72, 0.45);
        }

        .btn-reset {
          width: 100%;
          padding: 13px;
          border-radius: 14px;
          border: 1px solid rgba(225, 29, 72, 0.25);
          background: rgba(225, 29, 72, 0.08);
          color: var(--crimson-soft);
          font-size: 12.5px;
          font-weight: 600;
          cursor: pointer;
          transition: 0.25s;
        }

        .code-container {
          display: none;
          margin-top: 24px;
        }

        .code-box {
          font-family: 'JetBrains Mono', monospace;
          font-size: 32px;
          font-weight: 800;
          letter-spacing: 5px;
          color: #ffe4e6;
          background: rgba(225, 29, 72, 0.14);
          border: 1.5px dashed rgba(251, 113, 133, 0.45);
          padding: 18px;
          border-radius: 16px;
          cursor: pointer;
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
          <span class="badge-dot"></span> Online System
        </div>
        <h1 class="app-title">${BOT_NAME}</h1>
        <p class="app-desc">Enter phone number with country code</p>

        <input type="text" id="phone" class="phone-input" placeholder="e.g. 9471xxxxxxx" />

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
          if (!phone || phone.length < 10) return alert('කරුණාකර නිවැරදි Phone Number එක ඇතුළත් කරන්න!');

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
              alert('✅ Pairing Code: ' + data.code + '\\n\\nතත්පර 20ක් ඇතුළත WhatsApp හි Link with phone number වෙත දමන්න!');
            } else {
              alert(data.error || 'Connection failed. Please wait a moment and retry.');
            }
          } catch(e) {
            alert('Server error. Refresh and try again!');
          }
          btn.innerText = 'GET PAIRING CODE';
          btn.disabled = false;
        }

        async function cleanSessionSlot() {
          const phone = document.getElementById('phone').value.replace(/[^0-9]/g, '');
          if (!phone) return alert('Phone Number එක ඇතුළත් කරන්න!');
          if (confirm('+' + phone + ' සඳහා පැරණි session එක Clean කරන්නද?')) {
            try {
              const res = await fetch('/reset-num?num=' + phone);
              const data = await res.json();
              if (data.success) {
                alert('✅ Session Cleared! දැන් අලුතින් Code ලබාගන්න.');
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
            alert('✅ Copied: ' + code);
          }
        }
      </script>
    </body>
    </html>
  `;
}

// ============================================================================
// 🔌 SOCKET CREATION (Stable Handshake)
// ============================================================================

async function createBaileysSocket(phoneNumber) {
  const { state, saveCreds, clearSessionData } = await useMongoDBAuthState(phoneNumber);
  const logger = pino({ level: 'silent' });
  const msgRetryCounterCache = new NodeCache({ stdTTL: 180, checkperiod: 60, maxKeys: 300 });
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307] }));

  const sock = makeWASocket({
    version,
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    logger,
    printQRInTerminal: false,
    browser: ['Ubuntu', 'Chrome', '20.0.04'],
    msgRetryCounterCache,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 0,
    keepAliveIntervalMs: 15000,
    markOnlineOnConnect: true,
    emitOwnEvents: false,
    shouldIgnoreJid: () => false
  });

  sock.ev.on('creds.update', saveCreds);
  return { sock, clearSessionData };
}

// ============================================================================
// 🔄 CONNECTION & COMMAND HANDLING
// ============================================================================

async function handleConnectionClose(sock, phoneNumber, lastDisconnect, clearSessionData) {
  const statusCode = lastDisconnect?.error?.output?.statusCode;
  console.log(`⚠️ Connection closed (${phoneNumber}), Code: ${statusCode}`);

  try {
    sock.ev.removeAllListeners();
    sock.ws?.close();
  } catch (e) {}

  delete activeSessions[phoneNumber];

  if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
    console.log(`❌ Logged out permanently: ${phoneNumber}`);
    delete reconnectAttempts[phoneNumber];
    if (typeof clearSessionData === 'function') await clearSessionData();
    return;
  }

  reconnectAttempts[phoneNumber] = (reconnectAttempts[phoneNumber] || 0) + 1;
  const delayTime = statusCode === 440 ? 15000 : 5000;

  setTimeout(() => {
    initWhatsApp(phoneNumber);
  }, delayTime);
}

function registerMessageListener(sock) {
  sock.ev.on('messages.upsert', async ({ messages }) => {
    if (!messages || !messages.length) return;
    const msg = messages[0];
    if (!msg.message || msg.key?.remoteJid?.endsWith('@newsletter')) return;

    const chatJid = msg.key.remoteJid;
    const rawContent = msg.message?.ephemeralMessage?.message || msg.message?.viewOnceMessage?.message || msg.message;
    const text = (
      rawContent?.conversation ||
      rawContent?.extendedTextMessage?.text ||
      rawContent?.imageMessage?.caption ||
      rawContent?.videoMessage?.caption ||
      ''
    ).trim();

    if (!text) return;

    const prefixMatch = text.match(/^[./!#]/);
    if (!prefixMatch) return;

    const prefix = prefixMatch[0];
    const args = text.slice(prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    const cmd = commands.get(commandName);
    if (!cmd) return;

    const executor = getCommandExecutor(cmd);
    if (executor) {
      const safeReply = async (content) => {
        const payload = typeof content === 'string' ? { text: content } : content;
        return sock.sendMessage(chatJid, payload, { quoted: msg }).catch(() => {
          return sock.sendMessage(chatJid, payload);
        });
      };

      try {
        await executor(sock, msg, args, chatJid, safeReply, { isOwner: true });
      } catch (err) {
        console.error(`Command [${commandName}] Error:`, err?.message);
      }
    }
  });
}

async function initWhatsApp(phoneNumber) {
  if (activeSessions[phoneNumber]) return activeSessions[phoneNumber];
  if (isStarting[phoneNumber]) return;
  isStarting[phoneNumber] = true;

  try {
    const { sock, clearSessionData } = await createBaileysSocket(phoneNumber);
    activeSessions[phoneNumber] = sock;
    delete isStarting[phoneNumber];

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;
      if (connection === 'close') {
        await handleConnectionClose(sock, phoneNumber, lastDisconnect, clearSessionData);
      } else if (connection === 'open') {
        console.log(`✅ BOT CONNECTED: ${phoneNumber}`);
        reconnectAttempts[phoneNumber] = 0;
      }
    });

    registerMessageListener(sock);
    return sock;
  } catch (err) {
    delete isStarting[phoneNumber];
    console.error(`initWhatsApp Error (${phoneNumber}):`, err.message);
  }
}

// ============================================================================
// 🌐 HTTP SERVER & PAIRING ENGINE
// ============================================================================

function stopAndRemoveSession(num) {
  if (!activeSessions[num]) return;
  try {
    activeSessions[num].ev.removeAllListeners();
    activeSessions[num].ws?.close();
  } catch (e) {}
  delete activeSessions[num];
}

async function startServer() {
  const app = express();
  const port = process.env.PORT || 3000;
  app.use(express.json());

  app.get('/', (req, res) => res.send(renderPortalHtml()));

  app.get('/reset-num', async (req, res) => {
    let num = req.query.num;
    if (!num) return res.status(400).json({ error: 'Number required' });
    num = num.replace(/[^0-9]/g, '');

    try {
      stopAndRemoveSession(num);
      await Auth.deleteMany({ _id: new RegExp('^' + num, 'i') });
      return res.json({ success: true, message: `Session wiped for ${num}` });
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
        browser: ['Ubuntu', 'Chrome', '20.0.04'],
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 15000,
        markOnlineOnConnect: true,
        emitOwnEvents: false
      });

      pairSock.ev.on('creds.update', async () => {
        await saveCreds();
      });

      pairSock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
          console.log(`✅ Session Successfully Linked: ${num}`);
          activeSessions[num] = pairSock;
          registerMessageListener(pairSock);
        } else if (connection === 'close') {
          const code = lastDisconnect?.error?.output?.statusCode;
          if (code !== DisconnectReason.loggedOut && code !== 401) {
            setTimeout(() => initWhatsApp(num), 3000);
          }
        }
      });

      await delay(3500);

      if (!pairSock.authState.creds.registered) {
        let code = await pairSock.requestPairingCode(num);
        code = code?.match(/.{1,4}/g)?.join('-') || code;
        return res.json({ code });
      } else {
        await Auth.deleteMany({ _id: new RegExp('^' + num, 'i') });
        return res.status(400).json({ error: 'Session already active. Clean session and retry!' });
      }
    } catch (err) {
      console.error('Pair Route Error:', err);
      if (pairSock) {
        try { pairSock.ws?.close(); } catch (e) {}
      }
      return res.status(500).json({ error: 'Service rate-limited. Please wait 15 seconds.' });
    }
  });

  app.listen(port, () => {
    console.log(`🚀 [${BOT_NAME}] Server running on port ${port}`);
  });

  // Reconnect saved sessions from database
  try {
    const sessions = await Auth.find({ _id: /-creds$/ }).lean();
    for (const session of sessions) {
      const pNumber = session._id.split('-creds')[0];
      await initWhatsApp(pNumber);
      await delay(6000);
    }
  } catch (e) {
    console.error('Error reconnecting sessions:', e.message);
  }
}

// ============================================================================
// 🍃 INITIALIZATION
// ============================================================================

async function main() {
  try {
    loadAllCommands();
    await mongoose.connect(MONGODB_URI);
    console.log('🍃 MongoDB Connected!');
    await startServer();
  } catch (err) {
    console.error('MongoDB Connection Error:', err);
  }
}

main();

