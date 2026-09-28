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
  DisconnectReason 
} = require('@whiskeysockets/baileys');

const { 
  requestPairCode, 
  restoreSessionFromMongo, 
  backupSessionToMongo, 
  sessionPath 
} = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://diniduheshan40_db_user:Heshan2007@cluster0.5gazebm.mongodb.net/HESHAN-MD?retryWrites=true&w=majority&appName=Cluster0";

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let sockInstance = null;

// ============================================================================
// 💀 DARK DINU OFFICIAL HACKER-THEMED PAIRING CONSOLE 💀
// ============================================================================
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>☠️ DARK DINU // MAINFRAME PAIR PROTOCOL</title>
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
          overflow-x: hidden;
          position: relative;
        }

        /* Scanline Overlay */
        body::before {
          content: " ";
          position: fixed;
          inset: 0;
          background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.4) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.04), rgba(0, 255, 170, 0.02), rgba(0, 0, 255, 0.04));
          z-index: 10;
          background-size: 100% 3px, 6px 100%;
          pointer-events: none;
        }

        .terminal-container {
          width: 92%;
          max-width: 480px;
          position: relative;
          z-index: 20;
        }

        .terminal-box {
          background: rgba(8, 10, 14, 0.95);
          border: 1px solid #ff0044;
          box-shadow: 0 0 35px rgba(255, 0, 68, 0.3), inset 0 0 15px rgba(255, 0, 68, 0.1);
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
        .dot-red { background: #ff0044; box-shadow: 0 0 8px #ff0044; }
        .dot-yellow { background: #ffaa00; }
        .dot-green { background: #00ffaa; }

        .terminal-title {
          font-family: 'Orbitron', sans-serif;
          font-size: 11px;
          letter-spacing: 2px;
          color: #ff0044;
          text-transform: uppercase;
        }

        .terminal-body {
          padding: 30px 24px;
        }

        .brand-header {
          text-align: center;
          margin-bottom: 25px;
        }

        .brand-header h1 {
          font-family: 'Orbitron', sans-serif;
          font-size: 26px;
          letter-spacing: 3px;
          color: #ffffff;
          text-shadow: 0 0 10px #ff0044, 0 0 20px #ff0044;
          margin-bottom: 4px;
        }

        .brand-header p {
          font-size: 11px;
          letter-spacing: 2px;
          color: #6a7485;
          text-transform: uppercase;
        }

        .status-beacon {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          color: #00ffaa;
          background: rgba(0, 255, 170, 0.08);
          padding: 4px 10px;
          border-radius: 4px;
          border: 1px solid rgba(0, 255, 170, 0.2);
          margin-top: 10px;
        }

        .beacon-light {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #00ffaa;
          box-shadow: 0 0 8px #00ffaa;
          animation: blink 1.2s infinite;
        }

        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.2; }
        }

        .input-group {
          margin-bottom: 20px;
          text-align: left;
        }

        .input-group label {
          display: block;
          font-size: 11px;
          letter-spacing: 1.5px;
          color: #ff3366;
          margin-bottom: 8px;
          text-transform: uppercase;
        }

        .terminal-input {
          width: 100%;
          padding: 13px 15px;
          background: #050608;
          border: 1px solid #232936;
          color: #00ffaa;
          font-family: 'Fira Code', monospace;
          font-size: 16px;
          border-radius: 4px;
          outline: none;
          transition: 0.3s;
        }

        .terminal-input:focus {
          border-color: #ff0044;
          box-shadow: 0 0 15px rgba(255, 0, 68, 0.4);
        }

        .hack-btn {
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
          transition: all 0.3s ease;
          box-shadow: 0 0 20px rgba(255, 0, 68, 0.4);
          text-transform: uppercase;
        }

        .hack-btn:hover {
          background: #d60039;
          box-shadow: 0 0 30px rgba(255, 0, 68, 0.8);
          transform: translateY(-1px);
        }

        .hack-btn:disabled {
          background: #252833;
          color: #616675;
          cursor: not-allowed;
          box-shadow: none;
          transform: none;
        }

        .result-terminal {
          display: none;
          margin-top: 22px;
          padding: 18px;
          background: #050608;
          border: 1px dashed #ff0044;
          border-radius: 4px;
          text-align: center;
          animation: slideUp 0.3s ease-out;
        }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .code-title {
          font-size: 10px;
          letter-spacing: 2px;
          color: #ff3366;
          text-transform: uppercase;
          margin-bottom: 6px;
        }

        .pair-badge {
          font-family: 'Orbitron', monospace;
          font-size: 28px;
          font-weight: 900;
          letter-spacing: 6px;
          color: #ffffff;
          text-shadow: 0 0 12px #00ffaa, 0 0 24px #00ffaa;
          padding: 8px 0;
          cursor: pointer;
        }

        .copy-tag {
          font-size: 10px;
          letter-spacing: 1px;
          color: #798294;
          text-transform: uppercase;
        }

        .system-status {
          margin-top: 25px;
          font-size: 10px;
          letter-spacing: 1px;
          color: #434957;
          text-align: center;
        }
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
            <div class="terminal-title">AUTH CONSOLE // V2.0.0</div>
            <div style="font-size: 10px; color: #555;">SSH:PORT 3000</div>
          </div>

          <div class="terminal-body">
            <div class="brand-header">
              <h1>⚡ DARK DINU ⚡</h1>
              <p>Secure Multi-Device Protocol Injector</p>
              <div class="status-beacon">
                <div class="beacon-light"></div>
                CORE ENGINE: ONLINE
              </div>
            </div>

            <div class="input-group">
              <label>> Target Phone Number (with Country Code)</label>
              <input type="text" id="phone" class="terminal-input" placeholder="94770000000" autocomplete="off" />
            </div>

            <button id="runBtn" class="hack-btn" onclick="executePair()">[ INITIALIZE LINK ]</button>

            <div id="resultBlock" class="result-terminal">
              <div class="code-title">> PAIR CODE GENERATED // CLICK TO COPY</div>
              <div id="pairCode" class="pair-badge" onclick="copyProtocol()">--------</div>
              <div id="copyTag" class="copy-tag">> STATUS: READY FOR WHATSAPP PAIRING</div>
            </div>

            <div class="system-status">
              [ SECURED VIA MONGO-CLOUD // ZERO-DATA EXPIRE ]
            </div>
          </div>
        </div>
      </div>

      <script>
        async function executePair() {
          const phoneInput = document.getElementById('phone');
          const number = phoneInput.value.trim();
          if (!number) return alert('Input valid WhatsApp number.');

          const btn = document.getElementById('runBtn');
          btn.innerText = 'INJECTING HANDSHAKE...';
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
              btn.innerText = 'AUTHENTICATING ON DEVICE...';
            } else {
              alert(data.error || 'Authentication aborted.');
              btn.innerText = '[ INITIALIZE LINK ]';
              btn.disabled = false;
            }
          } catch (e) {
            alert('Host failure: ' + e.message);
            btn.innerText = '[ INITIALIZE LINK ]';
            btn.disabled = false;
          }
        }

        function copyProtocol() {
          const code = document.getElementById('pairCode').innerText;
          if (code && code !== '--------') {
            navigator.clipboard.writeText(code);
            const tag = document.getElementById('copyTag');
            tag.innerText = '>> COPIED TO CLIPBOARD! ENTER IN WHATSAPP <<';
            tag.style.color = '#00ffaa';
            setTimeout(() => {
              tag.innerText = '> STATUS: READY FOR WHATSAPP PAIRING';
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
      sockInstance = socket;
      setupMessageHandler(sockInstance);
    });
    return res.json({ code });
  } catch (err) {
    console.error('Pairing Error:', err);
    return res.status(500).json({ error: err.message || 'Mainframe rejection.' });
  }
});

