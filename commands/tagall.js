module.exports = {
  name: "tagall",
  alias: ["everyone", "all"],
  desc: "Tag all members in the group",
  async execute(sock, msg, args, from) {
    try {
      // 1. Group එකක්දැයි පරීක්ෂා කිරීම
      if (!from.endsWith("@g.us")) {
        return await sock.sendMessage(from, { text: "❌ මෙම විධානය භාවිත කළ හැක්කේ Groups තුළ පමණි." }, { quoted: msg });
      }

      // 2. React එකක් දැමීම
      await sock.sendMessage(from, { react: { text: "📢", key: msg.key } });

      // 3. Group එකේ සාමාජිකයින් (Metadata) ලබා ගැනීම
      const groupMetadata = await sock.groupMetadata(from);
      const participants = groupMetadata.participants;

      // 4. Custom message එකක් ඇත්නම් එය ලබා ගැනීම
      const customMessage = args.join(" ") || "Attention Everyone!";

      let tagText = `📢 *Group Announcement*\n\n💬 *Message:* ${customMessage}\n\n👥 *Members:*\n`;
      let mentions = [];

      for (let member of participants) {
        tagText += `▫️ @${member.id.split("@")[0]}\n`;
        mentions.push(member.id);
      }

      // 5. සියල්ලන් mention කර message එක යැවීම
      await sock.sendMessage(
        from,
        {
          text: tagText.trim(),
          mentions: mentions
        },
        { quoted: msg }
      );

    } catch (err) {
      console.error("Tagall Error:", err.message);
      await sock.sendMessage(from, { text: "❌ Tagall ක්‍රියාත්මක කිරීමේදී දෝෂයක් මතු විය." }, { quoted: msg });
    }
  }
};
