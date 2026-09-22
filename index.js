// ============================================================================
// 📦 PACKAGES
// ============================================================================
const express = require('express');
const pino = require('pino');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const NodeCache = require('node-cache');
const {
  default: makeWASocket,
  DisconnectReason,
  delay,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

// 🟢 Crash Guards
process.on('uncaughtException', (err) => console.log('🛡️ Exception:', err?.message || err));
process.on('unhandledRejection', (err) => console.log('🛡️ Rejection:', err?.message || err));

const BOT_NAME = 'HESHAN MD V1';
const MONGODB_URI = 'mongodb+srv://diniduheshan40_db_user:Heshan2007@cluster0.5gazebm.mongodb.net/?appName=Cluster0';
const { useMongoDBAuthState, Auth } = require('./auth');

const activeSessions = {};
const commands = new Map();

// ============================================================================
// 📂 COMMAND LOADER (Ping සහ අනෙකුත් commands)
// ============================================================================
function loadAllCommands() {
  const cmdDir = path.join(__dirname, 'commands');
  if (!fs.existsSync(cmdDir)) return;
  const files = fs.readdirSync(cmdDir).filter((f) => f.endsWith('.js'));
  for (const file of files) {
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
    } catch (e) {}
  }
}

// ============================================================================
// 🌐 UI PORTAL (CYAN / NEON BLUE THEME)
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
          --bg-core: #040914;
          --panel-bg: rgba(7, 16, 38, 0.82);
          --accent-blue: #0284c7;
          --accent-glow: rgba(14, 165, 233, 0.45);
          --blue-bright: #38bdf8;
          --blue-soft: #7dd3fc;
          --border-glass: rgba(56, 189, 248, 0.28);
          --border-focus: rgba(56, 189, 248, 0.8);
          --text-main: #f0f9ff;
          --text-muted: #94a3b8;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }
        
        body {
          background-color: var(--bg-core);
          background-image: 
            radial-gradient(circle at 50% 0%, rgba(14, 165, 233, 0.25) 0%, transparent 60%),
            radial-gradient(circle at 10% 90%, rgba(3, 105, 161, 0.18) 0%, transparent 45%);
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
          backdrop-filter: blur(28px) saturate(180%);
          -webkit-backdrop-filter: blur(28px) saturate(180%);
          border: 1px solid var(--border-glass);
          border-radius: 28px;
          padding: 44px 34px;
          width: 100%;
          max-width: 440px;
          text-align: center;
          box-shadow: 
            0 24px 60px rgba(0, 0, 0, 0.75),
            0 0 50px var(--accent-glow);
          position: relative;
          overflow: hidden;
        }

        .portal-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(90deg, transparent, var(--blue-bright), transparent);
        }

        .badge-status {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: var(--blue-soft);
          background: rgba(14, 165, 233, 0.14);
          border: 1px solid rgba(56, 189, 248, 0.35);
          padding: 6px 16px;
          border-radius: 30px;
          margin-bottom: 20px;
        }

        .badge-dot {
          width: 7px;
          height: 7px;
          background: var(--blue-bright);
          border-radius: 50%;
          box-shadow: 0 0 10px var(--blue-bright);
        }

        .app-title {
          font-size: 32px;
          font-weight: 800;
          letter-spacing: -0.5px;
          background: linear-gradient(135deg, #ffffff 40%, var(--blue-bright) 80%, var(--accent-blue) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          margin-bottom: 8px;
        }

        .app-desc {
          font-size: 13.5px;
          color: var(--text-muted);
          margin-bottom: 30px;
          font-weight: 400;
        }

        .phone-input {
          width: 100%;
          padding: 16px 20px;
          border-radius: 16px;
          border: 1px solid var(--border-glass);
          background: rgba(2, 6, 23, 0.75);
          color: var(--text-main);
          font-size: 17px;
          font-weight: 600;
          letter-spacing: 0.8px;
          text-align: center;
          outline: none;
          margin-bottom: 16px;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .phone-input::placeholder {
          color: rgba(240, 249, 255, 0.3);
          font-weight: 400;
          letter-spacing: 0;
        }

        .phone-input:focus {
          border-color: var(--border-focus);
          box-shadow: 0 0 25px rgba(56, 189, 248, 0.45);
          background: rgba(4, 11, 30, 0.95);
        }

        .btn-action {
          width: 100%;
          padding: 16px;
          border-radius: 16px;
          border: none;
          background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
          color: #ffffff;
          font-size: 14.5px;
          font-weight: 700;
          letter-spacing: 0.5px;
          cursor: pointer;
          transition: all 0.25s ease;
          box-shadow: 0 8px 24px rgba(2, 132, 199, 0.4);
          margin-bottom: 12px;
        }

        .btn-action:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 30px rgba(56, 189, 248, 0.55);
          background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
        }

        .btn-action:active {
          transform: translateY(0);
        }

        .btn-reset {
          width: 100%;
          padding: 13px;
          border-radius: 14px;
          border: 1px solid rgba(56, 189, 248, 0.3);
          background: rgba(14, 165, 233, 0.1);
          color: var(--blue-soft);
          font-size: 12.5px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.25s ease;
        }

        .btn-reset:hover {
          background: rgba(14, 165, 233, 0.22);
          border-color: var(--blue-bright);
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
          color: #e0f2fe;
          background: rgba(14, 165, 233, 0.18);
          border: 1.5px dashed var(--blue-bright);
          padding: 18px;
          border-radius: 16px;
          cursor: pointer;
          transition: all 0.25s ease;
        }

        .code-box:hover {
          background: rgba(14, 165, 233, 0.28);
          border-color: #ffffff;
          transform: scale(1.02);
        }

        .copy-tag {
          font-size: 11.5px;
          color: var(--text-muted);
          margin-top: 8px;
          font-weight: 500;
        }

        .footer-note {
          margin-top: 28px;
          font-size: 11px;
          letter-spacing: 1px;
          color: rgba(255, 255, 255, 0.3);
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
        <button class="btn-reset" onclick="cleanSessionSlot()">CLEAN PREVIOUS SESSION</button>

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
              alert('✅ Pairing Code: ' + data.code + '\\n\\nතත්පර 30ක් ඇතුළත WhatsApp හි Link with phone number වෙත දමන්න!');
            } else {
              alert(data.error || 'Connection Failed! Reload කර නැවත බලන්න.');
            }
          } catch(e) {
            alert('Server error! Please refresh and retry.');
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
// 💬 MESSAGE & COMMAND HANDLER (Ping Fix)
// ============================================================================
function handleMessages(sock) {
  sock.ev.on('messages.upsert', async ({ messages }) => {
    try {
      const msg = messages[0];
      if (!msg || !msg.message || msg.key?.remoteJid?.endsWith('@newsletter')) return;

      const chatJid = msg.key.remoteJid;
      const text = (
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption ||
        ''
      ).trim();

      if (!text.startsWith('.') && !text.startsWith('!') && !text.startsWith('#')) return;

      const args = text.slice(1).trim().split(/ +/);
      const cmdName = args.shift().toLowerCase();
      const cmd = commands.get(cmdName);

      if (cmd) {
        const executor = typeof cmd === 'function' ? cmd : (cmd.execute || cmd.run);
        if (executor) {
          const reply = async (content) => {
            const payload = typeof content === 'string' ? { text: content } : content;
            return sock.sendMessage(chatJid, payload, { quoted: msg }).catch(() => sock.sendMessage(chatJid, payload));
          };
          await executor(sock, msg, args, chatJid, reply, { isOwner: true });
        }
      }
    } catch (e) {}
  });
}

// ============================================================================
// 🔌 WHATSAPP CORE (Rock-Solid Linker Engine)
// ============================================================================
async function connectWhatsApp(phoneNumber) {
  if (activeSessions[phoneNumber]) {
    try {
      activeSessions[phoneNumber].ev.removeAllListeners();
      activeSessions[phoneNumber].ws?.close();
    } catch (e) {}
    delete activeSessions[phoneNumber];
  }

  const { state, saveCreds, clearSessionData } = await useMongoDBAuthState(phoneNumber);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307] }));

  const sock = makeWASocket({
    version,
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' })) },
    logger: pino({ level: 'fatal' }),
    printQRInTerminal: false,
    // Google Chrome profile keeps the socket connection alive during pairing handshake
    browser: ['Chrome (Linux)', 'Chrome', '114.0.5735.198'],
    markOnlineOnConnect: false,
    syncFullHistory: false,
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 15000,
    defaultQueryTimeoutMs: 0
  });

  activeSessions[phoneNumber] = sock;

  // Listen for credential changes and persist immediately
  sock.ev.on('creds.update', async () => {
    await saveCreds();
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
      console.log(`✅ [${phoneNumber}] WhatsApp Link සාර්ථකයි! Device Connected.`);
      handleMessages(sock);
    } else if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode;
      console.log(`⚠️ Connection Closed (${phoneNumber}), Status Code:`, reason);

      if (reason === DisconnectReason.loggedOut || reason === 401) {
        console.log(`❌ Logged out (${phoneNumber})`);
        delete activeSessions[phoneNumber];
        if (clearSessionData) await clearSessionData();
      } else {
        // Auto reconnect for transient disconnections
        setTimeout(() => connectWhatsApp(phoneNumber), 4000);
      }
    }
  });

  return sock;
}

