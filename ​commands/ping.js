module.exports = {
  name: 'ping',
  alias: ['speed', 'p'],
  desc: 'DARK DINU speed testing',
  async execute(sock, msg, args, chatJid) {
    try {
      // JID එක නිවැරදිව තෝරා ගැනීම (Self-chat හෝ DM/Group)
      const targetJid = chatJid || msg.key.remoteJid;
      const start = Date.now();

      // 1. මුලින්ම 🚀 React එක දානවා (Fail උනත් command එක නවතින්නෙ නෑ)
      await sock.sendMessage(targetJid, { 
        react: { text: "🚀", key: msg.key } 
      }).catch(() => {});

      // 2. Initial message එක යවනවා
      let sent = null;
      try {
        sent = await sock.sendMessage(targetJid, { 
          text: '⚡ *Testing speed...*' 
        }, { quoted: msg });
      } catch (e) {
        // Quoted message fail උනොත් quote නැතුව යවනවා
        sent = await sock.sendMessage(targetJid, { 
          text: '⚡ *Testing speed...*' 
        });
      }

      const latency = Date.now() - start;
      const finalReply = `*pong ${latency}ms 🔥*`;

      // 3. ⚡ React එකට මාරු කරනවා
      await sock.sendMessage(targetJid, { 
        react: { text: "⚡", key: msg.key } 
      }).catch(() => {});

      // 4. Message එක Edit කරනවා. Edit බැරි නම් අලුත් එකක් යවනවා.
      if (sent && sent.key) {
        try {
          await sock.sendMessage(targetJid, {
            text: finalReply,
            edit: sent.key
          });
        } catch (editError) {
          await sock.sendMessage(targetJid, { text: finalReply }, { quoted: msg });
        }
      } else {
        await sock.sendMessage(targetJid, { text: finalReply }, { quoted: msg });
      }

    } catch (err) {
      console.error("❌ Ping command error:", err.message);
      // මොන දේ උනත් අන්තිමට මේ මැසේජ් එක හරි යනවා
      const fallbackJid = chatJid || msg.key.remoteJid;
      await sock.sendMessage(fallbackJid, { text: "*pong! DARK DINU is active 🔥*" }).catch(() => {});
    }
  }
};
