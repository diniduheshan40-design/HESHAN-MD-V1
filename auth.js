const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { 
  default: makeWASocket, 
  useMultiFileAuthState, 
  fetchLatestBaileysVersion, 
  makeCacheableSignalKeyStore,
  Browsers,
  DisconnectReason 
} = require('@whiskeysockets/baileys');
const pino = require('pino');

const sessionDir = path.join(__dirname, 'session');

// MongoDB Session Model
const SessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  files: { type: Map, of: String }
});
const SessionModel = mongoose.models.Session || mongoose.model('Session', SessionSchema);

// Cloud එකෙන් Session Restore කිරීම
async function restoreCredentials() {
  try {
    const doc = await SessionModel.findOne({ sessionId: 'dark_dinu_session' });
    if (!doc || !doc.files || doc.files.size === 0) return false;

    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    for (let [fileName, content] of doc.files.entries()) {
      fs.writeFileSync(path.join(sessionDir, fileName), content, 'utf-8');
    }
    return true;
  } catch (e) {
    console.error('[DATABASE] Session restore failed:', e);
    return false;
  }
}

// Session එක Cloud එකට Backup කිරීම
async function backupCredentials() {
  try {
    if (!fs.existsSync(sessionDir)) return;
    const fileList = fs.readdirSync(sessionDir);
    const filesMap = new Map();

    for (let file of fileList) {
      const filePath = path.join(sessionDir, file);
      if (fs.statSync(filePath).isFile()) {
        filesMap.set(file, fs.readFileSync(filePath, 'utf-8'));
      }
    }

    await SessionModel.findOneAndUpdate(
      { sessionId: 'dark_dinu_session' },
      { files: filesMap },
      { upsert: true, new: true }
    );
    console.log('⚡ [DARK DINU] Session cloud-synced to MongoDB!');
  } catch (e) {
    console.error('[DATABASE] Backup error:', e);
  }
}

let activeSocket = null;

// Pairing Code ලබාගැනීම
async function requestPairCode(phoneNumber, onLoginSuccess) {
  if (activeSocket) {
    try { activeSocket.end(); } catch (e) {}
    activeSocket = null;
  }

  if (fs.existsSync(sessionDir)) {
    fs.rmSync(sessionDir, { recursive: true, force: true });
  }
  fs.mkdirSync(sessionDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();
  const logger = pino({ level: 'silent' });

  activeSocket = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    browser: Browsers.macOS('Chrome'),
    syncFullHistory: false,
    markOnlineOnConnect: false,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 10000
  });

  activeSocket.ev.on('creds.update', async () => {
    await saveCreds();
    await backupCredentials();
  });

  activeSocket.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    
    if (connection === 'open') {
      console.log('🎉 [DARK DINU] WHATSAPP DEVICE LINKED SUCCESSFULLY!');
      await backupCredentials();
      if (onLoginSuccess) onLoginSuccess(activeSocket);
    } else if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      if (statusCode !== DisconnectReason.loggedOut) {
        console.log('[DARK DINU] Tunnel active, finalizing keys...');
      }
    }
  });

  let cleanNumber = phoneNumber.replace(/[^0-9]/g, '');

  return new Promise((resolve, reject) => {
    let codeDone = false;
    const timer = setTimeout(() => {
      if (!codeDone) {
        reject(new Error('WhatsApp connection timeout. Please refresh and try again.'));
      }
    }, 25000);

    activeSocket.ev.on('connection.update', async (update) => {
      const { qr } = update;
      if (qr && !activeSocket.authState.creds.registered && !codeDone) {
        codeDone = true;
        clearTimeout(timer);
        try {
          const code = await activeSocket.requestPairingCode(cleanNumber);
          resolve(code);
        } catch (err) {
          reject(err);
        }
      }
    });
  });
}

module.exports = {
  requestPairCode,
  restoreCredentials,
  backupCredentials,
  sessionDir,
  SessionModel,
  getActiveSocket: () => activeSocket
};
