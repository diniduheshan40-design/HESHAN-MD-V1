const mongoose = require('mongoose');
const NodeCache = require('node-cache');
const { proto, BufferJSON, initAuthCreds } = require('@whiskeysockets/baileys');

const AuthSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    data: { type: String, required: true }
  },
  { collection: 'auths', versionKey: false }
);

const Auth = mongoose.models.Auth || mongoose.model('Auth', AuthSchema);

// ⚡ High-Performance RAM Cache (Memory Leak වැළැක්වීමට maxKeys සීමා කර ඇත)
const keyCache = new NodeCache({ stdTTL: 1800, checkperiod: 300, maxKeys: 4000 });

async function useMongoDBAuthState(sessionId) {
  const cleanSessionId = String(sessionId).replace(/[^0-9]/g, '');

  const writeData = async (data, id) => {
    try {
      const serialized = JSON.stringify(data, BufferJSON.replacer);
      const cacheKey = `${cleanSessionId}-${id}`;
      keyCache.set(cacheKey, serialized);
      
      Auth.updateOne(
        { _id: cacheKey },
        { $set: { data: serialized } },
        { upsert: true }
      ).catch(err => console.error(`☠️ [DARK DINU DB WRITE ERROR] (${id}):`, err.message));
    } catch (err) {
      console.error(`☠️ [DARK DINU SERIALIZE ERROR] (${id}):`, err.message);
    }
  };

  const readData = async (id) => {
    try {
      const cacheKey = `${cleanSessionId}-${id}`;
      let dataStr = keyCache.get(cacheKey);

      if (!dataStr) {
        const doc = await Auth.findOne({ _id: cacheKey }).lean();
        if (doc && doc.data) {
          dataStr = doc.data;
          keyCache.set(cacheKey, dataStr);
        }
      }

      return dataStr ? JSON.parse(dataStr, BufferJSON.reviver) : null;
    } catch (error) {
      return null;
    }
  };

  const creds = (await readData('creds')) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          const missingIds = [];

          for (const id of ids) {
            const cacheKey = `${cleanSessionId}-${type}-${id}`;
            const cachedVal = keyCache.get(cacheKey);
            if (cachedVal) {
              try {
                let value = JSON.parse(cachedVal, BufferJSON.reviver);
                if (type === 'app-state-sync-key' && value) {
                  value = proto?.Message?.AppStateSyncKeyData ? proto.Message.AppStateSyncKeyData.fromObject(value) : value;
                }
                data[id] = value;
              } catch (e) {
                missingIds.push(id);
              }
            } else {
              missingIds.push(id);
            }
          }

          if (missingIds.length === 0) return data;

          try {
            const queryIds = missingIds.map(id => `${cleanSessionId}-${type}-${id}`);
            const records = await Auth.find({ _id: { $in: queryIds } }).lean();
            const recordMap = new Map();

            for (const item of records) {
              const baseId = item._id.replace(`${cleanSessionId}-${type}-`, '');
              recordMap.set(baseId, item.data);
              keyCache.set(item._id, item.data);
            }

            for (const id of missingIds) {
              let value = null;
              if (recordMap.has(id)) {
                try {
                  value = JSON.parse(recordMap.get(id), BufferJSON.reviver);
                  if (type === 'app-state-sync-key' && value) {
                    value = proto?.Message?.AppStateSyncKeyData ? proto.Message.AppStateSyncKeyData.fromObject(value) : value;
                  }
                } catch (e) {}
              }
              data[id] = value;
            }
          } catch (e) {
            console.error(`☠️ [DARK DINU KEY FETCH ERROR] (${type}):`, e.message);
          }

          return data;
        },
        set: async (data) => {
          const bulkOps = [];
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const key = `${cleanSessionId}-${category}-${id}`;

              if (value) {
                const serialized = JSON.stringify(value, BufferJSON.replacer);
                keyCache.set(key, serialized);
                bulkOps.push({
                  updateOne: {
                    filter: { _id: key },
                    update: { $set: { data: serialized } },
                    upsert: true
                  }
                });
              } else {
                keyCache.del(key);
                bulkOps.push({
                  deleteOne: {
                    filter: { _id: key }
                  }
                });
              }
            }
          }

          if (bulkOps.length > 0) {
            Auth.bulkWrite(bulkOps, { ordered: false }).catch(err => {
              console.error('☠️ [DARK DINU BULKWRITE ERROR]:', err.message);
            });
          }
        }
      }
    },
    saveCreds: () => writeData(creds, 'creds'),
    clearSessionData: async () => {
      try {
        const prefix = `${cleanSessionId}-`;
        const keysInCache = keyCache.keys();
        for (const k of keysInCache) {
          if (k.startsWith(prefix)) {
            keyCache.del(k);
          }
        }
        await Auth.deleteMany({
          _id: new RegExp('^' + cleanSessionId + '-')
        });
      } catch (e) {
        console.error('☠️ [DARK DINU SESSION PURGE ERROR]:', e.message);
      }
    }
  };
}

module.exports = { useMongoDBAuthState, Auth };
