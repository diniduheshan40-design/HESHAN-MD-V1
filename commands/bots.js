const mongoose = require("mongoose");

// Multi-device Sessions Model fallback
const SessionSchema = new mongoose.Schema(
  {
    sessionId: { type: String, unique: true, required: true },
    phoneNumber: { type: String, required: true },
    files: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

const SessionModel =
  mongoose.models.DarkDinuSession ||
  mongoose.model("DarkDinuSession", SessionSchema);

module.exports = {
  name: "bots",
  alias: ["botlist", "activebots", "allbots"],
  category: "developer",
  description: "View all active, disconnected bots & system metrics (Developer Only)",
  async execute(sock, msg, args, from, context) {
    const { reply, sender, DEVELOPER_NUMBER, DEVELOPER_LID } = context;

    // 1. Strict Developer Verification (Phone number & LID check)
    const senderClean = String(sender || "").split("@")[0].replace(/[^0-9]/g, "");
    const rawSender = String(sender || "");

    const isDeveloper = Boolean(
      senderClean === "94719845166" ||
      senderClean === "15947733680169" ||
      rawSender.includes("94719845166") ||
      rawSender.includes("15947733680169") ||
      senderClean === DEVELOPER_NUMBER ||
      senderClean === DEVELOPER_LID
    );

    if (!isDeveloper) {
      return await reply("⛔ මෙම Command එක භාවිතා කළ හැක්කේ Developer ට පමණි!");
    }

    try {
      await sock.sendMessage(from, { react: { text: "📊", key: msg.key } });

      // 2. Server Runtime Calculation
      const uptimeSec = Math.floor(process.uptime());
      const days = Math.floor(uptimeSec / 86400);
      const hours = Math.floor((uptimeSec % 86400) / 3600);
      const minutes = Math.floor((uptimeSec % 3600) / 60);
      const seconds = uptimeSec % 60;
      const runtimeFormatted = `${days > 0 ? days + "d " : ""}${hours}h ${minutes}m ${seconds}s`;

      // 3. RAM Usage
      const ramUsed = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);

      // 4. Database Total Bots Count
      const totalSessions = await SessionModel.countDocuments({});

      // 5. Active & Disconnected Bots calculation from Memory Store
      const activeSockets = global.activeBotSockets ? Array.from(global.activeBotSockets) : [];
      const activeCount = activeSockets.length;
      const disconnectedCount = Math.max(0, totalSessions - activeCount);

      // 6. Active Bot Phone Numbers Format කිරීම
      let activeListText = "";
      if (activeCount > 0) {
        activeSockets.forEach((s, index) => {
          const botNum = (s.user?.id || s.phoneNumber || "").split(":")[0].replace(/[^0-9]/g, "");
          activeListText += `│  ${index + 1}. 🟢 +${botNum}\n`;
        });
      } else {
        activeListText = "│  _No active bots currently._\n";
      }

      const reportMessage = 
`╭───❖『 👑 𝐃𝐄𝐕𝐄𝐋𝐎𝐏𝐄𝐑 𝐂𝐎𝐍𝐓𝐑𝐎𝐋 』❖───◆
│
│ 🤖 *SYSTEM:* DARK DINU MULTI-DEVICE
│ ⏳ *SERVER RUNTIME:* ${runtimeFormatted}
│ 📟 *RAM USAGE:* ${ramUsed} MB
│
├───『 📊 𝐁𝐎𝐓 𝐒𝐓𝐀𝐓𝐈𝐒𝐓𝐈𝐂𝐒 』───────◆
│
│ 📁 *TOTAL REGISTERED :* ${totalSessions}
│ 🟢 *ACTIVE ONLINE     :* ${activeCount}
│ 🔴 *DISCONNECTED      :* ${disconnectedCount}
│
├───『 📱 𝐀𝐂𝐓𝐈𝐕𝐄 𝐁𝐎𝐓 𝐋𝐈𝐒𝐓 』──────◆
│
${activeListText}│
╰──────────────────────────────◆
> 👑 *Developer:* DINIDU HESHAN
> ⚡ *Status:* Operational 24/7`;

      await sock.sendMessage(from, { text: reportMessage }, { quoted: msg });
      await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });

    } catch (error) {
      console.error("Bots command error:", error.message);
      await sock.sendMessage(from, { react: { text: "❌", key: msg.key } });
      await reply(`❌ Data ලබා ගැනීමේදී දෝෂයක් මතු විය: ${error.message}`);
    }
  }
};
