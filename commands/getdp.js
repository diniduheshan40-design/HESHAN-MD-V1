module.exports = {
  name: "getdp",
  alias: ["dp", "pfp", "profilepic"],
  category: "utility",
  description: "Get profile picture of any number, reply user or yourself",
  async execute(sock, msg, args, from, context) {
    const { reply, sender } = context;

    try {
      await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } });

      let targetJid = null;

      // 1. Mention කරලා ඇත්නම්
      const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
      if (mentions.length > 0) {
        targetJid = mentions[0];
      }

      // 2. මැසේජ් එකකට Reply කර ඇත්නම්
      const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;
      if (!targetJid && quotedParticipant) {
        targetJid = quotedParticipant;
      }

      // 3. Number එකක් text එකක් විදිහට ලබා දී ඇත්නම් (.getdp 9471xxxxxxx)
      if (!targetJid && args[0]) {
        let cleanNumber = args[0].replace(/[^0-9]/g, "");
        if (cleanNumber.startsWith("0")) {
          cleanNumber = "94" + cleanNumber.substring(1);
        }
        if (cleanNumber.length >= 10) {
          targetJid = `${cleanNumber}@s.whatsapp.net`;
        }
      }

      // 4. කිසිවක් නැත්නම් තමන්ගේ හෝ චැට් එකේ එවූ කෙනාගේ DP එක
      if (!targetJid) {
        targetJid = sender;
      }

      const cleanTargetNum = targetJid.split("@")[0].replace(/[^0-9]/g, "");

      // Baileys හරහා high-res profile picture එක ලබා ගැනීම
      let dpUrl;
      try {
        dpUrl = await sock.profilePictureUrl(targetJid, "image");
      } catch (err) {
        dpUrl = null;
      }

      if (!dpUrl) {
        await sock.sendMessage(from, { react: { text: "❌", key: msg.key } });
        return await reply(`⚠️ +${cleanTargetNum} සඳහා Profile Picture එකක් හමු නොවීය හෝ එය Private කර ඇත.`);
      }

      const caption = 
`╭───『 👤 𝐏𝐑𝐎𝐅𝐈𝐋𝐄 𝐃𝐏 』───◆
│
│ 👤 *User:* +${cleanTargetNum}
│ 🌐 *Quality:* High Definition
│
╰───────────────────────◆
> *ᴅᴀʀᴋ ᴅɪɴᴜ ᴍᴅ 🐦‍🔥*`;

      await sock.sendMessage(
        from,
        {
          image: { url: dpUrl },
          caption: caption
        },
        { quoted: msg }
      );

      await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
    } catch (error) {
      console.error("Error in getdp:", error);
      await sock.sendMessage(from, { react: { text: "❌", key: msg.key } });
      await reply(`❌ DP එක ලබා ගැනීමේදී දෝෂයක් මතු විය: ${error.message}`);
    }
  }
};
