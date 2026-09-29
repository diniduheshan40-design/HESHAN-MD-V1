module.exports = {
  name: 'ping',
  alias: ['speed', 'p'],

  desc: 'DARK DINU speed testing',

  async execute(sock, msg, args, chatJid) {
    try {
      // Target chat
      const targetJid = chatJid || msg.key.remoteJid;

      if (!targetJid) {
        return;
      }

      // Start timer
      const start = Date.now();

      // 🚀 Initial reaction
      await sock.sendMessage(targetJid, {
        react: {
          text: '🚀',
          key: msg.key
        }
      }).catch(() => {});

      // Send testing message
      let sentMessage = null;

      try {
        sentMessage = await sock.sendMessage(
          targetJid,
          {
            text: '⚡ *Testing speed...*'
          },
          {
            quoted: msg
          }
        );
      } catch (error) {
        sentMessage = await sock.sendMessage(targetJid, {
          text: '⚡ *Testing speed...*'
        });
      }

      // Calculate latency
      const latency = Date.now() - start;

      const finalReply =
        `*pong ${latency}ms 🔥*`;

      // ⚡ Change reaction
      await sock.sendMessage(targetJid, {
        react: {
          text: '⚡',
          key: msg.key
        }
      }).catch(() => {});

      // Edit original message
      if (sentMessage && sentMessage.key) {
        try {
          await sock.sendMessage(targetJid, {
            text: finalReply,
            edit: sentMessage.key
          });

          return;
        } catch (editError) {
          console.log(
            '⚠️ Message edit failed:',
            editError.message
          );
        }
      }

      // Fallback reply
      await sock.sendMessage(
        targetJid,
        {
          text: finalReply
        },
        {
          quoted: msg
        }
      );

    } catch (error) {
      console.error(
        '❌ Ping command error:',
        error.message
      );

      // Final fallback
      const fallbackJid =
        chatJid || msg.key.remoteJid;

      if (fallbackJid) {
        await sock.sendMessage(fallbackJid, {
          text: '*pong! DARK DINU is active 🔥*'
        }).catch(() => {});
      }
    }
  }
};
