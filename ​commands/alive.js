module.exports = {
  name: 'alive',
  alias: ['bot', 'info'],
  desc: 'DARK DINU status check',
  async execute(sock, msg, args, chatJid) {
    try {
      const targetJid = chatJid || msg.key.remoteJid;

      await sock.sendMessage(targetJid, { 
        react: { text: "🩸", key: msg.key } 
      }).catch(() => {});

      const aliveText = 
`╭───『 𝐃𝐀𝐑𝐊 𝐃𝐈𝐍𝐔 𝐌𝐃 』───◆
│
│ 🩸 *STATUS:* Online & Alive!
│ ⚡ *SPEED:* Lightning Fast
│ 👑 *DEVELOPER:* DINIDU HESHAN
│ 📞 *DEV NUMBER:* +94719845166
│ 🌐 *VERSION:* 2.1.0 (Multi-Device)
│
╰───────────────────────◆
> *DARK DINU WhatsApp Userbot is running perfectly.* 🔥`;

      await sock.sendMessage(targetJid, { text: aliveText }, { quoted: msg });
    } catch (err) {
      console.error("Alive command error:", err.message);
    }
  }
};