app.listen(PORT, () => console.log(`💀 [DARK DINU] Hacker Web Terminal active on port ${PORT}`));

// ==========================================
// 2. Command Handler Loading
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

    // 1, 2, 3 Interactive replies
    const quotedMsgId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
    if (quotedMsgId && ['1', '2', '3'].includes(textMsg)) {
      const songCmd = commands.get('song');
      if (songCmd) {
        return await songCmd.execute(sock, msg, [textMsg], chatJid);
      }
    }

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
// 3. Bot Connection Lifecycle
// ==========================================
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();

  sockInstance = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    auth: state,
    browser: ['Ubuntu', 'Chrome', '120.0.6099.199'],
    connectTimeoutMs: 90000,
    defaultQueryTimeoutMs: 90000,
    keepAliveIntervalMs: 15000
  });

  sockInstance.ev.on('creds.update', async () => {
    await saveCreds();
    await backupSessionToMongo();
  });

  sockInstance.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('⚡ [DARK DINU] Connection link dropped. Rebooting protocol...', shouldReconnect);
      if (shouldReconnect) startBot();
    } else if (connection === 'open') {
      console.log('☠️ [DARK DINU] SYSTEM CONNECTED TO WHATSAPP VIA CLOUD SESSION!');
    }
  });

  setupMessageHandler(sockInstance);
}

// ==========================================
// 4. Initialize Database & Session Restore
// ==========================================
async function init() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('☠️ [DARK DINU] MongoDB Mainframe Connected (Cluster: HESHAN-MD)!');

    const restored = await restoreSessionFromMongo();
    if (restored && fs.existsSync(path.join(sessionPath, 'creds.json'))) {
      console.log('🔄 [DARK DINU] Cloud Auth Matrix restored. Launching daemon...');
      startBot();
    } else {
      console.log('ℹ️ [DARK DINU] No active session found. Awaiting web pairing injection.');
    }
  } catch (err) {
    console.error('❌ MongoDB Connection Error:', err);
  }
}

init();
