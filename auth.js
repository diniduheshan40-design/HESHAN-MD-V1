const mongoose = require('mongoose');
const { proto, initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');

// MongoDB Schema for storing Baileys Auth State
const AuthSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    value: { type: String, required: true }
  },
  { versionKey: false }
);

const Auth = mongoose.models.Auth || mongoose.model('Auth', AuthSchema);

/**
 * Custom MongoDB Auth State for Baileys
 * @param {string} sessionId - Phone number or unique session ID
 */
async function useMongoDBAuthState(sessionId) {
  const cleanId = String(sessionId).replace(/[^0-9]/g, '');

  const writeData = async (data, id) => {
    try {
      const key = `${cleanId}-${id}`;
      const value = JSON.stringify(data, BufferJSON.replacer);
      await Auth.findByIdAndUpdate(key, { value }, { upsert: true });
    } catch (e) {
      console.error(`Auth Write Error (${id}):`, e.message);
    }
  };

  const readData = async (id) => {
    try {
      const key = `${cleanId}-${id}`;
      const doc = await Auth.findById(key).lean();
      if (!doc || !doc.value) return null;
      return JSON.parse(doc.value, BufferJSON.reviver);
    } catch (e) {
      return null;
    }
  };

  const removeData = async (id) => {
    try {
      const key = `${cleanId}-${id}`;
      await Auth.findByIdAndDelete(key);
    } catch (e) {
      console.error(`Auth Delete Error (${id}):`, e.message);
    }
  };

  // 1. Initial creds load or initialize new creds
  const creds = (await readData('creds')) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}`);
              if (type === 'app-state-sync-key' && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              data[id] = value;
            })
          );
          return data;
        },
        set: async (data) => {
          const tasks = [];
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              tasks.push(value ? writeData(value, key) : removeData(key));
            }
          }
          await Promise.all(tasks);
        }
      }
    },
    saveCreds: () => writeData(creds, 'creds'),
    clearSessionData: async () => {
      try {
        await Auth.deleteMany({ _id: new RegExp(`^${cleanId}-`) });
      } catch (e) {
        console.error('Failed to clear session data:', e.message);
      }
    }
  };
}

module.exports = {
  Auth,
  useMongoDBAuthState
};

