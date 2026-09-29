const config = require("../config");

module.exports = {
  name: "ping",
  alias: ["p", "speed"],
  desc: "Check bot response speed",
  async execute(sock, msg, args, from) {
    try {
      await sock.sendMessage(from, { react: { text: "🚀", key: msg.key } });

      const start = Date.now();
      const latency = Date.now() - start;

      const caption = 
`╭───『 𝐃𝐀𝐑𝐊 𝐃𝐈𝐍𝐔 𝐌𝐃 』───◆
│
│ ⚡ *PONG!*
│ ⏱️ *LATENCY:* ${latency}ms
│ 🤖 *ENGINE:* Baileys Multi-Device
│
╰──────────────────────────◆
> *Speed status normal.* 🔥`;

      const sent = await sock.sendMessage(from, {
        image: { url: config.getRandomLogo() },
        caption: caption
      }, { quoted: msg });

      if (sent?.key) {
        await sock.sendMessage(from, { react: { text: "⚡", key: sent.key } });
      }
    } catch (err) {
      console.error("Ping Error:", err.message);
    }
  }
};
