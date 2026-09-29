const config = require("../config");

module.exports = {
  name: "alive",
  alias: ["bot", "status", "runtime"],
  desc: "Check bot online status and uptime",
  async execute(sock, msg, args, from, { DEVELOPER_NAME }) {
    try {
      await sock.sendMessage(from, { react: { text: "⚡", key: msg.key } });

      const uptimeSec = Math.floor(process.uptime());
      const hours = Math.floor(uptimeSec / 3600);
      const minutes = Math.floor((uptimeSec % 3600) / 60);
      const seconds = uptimeSec % 60;

      const caption = 
`╭───『 𝐃𝐀𝐑𝐊 𝐃𝐈𝐍𝐔 𝐌𝐃 』───◆
│
│ 🤖 *BOT STATUS:* ONLINE
│ ⏱️ *UPTIME:* ${hours}h ${minutes}m ${seconds}s
│ 👑 *DEV:* ${DEVELOPER_NAME}
│ 🌐 *RAM USAGE:* ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)} MB
│
╰──────────────────────────◆
> *DARK DINU MD is working smoothly.* 🔥`;

      await sock.sendMessage(from, {
        image: { url: config.getRandomLogo() },
        caption: caption
      }, { quoted: msg });

    } catch (e) {
      console.error(e);
      await sock.sendMessage(from, { text: "⚠️ Status check failed!" }, { quoted: msg });
    }
  }
};
