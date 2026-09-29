module.exports = {
  name: 'ping',
  alias: ['speed', 'p'],
  desc: 'DARK DINU speed testing',
  async execute(sock, msg, args, chatJid) {
    try {
      // JID එක හරියටම තෝරා ගැනීම (Self-chat, DM හෝ Group)
      const targetJid = chatJid || msg.key.remoteJid;
      const start = Date.now();

      // 1. Initial React 🚀 (Error ආවත් command එක නවතින්නෙ නෑ)
      await sock.sendMessage(targetJid, { 
        react: { text: "🚀", key: msg.key } 
      }).catch(() => {});

      // 2. Initial Message එක යැවීම
      let sent = null;
      try {
        sent = await sock.sendMessage(targetJid, { 
          text: '⚡ *Testing speed...*' 
        }, { quoted: msg });
      } catch (e) {
        sent = await sock.sendMessage(targetJid, { 
          text: '⚡ *Testing speed...*' 
        });
      }

      const latency = Date.now() - start;
      const finalReply = `*pong ${latency}ms 🔥*`;

      // 3. React එක ⚡ බවට මාරු කිරීම
      await sock.sendMessage(targetJid, { 
        react: { text: "⚡", key: msg.key } 
      }).catch(() => {});

      // 4. Message Edit කිරීම (Edit fail උනොත් කෙලින්ම reply එක යැවීම)
      if (sent && sent.key) {
        try {
          await sock.sendMessage(targetJid, {
            text: finalReply,
            edit: sent.key
          });
        } catch (editErr) {
          await sock.sendMessage(targetJid, { text: finalReply }, { quoted: msg });
        }
      } else {
        await sock.sendMessage(targetJid, { text: finalReply }, { quoted: msg });
      }

    } catch (err) {
      console.error("❌ Ping command error:", err.message);
      // මොනම error එකක් ආවත් මේ text එක අනිවාර්යයෙන්ම යනවා
      const fallbackJid = chatJid || msg.key.remoteJid;
      await sock.sendMessage(fallbackJid, { text: "*pong! DARK DINU is active 🔥*" }).catch(() => {});
    }
  }
};
