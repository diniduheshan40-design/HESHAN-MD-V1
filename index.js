require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const pino = require('pino');
const mongoose = require('mongoose');
const { 
  default: makeWASocket, 
  fetchLatestBaileysVersion, 
  useMultiFileAuthState, 
  makeCacheableSignalKeyStore,
  DisconnectReason 
} = require('@whiskeysockets/baileys');

const { 
  requestPairCode, 
  restoreCredentials, 
  backupCredentials, 
  sessionDir 
} = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://diniduheshan40_db_user:Heshan2007@cluster0.5gazebm.mongodb.net/HESHAN-MD?retryWrites=true&w=majority&appName=Cluster0";

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let botSocket = null;

// ==========================================
// 1. Web Terminal UI
// ==========================================
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>⚡ DARK DINU // PAIR ENGINE</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;600;700&family=Orbitron:wght@700;900&display=swap" rel="stylesheet">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          background-color: #030406;
          color: #00ffaa;
          font-family: 'Fira Code', monospace;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .terminal-container { width: 92%; max-width: 480px; }
        .terminal-box {
          background: rgba(8, 10, 14, 0.95);
          border: 1px solid #ff0044;
          box-shadow: 0 0 35px rgba(255, 0, 68, 0.3);
          border-radius: 6px;
          overflow: hidden;
        }
        .terminal-bar {
          background: #11141b;
          padding: 10px 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid #242938;
        }
        .dots { display: flex; gap: 6px; }
        .dot { width: 10px; height: 10px; border-radius: 50%; }
        .dot-red { background: #ff0044; }
        .dot-yellow { background: #ffaa00; }
        .dot-green { background: #00ffaa; }
        .terminal-title {
          font-family: 'Orbitron', sans-serif;
          font-size: 11px;
          letter-spacing: 2px;
          color: #ff0044;
        }
        .terminal-body { padding: 30px 24px; text-align: center; }
        h1 {
          font-family: 'Orbitron', sans-serif;
          font-size: 26px;
          letter-spacing: 3px;
          color: #ffffff;
          text-shadow: 0 0 10px #ff0044;
          margin-bottom: 4px;
        }
        p.subtitle { font-size: 11px; letter-spacing: 2px; color: #6a7485; margin-bottom: 20px; }
        .input-group { margin-bottom: 20px; text-align: left; }
        label {
          display: block;
          font-size: 11px;
          letter-spacing: 1.5px;
          color: #ff3366;
          margin-bottom: 8px;
          text-transform: uppercase;
        }
        input {
          width: 100%;
          padding: 14px 15px;
          background: #050608;
          border: 1px solid #232936;
          color: #00ffaa;
          font-family: 'Fira Code', monospace;
          font-size: 17px;
          border-radius: 4px;
          outline: none;
        }
        button {
          width: 100%;
          padding: 14px;
          background: #ff0044;
          border: none;
          color: #ffffff;
          font-family: 'Orbitron', sans-serif;
          font-size: 13px;
          font-weight: 900;
          letter-spacing: 2px;
          border-radius: 4px;
          cursor: pointer;
        }
        button:disabled { background: #252833; color: #616675; cursor: not-allowed; }
        .result-terminal {
          display: none;
          margin-top: 22px;
          padding: 18px;
          background: #050608;
          border: 1px dashed #ff0044;
          border-radius: 4px;
        }
        .pair-badge {
          font-family: 'Orbitron', monospace;
          font-size: 28px;
          font-weight: 900;
          letter-spacing: 6px;
          color: #ffffff;
          text-shadow: 0 0 15px #00ffaa;
          padding: 8px 0;
          cursor: pointer;
        }
        .copy-tag { font-size: 11px; color: #798294; margin-top: 5px; }
      </style>
    </head>
    <body>
      <div class="terminal-container">
        <div class="terminal-box">
          <div class="terminal-bar">
            <div class="dots">
              <div class="dot dot-red"></div>
              <div class="dot dot-yellow"></div>
              <div class="dot dot-green"></div>
            </div>
            <div class="terminal-title">DARK DINU // V2.0.0</div>
          </div>
          <div class="terminal-body">
            <h1>⚡ DARK DINU ⚡</h1>
            <p class="subtitle">Next-Gen Pair Code Injector</p>

            <div class="input-group">
              <label>> Target WhatsApp Number</label>
              <input type="text" id="phone" placeholder="94770000000" autocomplete="off" />
            </div>

            <button id="runBtn" onclick="executePair()">[ GET PAIR CODE ]</button>

            <div id="resultBlock" class="result-terminal">
              <div style="font-size: 10px; color: #ff3366;">> CLICK CODE TO COPY</div>
              <div id="pairCode" class="pair-badge" onclick="copyProtocol()">--------</div>
              <div id="copyTag" class="copy-tag">> ENTER THIS IN WHATSAPP NOW</div>
            </div>
          </div>
        </div>
      </div>

      <script>
        async function executePair() {
          const number = document.getElementById('phone').value.trim();
          if (!number) return alert('Phone number එක ඇතුළත් කරන්න!');

          const btn = document.getElementById('runBtn');
          btn.innerText = 'HANDSHAKING WITH WHATSAPP...';
          btn.disabled = true;

          try {
            const res = await fetch('/pair', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ number })
            });
            const data = await res.json();
            if (data.code) {
              document.getElementById('resultBlock').style.display = 'block';
              document.getElementById('pairCode').innerText = data.code;
              btn.innerText = 'CODE READY! ENTER IN WHATSAPP';
            } else {
              alert(data.error || 'Pairing error!');
              btn.innerText = '[ GET PAIR CODE ]';
              btn.disabled = false;
            }
          } catch (e) {
            alert('Host failure: ' + e.message);
            btn.innerText = '[ GET PAIR CODE ]';
            btn.disabled = false;
          }
        }

        function copyProtocol() {
          const code = document.getElementById('pairCode').innerText;
          if (code && code !== '--------') {
            navigator.clipboard.writeText(code);
            const tag = document.getElementById('copyTag');
            tag.innerText = '>> COPIED! ENTER IN WHATSAPP <<';
            tag.style.color = '#00ffaa';
            setTimeout(() => {
              tag.innerText = '> ENTER THIS IN WHATSAPP NOW';
              tag.style.color = '#798294';
            }, 3000);
          }
        }
      </script>
    </body>
    </html>
  `);
});

app.post('/pair', async (req, res) => {
  const { number } = req.body;
  if (!number) return res.status(400).json({ error: 'Phone number parameter required.' });

  try {
    const code = await requestPairCode(number, (socket) => {
      botSocket = socket;
      setupMessageHandler(botSocket);
    });
    return res.json({ code });
  } catch (err) {
    console.error('Pairing Error:', err);
    return res.status(500).json({ error: err.message || 'Mainframe rejection.' });
  }
});

app.listen(PORT, () => console.log(`⚡ [DARK DINU] Web Server live on port ${PORT}`));

// ==========================================
// 2. Command Loading
// ==========================================
const commands = new Map();
const commandsDir = path.join(__dirname, 'commands');

if (fs.existsSync(commandsDir)) {
  fs.readdirSync(commandsDir).forEach(file => {
    if (file.endsWith('.js')) {
      const cmd = require(path.join(commandsDir, file));
      if (cmd.name) {
        commands.set(cmd.name, cmd);
        if (cmd.alias && Array.isArray(cmd.alias)) {
          cmd.alias.forEach(al => commands.set(al, cmd));
        }
      }
    }
  });
}

function setupMessageHandler(sock) {
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const chatJid = msg.key.remoteJid;
    const textMsg = (
      msg.message.conversation || 
      msg.message.extendedTextMessage?.text || 
      msg.message.imageMessage?.caption || ''
    ).trim();

    const prefix = '.';
    if (!textMsg.startsWith(prefix)) return;

    const [cmdName, ...args] = textMsg.slice(prefix.length).trim().split(/ +/);
    const cmd = commands.get(cmdName.toLowerCase());

    if (cmd) {
      try {
        await cmd.execute(sock, msg, args, chatJid);
      } catch (err) {
        console.error(`Execution error in ${cmdName}:`, err);
      }
    }
  });
}

// ==========================================
// 3. Bot Startup
// ==========================================
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();
  const logger = pino({ level: 'fatal' });

  botSocket = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    browser: ['Chrome (Linux)', 'Chrome', '124.0.0.0'],
    connectTimeoutMs: 120000,
    keepAliveIntervalMs: 25000
  });

  botSocket.ev.on('creds.update', async () => {
    await saveCreds();
    await backupCredentials();
  });

  botSocket.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('⚡ [DARK DINU] Reconnecting...', shouldReconnect);
      if (shouldReconnect) startBot();
    } else if (connection === 'open') {
      console.log('☠️ [DARK DINU] SYSTEM FULLY CONNECTED VIA MONGODB!');
    }
  });

  setupMessageHandler(botSocket);
}

// ==========================================
// 4. Database Init
// ==========================================
async function init() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ [DARK DINU] Connected to MongoDB!');

    const restored = await restoreCredentials();
    if (restored && fs.existsSync(path.join(sessionDir, 'creds.json'))) {
      console.log('🔄 [DARK DINU] Active session found. Starting bot...');
      startBot();
    } else {
      console.log('ℹ️ [DARK DINU] No saved session found. Ready for web pairing.');
    }
  } catch (err) {
    console.error('❌ MongoDB Connection Error:', err);
  }
}

init();
