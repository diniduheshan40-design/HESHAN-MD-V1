const mongoose = require('mongoose');
const { default: makeWASocket, delay, fetchLatestBaileysVersion, Browsers, initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');
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

async function getPairingCode(phoneNumber, onPairCode) {
  const { state, saveCreds } = await useMongoAuthState();
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    auth: state,
    browser: Browsers.macOS('Desktop')
  });

  sock.ev.on('creds.update', saveCreds);

  if (!sock.authState.creds.registered) {
    let cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
    await delay(3000);
    const code = await sock.requestPairingCode(cleanNumber);
    if (onPairCode) onPairCode(code);
  }

  return sock;
}

module.exports = { useMongoAuthState, getPairingCode, SessionModel };
