module.exports = {
  name: "pin",
  alias: ["pinmsg"],
  desc: "Pin a replied message for 7 days",
  async execute(sock, msg, args, from) {
    try {
      // 1. Reply (Quoted) කර ඇති message එකක් තිබේදැයි සොයා ගැනීම
      const contextInfo =
        msg.message?.extendedTextMessage?.contextInfo ||
        msg.message?.imageMessage?.contextInfo ||
        msg.message?.videoMessage?.contextInfo;

      const targetKey = {
        remoteJid: from,
        id: contextInfo?.stanzaId,
        participant: contextInfo?.participant
      };

      if (!targetKey.id) {
        return await sock.sendMessage(
          from,
          { text: "⚠️️ කරුණාකර Pin කිරීමට අවශ්‍ය message එකට `.pin` ලෙස reply කරන්න." },
          { quoted: msg }
        );
      }

      // 2. Processing react එකක් දැමීම
      await sock.sendMessage(from, { react: { text: "📌", key: msg.key } });

      // 3. Message එක දින 7කට (604,800s) Pin කිරීම
      // type: 1 = Pin, 0 = Unpin
      await sock.relayMessage(
        from,
        {
          pinInChatMessage: {
            key: targetKey,
            type: 1,
            time: 604800 // 7 days in seconds (7 * 24 * 60 * 60)
          }
        },
        {}
      );

      // 4. තහවුරු කිරීමේ message එක යැවීම
      await sock.sendMessage(
        from,
        { text: "✅ Message එක දින 7ක් සඳහා සාර්ථකව Pin කරන ලදී!" },
        { quoted: msg }
      );

    } catch (err) {
      console.error("Pin Error:", err.message);
      await sock.sendMessage(
        from,
        { text: "❌ Message එක Pin කිරීමට නොහැකි විය. Bot ට Admin බලතල තිබේදැයි පරීක්ෂා කරන්න." },
        { quoted: msg }
      );
    }
  }
};
