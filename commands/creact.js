const mongoose = require("mongoose");

// Shared Multi-Bot Database Collection
const MetaSchema = new mongoose.Schema({
  key: { type: String, unique: true },
  value: mongoose.Schema.Types.Mixed,
  updatedAt: { type: Date, default: Date.now }
});
const BotMeta = mongoose.models.DarkDinuMeta || mongoose.model("DarkDinuMeta", MetaSchema);

module.exports = {
  name: "creact",
  alias: ["channelreact", "chr", "multireact"],
  desc: "Set Reactions to Channel from ALL Active Bots (Developer Only)",
  category: "owner",

  async execute(sock, msg, args, from, { reply, isDev, prefix }) {
    try {
      if (!isDev) {
        return await reply("🚫 *මෙම Command එක භාවිතා කළ හැක්කේ Bot Developer හට පමණි!*");
      }

      const input = args.join(" ").trim();

      if (!input || !input.includes("whatsapp.com/channel/")) {
        return await reply(
          `╭───『 𝐌𝐔𝐋𝐓𝐈-𝐁𝐎𝐓 𝐂𝐇𝐀𝐍𝐍𝐄𝐋 𝐑𝐄𝐀𝐂𝐓 』───◆\n` +
          `│\n` +
          `│ ⚠️ *භාවිතය:*\n` +
          `│ *${prefix}creact <channel_link> , <emojis>*\n` +
          `│\n` +
          `│ 📌 *උදාහරණ:*\n` +
          `│ ${prefix}creact https://whatsapp.com/channel/0029VaXXXXX , 🤪,😜,🙏,🥹\n` +
          `│\n` +
          `│ 💡 *Auto-React Disable කිරීමට:*\n` +
          `│ ${prefix}creact https://whatsapp.com/channel/0029VaXXXXX , off\n` +
          `│\n` +
          `╰──────────────────────────◆\n` +
          `> Active සියලුම Bots ලා හරහා Reactions වැටෙනු ඇත!`
        );
      }

      await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } });

      let channelLink = "";
      let emojiPart = "";

      if (input.includes(",")) {
        const parts = input.split(",");
        channelLink = parts[0].trim();
        emojiPart = parts.slice(1).join(",").trim();
      } else {
        const splitMatch = input.match(/(https:\/\/whatsapp\.com\/channel\/[^\s,]+)(.*)/);
        if (splitMatch) {
          channelLink = splitMatch[1].trim();
          emojiPart = splitMatch[2].replace(/^[.,\s]+/, "").trim();
        }
      }

      const inviteCode = channelLink.split("whatsapp.com/channel/")[1]?.split("/")[0]?.split("?")[0]?.trim();
      if (!inviteCode) {
        return await reply("❌ වලංගු WhatsApp Channel Link එකක් ලබාදෙන්න!");
      }

      const channelMeta = await sock.newsletterMetadata("invite", inviteCode);
      const channelJid = channelMeta?.id;

      if (!channelJid) {
        return await reply("❌ Channel එක සොයාගත නොහැකි විය. Bots ලාට Admin බලතල හෝ Channel access තිබේදැයි බලන්න.");
      }

      const channelName = channelMeta?.name || "WhatsApp Channel";

      if (emojiPart.toLowerCase() === "off") {
        await BotMeta.findOneAndDelete({ key: `creact_${channelJid}` });
        if (global.channelReactMap) {
          global.channelReactMap.delete(channelJid);
        }
        await sock.sendMessage(from, { react: { text: "🔇", key: msg.key } });
        return await reply(`✅ *${channelName}* සඳහා Multi-Bot Auto Reactions අක්‍රිය කරන ලදී!`);
      }

      // Emojis වෙන් කරගැනීම
      const emojiList = emojiPart
        .split(/[,|\s]+/)
        .map(e => e.trim())
        .filter(e => e.length > 0);

      if (emojiList.length === 0) {
        return await reply("⚠️ React කිරීම සඳහා අවම වශයෙන් එක් Emoji එකක් ලබාදෙන්න!");
      }

      // Save to MongoDB (සියලුම bots ලාට sync වීමට)
      await BotMeta.findOneAndUpdate(
        { key: `creact_${channelJid}` },
        { value: emojiList, updatedAt: new Date() },
        { upsert: true }
      );

      if (!global.channelReactMap) global.channelReactMap = new Map();
      global.channelReactMap.set(channelJid, emojiList);

      await sock.sendMessage(from, { react: { text: "🔥", key: msg.key } });

      return await reply(
        `╭───『 𝐌𝐔𝐋𝐓𝐈-𝐁𝐎𝐓 𝐑𝐄𝐀𝐂𝐓 𝐒𝐄𝐓 』───◆\n` +
        `│\n` +
        `│ 📢 *Channel:* ${channelName}\n` +
        `│ 🆔 *JID:* ${channelJid}\n` +
        `│ 🎭 *Emojis:* ${emojiList.join(" ")}\n` +
        `│ 🤖 *Target:* All Active Bots In Cluster\n` +
        `│ ⚡ *Status:* Online & Syncing\n` +
        `│\n` +
        `╰──────────────────────────◆\n` +
        `> දැන් Channel එකේ වැටෙන සෑම post එකකටම active සියලුම bot ලාගෙන් react වැටේ! 🚀`
      );

    } catch (err) {
      console.error("creact error:", err);
      return await reply(`❌ Channel React Error: ${err.message || "Failed to setup"}`);
    }
  }
};
