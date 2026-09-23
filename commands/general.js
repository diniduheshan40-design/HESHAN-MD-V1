module.exports = {
  ping: async (sock, from, msg) => {
    const start = Date.now();
    await sock.sendMessage(from, { text: "⚡ *Testing Latency...*" }, { quoted: msg });
    const end = Date.now();
    await sock.sendMessage(from, { text: `Pong! 🚀\n*Speed:* ${end - start}ms` }, { quoted: msg });
  },

  menu: async (sock, from, msg) => {
    const menuText = `
*╭━━━〔 DARK DINU MD 〕━━━╮*
┃ *Prefix:* .
┃ *Status:* Online (MongoDB)
┃ *Creator:* Dinidu Heshan
╰━━━━━━━━━━━━━━━━━━━━━━╯

*AVAILABLE COMMANDS:*
┌───「 *CORE* 」
│ ✦ *.ping* - Test response time
│ ✦ *.menu* - Show this menu
│ ✦ *.alive* - Check system stats
└───────────────
`;
    await sock.sendMessage(from, { text: menuText.trim() }, { quoted: msg });
  }
};

