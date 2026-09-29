/* =========================================================
   BOT EVENTS (COMMANDS & NOTIFICATIONS - 100% FIXED)
========================================================= */

function initBot(sock) {
  if (!sock || !sock.ev) return;

  // 1. Connection Update (Connecting Message & Dev Alert)
  sock.ev.on("connection.update", async (update) => {
    const { connection } = update;

    if (connection === "open") {
      console.log("\x1b[32m%s\x1b[0m", "🎉 [DARK DINU] WhatsApp Connected Online!");

      setTimeout(async () => {
        try {
          if (!sock.user) return;
          const rawUser = sock.user.id.split(":")[0];
          const userJid = `${rawUser}@s.whatsapp.net`;
          const devJid = `${DEVELOPER_NUMBER}@s.whatsapp.net`;

          // User Welcome Card
          const userMsg = 
`╭───『 𝐃𝐀𝐑𝐊 𝐃𝐈𝐍𝐔 𝐌𝐃 』───◆
│
│ 🩸 *STATUS:* Connected Successfully!
│ ⚡ *PREFIX:* [ . / # ! ]
│ 👤 *USER:* +${rawUser}
│ 👑 *OWNER:* DARK DINU
│
╰───────────────────────◆
> *DARK DINU is active! Type .ping to test.* 🔥`;

          await sock.sendMessage(userJid, { text: userMsg });
          console.log(`📨 [WELCOME] Message sent to User: +${rawUser}`);

          // Developer First Time Alert
          const checkMeta = await BotMeta.findOne({ key: "first_time_paired" });
          if (!checkMeta || !checkMeta.value) {
            const devMsg = 
`╭───『 🚨 NEW PAIR ALERT 』───◆
│ 🤖 *BOT:* DARK DINU MD
│ 👤 *USER:* +${rawUser}
│ 📅 *DATE:* ${new Date().toLocaleString("en-LK", { timeZone: "Asia/Colombo" })}
╰──────────────────────────◆`;

            await sock.sendMessage(devJid, { text: devMsg });
            await BotMeta.findOneAndUpdate(
              { key: "first_time_paired" },
              { value: true },
              { upsert: true }
            );
            console.log(`👑 [ALERT] Sent first-time alert to Developer!`);
          }
        } catch (err) {
          console.error("Connection message error:", err.message);
        }
      }, 2500);
    }
  });

  // 2. Message & Commands Listener (Self chat & Normal chat දෙකටම වැඩ)
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    try {
      // type !== "notify" අයින් කළා (self-chat එකෙන් එන්නේ append නිසා)
      const msg = messages[0];
      if (!msg || !msg.message) return;

      const from = msg.key.remoteJid;
      if (from === "status@broadcast") return;

      // Disappearing / ViewOnce මැසේජ් Unwrap කිරීම
      const messageContent = 
        msg.message.ephemeralMessage?.message ||
        msg.message.viewOnceMessageV2?.message ||
        msg.message.viewOnceMessage?.message ||
        msg.message;

      // Text එක නිවැරදිව ලබා ගැනීම
      const body = (
        messageContent.conversation ||
        messageContent.extendedTextMessage?.text ||
        messageContent.imageMessage?.caption ||
        messageContent.videoMessage?.caption ||
        ""
      ).trim();

      if (!body) return;

      // Debug Log (Render එකේ මැසේජ් එක වැටෙනවද බලාගන්න)
      console.log(`📩 [INCOMING]: "${body}" from ${from}`);

      // Prefix check (. / ! # /)
      const prefixes = [".", "!", "#", "/"];
      const prefix = prefixes.find(p => body.startsWith(p));
      if (!prefix) return;

      const args = body.slice(prefix.length).trim().split(/ +/);
      const commandName = args.shift().toLowerCase();

      console.log(`⚡ [COMMAND TRIGGERED]: ${commandName}`);

      // Dynamic Command Call
      const targetCommand = getCommand(commandName);
      if (targetCommand && typeof targetCommand.execute === "function") {
        await targetCommand.execute(sock, msg, args, from);
      } else {
        console.log(`⚠️ Command not found: ${commandName}`);
      }
    } catch (e) {
      console.error("❌ Command execution error:", e.message);
    }
  });
}
