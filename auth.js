const mongoose = require("mongoose");
const { proto, BufferJSON, initAuthCreds } = require("@whiskeysockets/baileys");

const SessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  data: { type: String, required: true }
});

const SessionModel = mongoose.model("Session", SessionSchema);

const useMongoDBAuthState = async (mongoUri, sessionId = "DARK-DINU-SESSION") => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri);
  }

  const writeData = async (data, id) => {
    const key = `${sessionId}-${id}`;
    const value = JSON.stringify(data, BufferJSON.replacer);
    await SessionModel.findOneAndUpdate(
      { sessionId: key },
      { data: value },
      { upsert: true }
    );
  };

  const readData = async (id) => {
    try {
      const key = `${sessionId}-${id}`;
      const res = await SessionModel.findOne({ sessionId: key });
      if (!res) return null;
      return JSON.parse(res.data, BufferJSON.reviver);
    } catch {
      return null;
    }
  };

  const removeData = async (id) => {
    try {
      const key = `${sessionId}-${id}`;
      await SessionModel.deleteOne({ sessionId: key });
    } catch (err) {
      console.error(err);
    }
  };

  const creds = (await readData("creds")) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}`);
              if (type === "app-state-sync-key" && value) {
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
              const file = `${category}-${id}`;
              tasks.push(value ? writeData(value, file) : removeData(file));
            }
          }
          await Promise.all(tasks);
        }
      }
    },
    saveCreds: () => writeData(creds, "creds")
  };
};

module.exports = { useMongoDBAuthState };

