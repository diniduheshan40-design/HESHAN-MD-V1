const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { 
  default: makeWASocket, 
  delay, 
  useMultiFileAuthState, 
  fetchLatestBaileysVersion, 
  makeCacheableSignalKeyStore,
  DisconnectReason,
  Browsers 
} = require('@whiskeysockets/baileys');
const pino = require('pino');

const sessionDir = path.join(__dirname, 'session');

// MongoDB Session Storage Schema
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
      const realFileName = fileName.replace(/__dot__/g, '.');
      fs.writeFileSync(path.join(sessionDir, realFileName), content, 'utf-8');
    }
    return true;
  } catch (e) {
    console.error('Session restore failed:', e);
    return false;
  }
}

// Backup session to MongoDB (Fixed: Dots sanitized)
async function backupCredentials() {
  try {
    if (!fs.existsSync(sessionDir)) return;
    const fileList = fs.readdirSync(sessionDir);
    const filesMap = new Map();

    for (let file of fileList) {
      const filePath = path.join(sessionDir, file);
      if (fs.statSync(filePath).isFile()) {
        const safeFileName = file.replace(/\./g, '__dot__');
        filesMap.set(safeFileName, fs.readFileSync(filePath, 'utf-8'));
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
  if (activeSocket) {
    try { 
      activeSocket.end(); 
    } catch (e) {}
    activeSocket = null;
  }

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
    // Desktop signature bypass for cloud hosts
    browser: Browsers.macOS('Desktop'),
    syncFullHistory: false,
    markOnlineOnConnect: false,
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 15000,
    defaultQueryTimeoutMs: 0
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
        console.log('[DARK DINU] Stream restart required, holding connection...');
      } else if (statusCode === DisconnectReason.loggedOut) {
        console.log('[DARK DINU] Logged out from WhatsApp.');
      }
    }
  });

  const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
  await delay(2000);

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
