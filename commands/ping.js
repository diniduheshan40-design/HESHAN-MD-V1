// commands/ping.js
const { performance } = require('perf_hooks');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = {
  name: 'ping',
  alias: ['speed', 'p', 'latency'],
  category: 'general',
  desc: 'Initiate mainframe latency & breach speed diagnostics',

  async execute(sock, msg, args, chatJid) {
    const targetChat = (typeof chatJid === 'string' && chatJid.includes('@')) 
      ? chatJid 
      : (msg.key && msg.key.remoteJid ? msg.key.remoteJid : null);

    if (!targetChat) return;

    // 1. Cyber Hacker Reaction
    await sock.sendMessage(targetChat, { react: { text: "☣️", key: msg.key } }).catch(() => {});

    try {
      const startTime = performance.now();

      // 2. Initial Terminal Breach Log
      const initText = `\`\`\`[DARK DINU :: TERMINAL]\`\`\`\n` +
                       `> INITIATING PROTOCOL...\n` +
                       `> BYPASSING ENCRYPTION [ 25% ] ▓░░░`;

      const sentMsg = await sock.sendMessage(targetChat, { 
        text: initText,
        ...global.channelContext 
      }, { quoted: msg }).catch(async () => {
        return await sock.sendMessage(targetChat, { text: initText }).catch(() => null);
      });

      if (!sentMsg) return;

      // 3. Step 2 Simulation Edit
      await delay(450);
      await sock.sendMessage(targetChat, {
        text: `\`\`\`[DARK DINU :: TERMINAL]\`\`\`\n` +
              `> INITIATING PROTOCOL...\n` +
              `> INJECTING PAYLOAD   [ 75% ] ▓▓▓░\n` +
              `> PINGING ROOT NODE...`,
        edit: sentMsg.key
      }).catch(() => {});

      // 4. Latency Calculation
      const endTime = performance.now();
      const speed = (endTime - startTime).toFixed(2);

      await delay(400);

      // 5. Final Hacker Terminal Output
      const finalHackerText = 
`\`\`\`
╔══════════════════════════╗
   ☠️ DARK DINU CORE SPEED ☠️
╚══════════════════════════╝
\`\`\`
╭─◈ *MAINFRAME DIAGNOSTICS*
│
├ ⚡ *LATENCY SPEED :* ${speed} ms
├ 🛰️ *NODE STATUS   :* OPTIMAL (100%)
├ 🛡️ *SECURITY CORE :* BREACH RESISTANT
├ 📡 *SERVER HOST   :* CLOUD RUNTIME
│
╰──────────────────────────◈
> ☠️ *ᴅᴀʀᴋ ᴅɪɴᴜ :: ɴᴏ ꜱʏꜱᴛᴇᴍ ɪꜱ ꜱᴀꜰᴇ*`;

      // Final Edit to Result
      await sock.sendMessage(targetChat, {
        text: finalHackerText,
        edit: sentMsg.key
      }).catch(async () => {
        await sock.sendMessage(targetChat, { text: finalHackerText }, { quoted: msg }).catch(() => {});
      });

      // Update Reaction to Final
      await sock.sendMessage(targetChat, { react: { text: "☠️", key: msg.key } }).catch(() => {});

    } catch (err) {
      console.error('Ping command error:', err?.message || err);
      await sock.sendMessage(targetChat, { 
        text: '☠️ *[CORE ERROR]*: Latency diagnostics interrupted.' 
      }).catch(() => {});
    }
  }
};

