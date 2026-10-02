module.exports = {
  name: "getdp",
  alias: ["dp", "pfp", "profilepic"],
  category: "utility",
  description: "Get profile picture of any number, reply user, or yourself",
  async execute(sock, msg, args, from, context) {
    const { reply, sender } = context;

    try {
      let targetJid = null;

      // 1. මැසේජ් එකේ Text එකෙන් නම්බර් එකක් දී ඇත්නම් (.getdp 071xxxxxxx හෝ .getdp 9471xxxxxxx)
      const inputNumber = args.join(" ").replace(/[^0-9]/g, "").trim();
      if (inputNumber.length >= 9) {
        let cleanNum = inputNumber;
        if (cleanNum.startsWith("0")) {
          cleanNum = "94" + cleanNum.substring(1);
        } else if (!cleanNum.startsWith("94") && cleanNum.length === 9) {
          cleanNum = "94" + cleanNum;
        }
        targetJid = `${cleanNum}@s.whatsapp.net`;
      }

      // 2. Mention කරලා ඇත්නම් (@mention)
      if (!targetJid) {
        const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        if (mentions.length > 0) {
          targetJid = mentions[0];
        }
      }

      // 3. වෙනත් කෙනෙකුගේ මැසේජ් එකකට Reply කර ඇත්නම්
      if (!targetJid) {
        const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;
        if (quotedParticipant) {
          targetJid = quotedParticipant;
        }
      }

      // 4. කිසිවක් දී නැතිනම් පමණක් Command එක Send කළ කෙනාගේ DP එක
      if (!targetJid) {
        targetJid = sender;
      }

      // Final target number extraction
      const cleanTargetNum = targetJid.split("@")[0].replace(/[^0-9]/g, "");

      await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } });

      let dpUrl = null;
      try {
        // High quality profile picture එක WhatsApp server එකෙන් ඉල්ලීම
        dpUrl = await sock.profilePictureUrl(targetJid, "image");
      } catch (err) {
        dpUrl = null;
      }

      // DP එකක් නැතිනම් හෝ Privacy Settings (Nobody/My Contacts) නිසා WhatsApp එකෙන් block කර ඇත්නම්
      if (!dpUrl) {
        await sock.sendMessage(from, { react: { text: "❌", key: msg.key } });
        return await reply(
          `⚠️ *+${cleanTargetNum}* සඳහා Profile Picture එකක් හමු නොවීය.\n\n> හේතුව: DP එකක් දමා නැත හෝ Privacy Settings (My Contacts / Nobody) දමා ඇත.`
        );
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
