const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { 
  default: makeWASocket, 
  delay, 
  useMultiFileAuthState, 
  fetchLatestBaileysVersion, 
  makeCacheableSignalKeyStore,
  Browsers,
  DisconnectReason 
} = require('@whiskeysockets/baileys');
const pino = require('pino');

const sessionDir = path.join(__dirname, 'session');

// MongoDB Session Schema
const SessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  files: { type: Map, of: String }
});
const SessionModel = mongoose.models.Session || mongoose.model('Session', SessionSchema);

// Restore session from MongoDB
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
    console.error('Session restore failed:', e);
    return false;
  }
}

// Backup session to MongoDB
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
    console.log('⚡ [DARK DINU] Session synced with MongoDB!');
  } catch (e) {
    console.error('Session backup error:', e);
  }
}

let activeSocket = null;

async function requestPairCode(phoneNumber, onLoginSuccess) {
  // Clear any existing active socket connection
  if (activeSocket) {
    try { 
      activeSocket.ws?.close();
      activeSocket.end(); 
    } catch (e) {}
    activeSocket = null;
  }

  // Clear existing session directory to prevent corrupted state
  if (fs.existsSync(sessionDir)) {
    fs.rmSync(sessionDir, { recursive: true, force: true });
  }
  fs.mkdirSync(sessionDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();
  const logger = pino({ level: 'fatal' });

  activeSocket = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    // Ubuntu Chrome signature prevents handshake drops
    browser: Browsers.ubuntu('Chrome'),
    syncFullHistory: false,
    markOnlineOnConnect: false,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 0,
    keepAliveIntervalMs: 10000
  });

  activeSocket.ev.on('creds.update', async () => {
    await saveCreds();
    await backupCredentials();
  });

  activeSocket.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    
    if (connection === 'open') {
      console.log('🎉 [DARK DINU] WHATSAPP DEVICE LINKED & VERIFIED!');
      await backupCredentials();
      if (onLoginSuccess) onLoginSuccess(activeSocket);
    } else if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      if (statusCode === DisconnectReason.restartRequired) {
        console.log('[DARK DINU] Stream restart required, maintaining connection...');
      } else if (statusCode === DisconnectReason.loggedOut) {
        console.log('[DARK DINU] Session logged out.');
      }
    }
  });

  const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');

  // Wait 4 seconds for socket to establish connection with WhatsApp servers
  await delay(4000);

  if (!activeSocket.authState.creds.registered) {
    const code = await activeSocket.requestPairingCode(cleanNumber);
    return code;
  } else {
    throw new Error('Device already registered.');
  }
}

module.exports = {
  requestPairCode,
  restoreCredentials,
  backupCredentials,
  sessionDir,
  SessionModel,
  getActiveSocket: () => activeSocket
};
