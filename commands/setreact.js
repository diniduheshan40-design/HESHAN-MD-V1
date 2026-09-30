module.exports = {
  name: "setreact",
  alias: ["setstatusreact", "statusreact"],
  desc: "Set custom status react emoji for THIS bot only",
  async execute(sock, msg, args, from, { isOwner, reply }) {
    try {
      // 1. මේ bot ගේ Phone Number එක ලබා ගැනීම
      const botNumber = (sock.user?.id || "").split(":")[0].replace(/[^0-9]/g, "");
      if (!botNumber) {
        return await reply("❌ Bot ගේ අංකය හඳුනාගත නොහැකි විය.");
      }

      // 2. අදාළ Bot එක run කරන්නේ තමන්ගේම number එකෙන් නම් හෝ Developer නම් පමණක් ඉඩ දීම
      const senderNumber = (msg.key.participant || from).split("@")[0].replace(/[^0-9]/g, "");
      const isBotHost = senderNumber === botNumber;

      if (!isOwner && !isBotHost) {
        return await reply("❌ මෙම Command එක භාවිත කළ හැක්කේ මේ Bot ගේ අයිතිකරුට පමණි!");
      }

      const emoji = args[0]?.trim();

      if (!emoji) {
        return await reply(
          `⚠️ කරුණාකර Emoji එකක් ලබාදෙන්න!\n\n*උදාහරණ:*\n• \`.setreact 🥺\`\n• \`.setreact ❤️\`\n• \`.setreact off\` (React නවත්වන්න)`
        );
      }

      const mongoose = require("mongoose");
      const BotMeta = mongoose.models.DarkDinuMeta;

      // Map එකක් ලෙස memory එක තබා ගැනීම (botNumber -> emoji)
      if (!global.statusReactMap) {
        global.statusReactMap = new Map();
      }

      const metaKey = `status_react_${botNumber}`;

      if (emoji.toLowerCase() === "off") {
        await BotMeta.findOneAndUpdate(
          { key: metaKey },
          { value: "off" },
          { upsert: true }
        );
        global.statusReactMap.set(botNumber, "off");
        return await reply(`🛑 +${botNumber} සඳහා Status Auto React අක්‍රීය (OFF) කරන ලදී!`);
      }

      // MongoDB එකේ මේ bot ගේ number එකට අදාළව පමණක් save කිරීම
      await BotMeta.findOneAndUpdate(
        { key: metaKey },
        { value: emoji },
        { upsert: true }
      );

      // Memory එකේ අදාළ bot ට පමණක් emoji එක update කිරීම
      global.statusReactMap.set(botNumber, emoji);

      await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
      await reply(
`╭───『 𝐒𝐓𝐀𝐓𝐔𝐒 𝐑𝐄𝐀𝐂𝐓 𝐔𝐏𝐃𝐀𝐓𝐄 』───◆
│
│ 🤖 *Bot Number:* +${botNumber}
│ ✨ *Custom Emoji:* ${emoji}
│ ⚡ *Auto Seen:* ACTIVE
│ 🔒 *Scope:* This Bot Only
│
╰──────────────────────────◆
> *මෙම වෙනස බලපාන්නේ මෙම Bot (+${botNumber}) හට පමණි.*`
      );

    } catch (err) {
      console.error("SetReact Error:", err.message);
      await reply(`❌ දෝෂයක් සිදුවිය: ${err.message}`);
    }
  }
};