// ============================================================================
// 🌐 HTTP SERVER & API
// ============================================================================
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
      if (activeSessions[num]) {
        activeSessions[num].ev.removeAllListeners();
        activeSessions[num].ws?.close();
        delete activeSessions[num];
      }
      await Auth.deleteMany({ _id: new RegExp('^' + num, 'i') });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/pair', async (req, res) => {
    let num = req.query.num;
    if (!num) return res.status(400).json({ error: 'Number required' });
    num = num.replace(/[^0-9]/g, '');

    try {
      await Auth.deleteMany({ _id: new RegExp('^' + num, 'i') });

      const sock = await connectWhatsApp(num);

      // WebSocket Handshake delay
      await delay(4000);

      if (!sock.authState.creds.registered) {
        let code = await sock.requestPairingCode(num);
        code = code?.match(/.{1,4}/g)?.join('-') || code;
        console.log(`🔑 Pairing Code generated for ${num}: ${code}`);
        return res.json({ code });
      } else {
        return res.status(400).json({ error: 'Session already active. Clean session and retry!' });
      }
    } catch (err) {
      console.log('Pair Error:', err.message);
      return res.status(500).json({ error: 'Rate limited. Please wait 15 seconds!' });
    }
  });

  app.listen(port, () => console.log(`🚀 [${BOT_NAME}] Server running on port ${port}`));

  // Saved sessions reconnect
  try {
    const saved = await Auth.find({ _id: /-creds$/ }).lean();
    for (const s of saved) {
      const pNum = s._id.split('-creds')[0];
      await connectWhatsApp(pNum);
      await delay(5000);
    }
  } catch (e) {}
}

async function main() {
  try {
    loadAllCommands();
    await mongoose.connect(MONGODB_URI);
    console.log('🍃 MongoDB Connected!');
    await startServer();
  } catch (e) {
    console.log('Mongo Error:', e.message);
  }
}

main();

