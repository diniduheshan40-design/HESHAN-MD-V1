module.exports = {
  name: 'ping',
  alias: ['speed', 'p'],
  desc: 'DARK DINU speed testing',
  async execute(sock, msg, args, chatJid) {
    const start = Date.now();
    await sock.sendMessage(chatJid, { react: { text: "⚡", key: msg.key } }).catch(() => {});
    
    const sent = await sock.sendMessage(chatJid, { 
      text: '⚡ *DARK DINU Pinging...*' 
    }, { quoted: msg });

    const end = Date.now();
    const latency = end - start;

    await sock.sendMessage(chatJid, {
      text: `Pong *${latency} ms* ⚡✨\n> *Powered by DARK DINU*`,
      edit: sent.key
    }).catch(async () => {
      await sock.sendMessage(chatJid, { 
        text: `Pong *${latency} ms* ⚡✨\n> *Powered by DARK DINU*` 
      }, { quoted: msg });
    });
  }
};
