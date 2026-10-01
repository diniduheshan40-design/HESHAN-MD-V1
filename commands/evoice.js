const mongoose = require("mongoose");

const MetaSchema = new mongoose.Schema({
  key: { type: String, unique: true },
  value: mongoose.Schema.Types.Mixed
});
const BotMeta = mongoose.models.DarkDinuMeta || mongoose.model("DarkDinuMeta", MetaSchema);

module.exports = {
  name: "evoice",
  alias: ["emojivoice", "ev"],
  desc: "Enable or Disable Emoji Voice Reaction System",
  category: "owner",

  async execute(sock, msg, args, from, extra = {}) {
    try {
      if (!extra?.isOwner) {
        return await sock.sendMessage(from, { 
          text: "⚠️ *මෙම Command එක භාවිතා කළ හැක්කේ Bot Owner හට පමණි.*" 
        }, { quoted: msg });
      }

      const status = args[0]?.toLowerCase();

      if (status === "on") {
        await BotMeta.findOneAndUpdate(
          { key: "evoice_status" },
          { value: true },
          { upsert: true }
        );
        global.evoiceEnabled = true;

        await sock.sendMessage(from, { react: { text: "🔊", key: msg.key } });
        return await sock.sendMessage(from, { 
          text: "✅ *Emoji Voice System එක ON කරන ලදී!* 🎙️✨\n\nදැන් අදාළ Emojis වලට Voice Notes send වේවි." 
        }, { quoted: msg });

      } else if (status === "off") {
        await BotMeta.findOneAndUpdate(
          { key: "evoice_status" },
          { value: false },
          { upsert: true }
        );
        global.evoiceEnabled = false;

        await sock.sendMessage(from, { react: { text: "🔇", key: msg.key } });
        return await sock.sendMessage(from, { 
          text: "❌ *Emoji Voice System එක OFF කරන ලදී!* 🤫" 
        }, { quoted: msg });

      } else {
        const isCurrentlyOn = global.evoiceEnabled ?? false;
        return await sock.sendMessage(from, { 
          text: `╭───『 𝐄𝐌𝐎𝐉𝐈 𝐕𝐎𝐈𝐂𝐄 𝐒𝐘𝐒𝐓𝐄𝐌 』───◆
│
│ 🔘 *Status:* ${isCurrentlyOn ? "🟢 ENABLED (ON)" : "🔴 DISABLED (OFF)"}
│
│ 📌 *Commands:*
│ ├ .evoice on  - System එක On කිරීමට
│ └ .evoice off - System එක Off කිරීමට
│
╰──────────────────────────◆` 
        }, { quoted: msg });
      }

    } catch (e) {
      console.error("EVOICE Command Error:", e);
      return await sock.sendMessage(from, { text: `❌ Error: ${e.message}` }, { quoted: msg });
    }
  }
};
