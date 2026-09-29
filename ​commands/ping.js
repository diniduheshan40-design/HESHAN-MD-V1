module.exports = {
  name: "ping",
  alias: ["speed", "p"],
  desc: "DARK DINU speed testing",

  async execute(sock, msg, args, chatJid) {
    const jid = chatJid || msg.key.remoteJid;

    try {
      // 🚀 Start reaction
      await sock.sendMessage(jid, {
        react: {
          text: "🚀",
          key: msg.key
        }
      }).catch(() => {});

      // Start time
      const start = Date.now();

      // Testing message
      const sent = await sock.sendMessage(
        jid,
        {
          text: "⚡ *Testing speed...*"
        },
        {
          quoted: msg
        }
      );

      // Calculate ping
      const ping = Date.now() - start;

      // ⚡ Reaction
      await sock.sendMessage(jid, {
        react: {
          text: "⚡",
          key: msg.key
        }
      }).catch(() => {});

      // Try edit
      try {
        await sock.sendMessage(jid, {
          text: `*pong ${ping}ms 🔥*`,
          edit: sent.key
        });
      } catch (editError) {
        // If edit doesn't work, send new message
        await sock.sendMessage(
          jid,
          {
            text: `*pong ${ping}ms 🔥*`
          },
          {
            quoted: msg
          }
        );
      }

    } catch (error) {
      console.error("❌ PING ERROR:", error);

      await sock.sendMessage(
        jid,
        {
          text: "*pong! DARK DINU is active 🔥*"
        },
        {
          quoted: msg
        }
      ).catch(() => {});
    }
  }
};
