  /* =======================================================
     COMMANDS & MESSAGES LISTENER
  ======================================================= */

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    try {
      if (type !== "notify") return;
      const msg = messages[0];
      if (!msg || !msg.message) return;

      // Status/Broadcast updates අයින් කරන්න
      const from = msg.key.remoteJid;
      if (from === "status@broadcast") return;

      // Message text එක නිවැරදිව ලබා ගැනීම
      const body =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        msg.message.videoMessage?.caption ||
        "";

      if (!body) return;

      const prefix = "."; // ඔයාගේ Prefix එක
      if (!body.startsWith(prefix)) return;

      const args = body.slice(prefix.length).trim().split(/ +/);
      const commandName = args.shift().toLowerCase();

      // --- PING COMMAND CALLING ---
      if (commandName === "ping" || commandName === "speed" || commandName === "p") {
        try {
          // ping.js තියෙන path එක හරියටම දෙන්න (උදා: ./commands/ping.js හෝ ./ping.js)
          const pingCmd = require("./commands/ping"); // ping.js තියෙන තැන අනුව path එක වෙනස් කරගන්න
          await pingCmd.execute(sock, msg, args, from);
        } catch (e) {
          console.log("Ping file not found, running built-in ping:", e.message);
          
          // Fallback: ping.js path එක වැරදුනත් වැඩ කරන built-in ping එක
          const start = Date.now();
          const sent = await sock.sendMessage(from, { text: "⚡ *Pinging...*" }, { quoted: msg });
          const latency = Date.now() - start;
          await sock.sendMessage(from, { 
            text: `🏓 *Pong:* ${latency} ms ⚡\n> *Powered by DARK DINU*`,
            edit: sent.key 
          }).catch(async () => {
            await sock.sendMessage(from, { text: `🏓 *Pong:* ${latency} ms ⚡` }, { quoted: msg });
          });
        }
      }

      // --- ALIVE COMMAND ---
      if (commandName === "alive") {
        await sock.sendMessage(from, {
          text: `🩸 *DARK DINU MD IS RUNNING* 🩸\n\n⚡ Status: *Online*\n👑 Owner: *DARK DINU*\n\n> Type *.ping* to test speed.`
        }, { quoted: msg });
      }

    } catch (e) {
      console.error("Message handler error:", e.message);
    }
  });
