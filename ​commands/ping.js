module.exports = {
  name: 'ping',
  alias: ['speed', 'p'],
  desc: 'DARK DINU speed testing',
  async execute(sock, msg, args, chatJid) {
    try {
      const targetJid = chatJid || msg.key.remoteJid;
      const start = Date.now();

      // Reaction එකක් දානවා
      await sock.sendMessage(targetJid, { 
        react: { text: "⚡", key: msg.key } 
      }).catch(() => {});

      // Pinging message එක යවනවා
      const sent = await sock.sendMessage(targetJid, { 
        text: '⚡ *DARK DINU Pinging...*' 
      }, { quoted: msg });

      const end = Date.now();
      const latency = end - start;

      const replyText = `🏓 *Pong:* ${latency} ms ⚡\n> *Powered by DARK DINU*`;

      // Message එක Edit කරන්න ට්‍රයි කරනවා, බැරි උනොත් අලුත් එකක් යවනවා
      if (sent && sent.key) {
        await sock.sendMessage(targetJid, {
          text: replyText,
          edit: sent.key
        }).catch(async () => {
          await sock.sendMessage(targetJid, { text: replyText }, { quoted: msg });
        });
      } else {
        await sock.sendMessage(targetJid, { text: replyText }, { quoted: msg });
      }
    } catch (err) {
      console.error("❌ Ping command error:", err.message);
    }
  }
};
