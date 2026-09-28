const mongoose = require('mongoose');
const { default: makeWASocket, delay, fetchLatestBaileysVersion, initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');
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
  // කලින් අසාර්ථක වූ session එකක් ඇත්නම් clear කරමු
  await SessionModel.deleteOne({ sessionId: 'dark_dinu_session' }).catch(() => {});

  const { state, saveCreds } = await useMongoAuthState('dark_dinu_session');
  const { version, isLatest } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    auth: state,
    // නව WhatsApp update වලට ගැලපෙන standard browser signature එක
    browser: ['Ubuntu', 'Chrome', '20.0.04']
  });

  sock.ev.on('creds.update', saveCreds);

  if (!sock.authState.creds.registered) {
    let cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
    
    // Pairing code එක ඉල්ලීමට පෙර තත්පර 4ක් delay කිරීම (Block වීම වළක්වයි)
    await delay(4000);
    
    try {
      const code = await sock.requestPairingCode(cleanNumber);
      if (onPairCode) onPairCode(code);
    } catch (err) {
      console.error('Pairing Code Request Error:', err);
      throw err;
    }
  }

  return sock;
}

module.exports = { useMongoAuthState, getPairingCode, SessionModel };
