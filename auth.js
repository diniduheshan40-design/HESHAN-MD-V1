const mongoose = require('mongoose');
const { 
  default: makeWASocket, 
  delay, 
  fetchLatestBaileysVersion, 
  initAuthCreds, 
  BufferJSON,
  DisconnectReason
} = require('@whiskeysockets/baileys');
const pino = require('pino');

const SessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  data: { type: String, required: true }
});

const SessionModel = mongoose.models.Session || mongoose.model('Session', SessionSchema);

async function useMongoAuthState(sessionId = 'dark_dinu_session') {
  let creds;
  const existing = await SessionModel.findOne({ sessionId });
  
  if (existing && existing.data) {
    try {
      creds = JSON.parse(existing.data, BufferJSON.reviver);
    } catch (e) {
      creds = initAuthCreds();
    }
  } else {
    creds = initAuthCreds();
  }

  const saveCreds = async () => {
    await SessionModel.findOneAndUpdate(
      { sessionId },
      { data: JSON.stringify(creds, BufferJSON.replacer) },
      { upsert: true, new: true }
    );
  };

  return {
    state: {
      creds,
      keys: {
        get: (type, ids) => {
          return ids.reduce((dict, id) => {
            let value = creds[type]?.[id];
            if (value) {
              if (type === 'app-state-sync-key') {
                value = BufferJSON.reviver(type, value);
              }
              dict[id] = value;
            }
            return dict;
          }, {});
        },
        set: (data) => {
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const name = `${category}-${id}`;
              if (value) {
                creds[name] = value;
              } else {
                delete creds[name];
              }
            }
          }
        }
      }
    },
    saveCreds
  };
}

let activePairSocket = null;

async function requestPairCode(phoneNumber, onConnected) {
  // පරණ අසම්පූර්ණ session clear කර නැවුම් connection එකක් ගැනීම
  await SessionModel.deleteOne({ sessionId: 'dark_dinu_session' }).catch(() => {});

  if (activePairSocket) {
    try { activePairSocket.end(); } catch (e) {}
  }

  const { state, saveCreds } = await useMongoAuthState('dark_dinu_session');
  const { version } = await fetchLatestBaileysVersion();

  activePairSocket = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    auth: state,
    browser: ['Ubuntu', 'Chrome', '20.0.04'],
    syncFullHistory: false,
    markOnlineOnConnect: false,
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 10000
  });

  activePairSocket.ev.on('creds.update', saveCreds);

  activePairSocket.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'open') {
      console.log('✅ [DARK DINU] Device linked and verified successfully!');
      if (onConnected) onConnected();
    } else if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code !== DisconnectReason.loggedOut) {
        console.log('[DARK DINU] Pair handshake completed or socket refreshing.');
      }
    }
  });

  let cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
  await delay(3500);
  const pairCode = await activePairSocket.requestPairingCode(cleanNumber);
  return pairCode;
}

module.exports = { useMongoAuthState, requestPairCode, SessionModel };
