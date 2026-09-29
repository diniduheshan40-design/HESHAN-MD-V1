module.exports = {
  name: "ping",
  alias: ["p", "speed"],
  category: "general",
  desc: "Check bot response speed",
  async execute(sock, msg, args, from) {
    const start = Date.now();
    const sent = await sock.sendMessage(from, { text: "📍 *Testing Ping...*" }, { quoted: msg });
    const latency = Date.now() - start;
    
    await sock.sendMessage(from, { 
      text: `⚡ *Pong!* \n⏱️ Speed: *${latency}ms*` 
    }, { quoted: sent });
  }
};
