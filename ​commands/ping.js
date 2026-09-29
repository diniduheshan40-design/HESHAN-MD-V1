module.exports = {
  name: 'ping',
  alias: ['speed', 'p'],
  desc: 'DARK DINU speed testing',
  async execute(sock, msg, args, chatJid) {
    try {
      const targetJid = chatJid || msg.key.remoteJid;
      const start = Date.now();

      // 1. මුලින්ම command එක ආපු ගමන් 🚀 react එක දානවා
      await sock.sendMessage(targetJid, { 
        react: { text: "🚀", key: msg.key } 
      }).catch(() => {});

      // 2. Initial Message එක යවනවා
      const sent = await sock.sendMessage(targetJid, { 
        text: '⚡ *Testing speed...*' 
      }, { quoted: msg });

      const end = Date.now();
      const latency = end - start;

      // 3. Command එක complete උනාට පස්සේ ⚡ react එකට මාරු කරනවා
      await sock.sendMessage(targetJid, { 
        react: { text: "⚡", key: msg.key } 
      }).catch(() => {});

      const finalReply = `*pong ${latency}ms 🔥*`;

      // 4. කලින් යවපු message එක edit කරලා ලස්සනට පෙන්වනවා
      if (sent && sent.key) {
        await sock.sendMessage(targetJid, {
          text: finalReply,
          edit: sent.key
        }).catch(async () => {
          // Edit එක fail උනොත් (WhatsApp version issue එකක් ආවොත්) කෙලින්ම reply එක යවනවා
          await sock.sendMessage(targetJid, { text: finalReply }, { quoted: msg });
        });
      } else {
        await sock.sendMessage(targetJid, { text: finalReply }, { quoted: msg });
      }

    } catch (err) {
      console.error("❌ Ping command error:", err.message);
    }
  }
};
