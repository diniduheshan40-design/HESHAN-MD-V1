module.exports = {
  name: "ping",
  alias: ["p", "speed"],
  category: "general",
  desc: "Check bot response speed",
  async execute(sock, msg, args, from) {
    try {
      // 1. User ගේ .ping මැසේජ් එකට 🚀 React එක දානවා
      await sock.sendMessage(from, {
        react: {
          text: "🚀",
          key: msg.key
        }
      });

      const start = Date.now();
      
      // 2. Latency එක ගණනය කර Ping Message එක යවනවා
      const latency = Date.now() - start;
      const sent = await sock.sendMessage(from, { 
        text: `⚡ *Pong!* \n⏱️ Speed: *${latency}ms*` 
      }, { quoted: msg });

      // 3. බොට් යවපු Message එකට ⚡ React එක දානවා
      if (sent && sent.key) {
        await sock.sendMessage(from, {
          react: {
            text: "⚡",
            key: sent.key
          }
        });
      }

    } catch (err) {
      console.error("Ping Error:", err.message);
    }
  }
};
