const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { 
  default: makeWASocket, 
  useMultiFileAuthState, 
  fetchLatestBaileysVersion, 
  makeCacheableSignalKeyStore,
  DisconnectReason 
} = require('@whiskeysockets/baileys');
const pino = require('pino');

const sessionDir = path.join(__dirname, 'session');

// MongoDB Session Storage Schema
const SessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  files: { type: Map, of: String }
});
const SessionModel = mongoose.models.Session || mongoose.model('Session', SessionSchema);

// MongoDB එකෙන් session restore කිරීම
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

// Session එක සම්පූර්ණයෙන්ම MongoDB එකට backup කිරීම
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
    console.log('⚡ [DARK DINU] Complete session saved to MongoDB!');
  } catch (e) {
    console.error('Session backup failed:', e);
  }
}

let activeSocket = null;

async function requestPairCode(phoneNumber, onLoginSuccess) {
  // කලින් open කරපු socket තියෙනවා නම් close කරමු
  if (activeSocket) {
    try { activeSocket.end(); } catch (e) {}
    activeSocket = null;
  }

  // පරණ හිරවුණු session folder එක clear කරමු
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
    // Standard Chrome Browser
    browser: ['Ubuntu', 'Chrome', '20.0.04'],
    syncFullHistory: false,
    markOnlineOnConnect: false,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 15000
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
        console.log('[DARK DINU] Handshake maintaining...');
      }
    }
  });

  let cleanNumber = phoneNumber.replace(/[^0-9]/g, '');

  // 💡 ප්‍රධානම වෙනස: WhatsApp එකෙන් Handshake QR Frame එක ආපු මොහොතේදීම Code එක ඉල්ලීම
  return new Promise((resolve, reject) => {
    let codeSent = false;

    // Timeout safety
    const timer = setTimeout(() => {
      if (!codeSent) {
        reject(new Error('WhatsApp connection timeout. Refresh page & try again.'));
      }
    }, 30000);

    activeSocket.ev.on('connection.update', async (update) => {
      const { qr } = update;
      if (qr && !activeSocket.authState.creds.registered && !codeSent) {
        codeSent = true;
        clearTimeout(timer);
        try {
          // Socket එක ready වූ සැණින් Code එක ලබාගැනීම
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
  SessionModel
};
