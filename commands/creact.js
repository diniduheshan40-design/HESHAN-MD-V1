module.exports = {
  name: "creact",
  alias: ["channelreact", "chr", "postreact"],
  desc: "React to a specific WhatsApp Channel Post using ALL Active Bots",
  category: "owner",

  async execute(sock, msg, args, from, { reply, isDev, prefix }) {
    try {
      // 1. Developer Only Permission Check
      if (!isDev) {
        return await reply("🚫 *මෙම Command එක භාවිතා කිරීමට අවසර ඇත්තේ Bot Developer හට පමණි!*");
      }

      const input = args.join(" ").trim();

      if (!input || !input.includes("whatsapp.com/channel/")) {
        return await reply(
          `╭───『 𝐂𝐇𝐀𝐍𝐍𝐄𝐋 𝐏𝐎𝐒𝐓 𝐑𝐄𝐀𝐂𝐓 』───◆\n` +
          `│\n` +
          `│ ⚠️ *භාවිතය:*\n` +
          `│ *${prefix}creact <post_link> , <emojis>*\n` +
          `│\n` +
          `│ 📌 *උදාහරණ:*\n` +
          `│ ${prefix}creact https://whatsapp.com/channel/0029VaXXXXX/342 , 🤪,😜,🙏,🥹\n` +
          `│\n` +
          `│ 💡 *සටහන:* Channel Post එක උඩ Long Press කර Copy Link ගත් විට අගට Message ID එක ලැබේ.\n` +
          `│\n` +
          `╰──────────────────────────◆`
        );
      }

      await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } });

      // Link එක සහ Emojis වෙන් කර ගැනීම
      let postLink = "";
      let emojiPart = "";

      if (input.includes(",")) {
        const parts = input.split(",");
        postLink = parts[0].trim();
        emojiPart = parts.slice(1).join(",").trim();
      } else {
        const match = input.match(/(https:\/\/whatsapp\.com\/channel\/[^\s,]+)(.*)/);
        if (match) {
          postLink = match[1].trim();
          emojiPart = match[2].replace(/^[.,\s]+/, "").trim();
        }
      }

      // Link එකෙන් Invite Code එක සහ Server Post ID එක ලබාගැනීම
      const linkParts = postLink.split("whatsapp.com/channel/")[1]?.split("/");
      const inviteCode = linkParts ? linkParts[0]?.trim() : null;
      const serverMessageId = linkParts && linkParts[1] ? linkParts[1].split("?")[0]?.trim() : null;

      if (!inviteCode) {
        return await reply("❌ වලංගු WhatsApp Channel Post Link එකක් ලබාදෙන්න!");
      }

      if (!serverMessageId) {
        return await reply("⚠️ *කරුණාකර නිවැරදි Post Link එකක් ලබාදෙන්න!*\n(Link එකේ අගට Post ID එක තිබිය යුතුය. උදා: `https://whatsapp.com/channel/xxx/123`)");
      }

      // Channel Metadata ලබාගැනීම
      const channelMeta = await sock.newsletterMetadata("invite", inviteCode);
      const channelJid = channelMeta?.id;

      if (!channelJid) {
        return await reply("❌ Channel එක සොයාගත නොහැකි විය. Bots ලාට Admin බලතල හෝ Channel access තිබේදැයි බලන්න.");
      }

      // Emojis Array එකක් කර ගැනීම
      const emojiList = emojiPart
        .split(/[,|\s]+/)
        .map(e => e.trim())
        .filter(e => e.length > 0);

      if (emojiList.length === 0) {
        return await reply("⚠️️ React කිරීමට අවම වශයෙන් එක් Emoji එකක් හෝ ලබාදෙන්න!\n*උදා:* 🤪,😜,🙏,🥹");
      }

      // Active Bots Socket Pool එක ලබාගැනීම
      const botSockets = (global.activeBotSockets && global.activeBotSockets.size > 0)
        ? Array.from(global.activeBotSockets)
        : [sock];

      let successCount = 0;
      let delay = 0;

      // Active ඉන්න සියලුම Bots ලා හරහා තනි Post එකට React කිරීම
      for (let i = 0; i < botSockets.length; i++) {
        const currentSock = botSockets[i];
        const selectedEmoji = emojiList[i % emojiList.length]; // Emojis මාරුවෙන් මාරුවට යැවීම

        setTimeout(async () => {
          try {
            await currentSock.newsletterReactMessage(channelJid, serverMessageId, selectedEmoji);
            successCount++;
          } catch (e) {
            console.error("Single Post React Error:", e.message);
          }
        }, delay);

        delay += 500; // Spam detect නොවී එක පිට එක වැටීමට තත්පර 0.5 ක පරතරයක්
      }

      await sock.sendMessage(from, { react: { text: "🔥", key: msg.key } });

      return await reply(
        `╭───『 𝐑𝐄𝐀𝐂𝐓 𝐒𝐄𝐍𝐓 𝐒𝐔𝐂𝐂𝐄𝐒𝐒 』───◆\n` +
        `│\n` +
        `│ 📢 *Channel:* ${channelMeta?.name || "Channel"}\n` +
        `│ 📌 *Post ID:* ${serverMessageId}\n` +
        `│ 🎭 *Emojis:* ${emojiList.join(" ")}\n` +
        `│ 🤖 *Target Bots:* ${botSockets.length} Active Bots\n` +
        `│ 🚀 *Action:* Reacted to this Post Only!\n` +
        `│\n` +
        `╰──────────────────────────◆`
      );

    } catch (err) {
      console.error("creact error:", err);
      return await reply(`❌ React Error: ${err.message || "Failed to react to channel post"}`);
    }
  }
};
