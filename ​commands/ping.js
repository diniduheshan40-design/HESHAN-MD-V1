module.exports = {
  name: 'ping',
  alias: ['speed', 'p'],
  desc: 'Check bot latency with edit animation and reaction',
  category: 'main',
  execute: async (sock, msg, args, { chatJid, botName }) => {
    const startTime = Date.now();

    // 1. මුලින්ම Initial Message එක යැවීම
    const sentMsg = await sock.sendMessage(
      chatJid,
      { text: '⚡ *Testing Speed...*' },
      { quoted: msg }
    );

    // 2. Real Latency එක ගණනය කිරීම
    const latency = Date.now() - startTime;

    // 3. යැවූ message එක speed එක සමඟ Edit කිරීම
    const finalPingText = `*⚡ ${botName} PONG ⚡*\n\n🚀 *Speed :* \`${latency}ms\``;

    await sock.sendMessage(chatJid, {
      text: finalPingText,
      edit: sentMsg.key
    });

    // 4. Command එක සාර්ථක වූ බවට ✅ react එක දැමීම
    await sock.sendMessage(chatJid, {
      react: { text: '✅', key: msg.key }
    }).catch(() => {});
  }
};
