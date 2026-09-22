const mongoose = require('mongoose');
const { proto, initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');

// MongoDB Schema for storing Baileys Auth State
const AuthSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true }
  },
  { versionKey: false, timestamps: true }
);

const Auth = mongoose.models.Auth || mongoose.model('Auth', AuthSchema);

/**
 * High-Performance Bulk MongoDB Auth State for Baileys
 * @param {string} sessionId - Phone number or unique session ID
 */
async function useMongoDBAuthState(sessionId) {
  const cleanId = String(sessionId).replace(/[^0-9]/g, '');

  const writeData = async (data, id) => {
    try {
      const key = `${cleanId}-${id}`;
      const value = JSON.parse(JSON.stringify(data, BufferJSON.replacer));
      await Auth.findByIdAndUpdate(key, { value }, { upsert: true, setDefaultsOnInsert: true });
    } catch (e) {
      console.error(`Auth Write Error (${id}):`, e.message);
    }
  };

  const readData = async (id) => {
    try {
      const key = `${cleanId}-${id}`;
      const doc = await Auth.findById(key).lean();
      if (!doc || !doc.value) return null;
      return JSON.parse(JSON.stringify(doc.value), BufferJSON.reviver);
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
          const keysToFetch = ids.map((id) => `${cleanId}-${type}-${id}`);
          
          try {
            // Bulk read - Single database roundtrip for all keys
            const docs = await Auth.find({ _id: { $in: keysToFetch } }).lean();
            const docsMap = new Map();
            for (const doc of docs) {
              docsMap.set(doc._id, doc.value);
            }

            for (const id of ids) {
              const fullKey = `${cleanId}-${type}-${id}`;
              const rawVal = docsMap.get(fullKey);
              if (rawVal) {
                let value = JSON.parse(JSON.stringify(rawVal), BufferJSON.reviver);
                if (type === 'app-state-sync-key' && value) {
                  value = proto.Message.AppStateSyncKeyData.fromObject(value);
                }
                data[id] = value;
              } else {
                data[id] = null;
              }
            }
          } catch (err) {
            console.error(`Auth Bulk Get Error (${type}):`, err.message);
          }

          return data;
        },
        set: async (data) => {
          const bulkOps = [];

          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const key = `${cleanId}-${category}-${id}`;

              if (value) {
                const serialized = JSON.parse(JSON.stringify(value, BufferJSON.replacer));
                bulkOps.push({
                  updateOne: {
                    filter: { _id: key },
                    update: { $set: { value: serialized } },
                    upsert: true
                  }
                });
              } else {
                bulkOps.push({
                  deleteOne: {
                    filter: { _id: key }
                  }
                });
              }
            }
          }

          // Single BulkWrite query for instant write execution (Zero latency drop)
          if (bulkOps.length > 0) {
            try {
              await Auth.bulkWrite(bulkOps, { ordered: false });
            } catch (err) {
              console.error('Auth BulkWrite Error:', err.message);
            }
          }
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
