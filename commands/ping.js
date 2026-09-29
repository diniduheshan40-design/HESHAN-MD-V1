module.exports = {
  name: "ping",
  alias: ["p", "speed"],
  desc: "Check bot real response speed",
  async execute(sock, msg, args, from) {
    try {
      // 1. User ගේ (.ping / .p / .speed) මැසේජ් එකට 🚀 React එක දානවා
      await sock.sendMessage(from, { react: { text: "🚀", key: msg.key } });

      const start = Date.now();

      // 2. මුලින්ම తాවකාලික message එකක් යවනවා
      const sent = await sock.sendMessage(from, { text: "⚡ *Pinging...*" }, { quoted: msg });

      // 3. යැවීමට ගිය නියම කාලය (Real Latency) ගණනය කිරීම
      const latency = Date.now() - start;

      // 4. කලින් යැවූ message එක Edit කර අවසන් ප්‍රතිඵලය දැමීම
      await sock.sendMessage(from, {
        text: `*Pong \`${latency}ms\` 🔥*`,
        edit: sent.key
      });

      // 5. Bot ගේ Edit වූ message එකට ⚡ React එක දැමීම
      if (sent?.key) {
        await sock.sendMessage(from, { react: { text: "⚡", key: sent.key } });
      }

    } catch (err) {
      console.error("Ping Error:", err.message);
    }
  }
};
