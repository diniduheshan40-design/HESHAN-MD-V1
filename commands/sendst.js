const {
  downloadContentFromMessage,
  generateWAMessageFromContent
} = require("@whiskeysockets/baileys");

// Helper: Stream to Buffer
async function getMediaBuffer(mediaMessage, type) {
  const stream = await downloadContentFromMessage(mediaMessage, type);
  let buffer = Buffer.from([]);
  for await (const chunk of stream) {
    buffer = Buffer.concat([buffer, chunk]);
  }
  return buffer;
}

module.exports = {
  name: "status",
  alias: ["upstatus", "story", "ups"],
  desc: "Upload image, video or text directly to WhatsApp Status",
  async execute(sock, msg, args, from, context) {
    const { reply, isOwner, prefix } = context;

    if (!isOwner) {
      return await reply("⚠️ මෙම විධානය භාවිත කළ හැක්කේ Bot Owner හට පමණි.");
    }

    try {
      const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const captionText = args.join(" ").trim();
      const statusJid = "status@broadcast";

      await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } });

      // 1. Status Audience එක ලබා ගැනීම (Bot ගේ Chats/Contacts සියල්ලම)
      let statusRecipients = [];
      try {
        if (sock.chats) {
          statusRecipients = Object.keys(sock.chats).filter(
            (jid) => jid.endsWith("@s.whatsapp.net") && !jid.includes("status")
          );
        }
      } catch (e) {}

      // Contacts නැත්නම් අවම වශයෙන් owner ගේ සහ sender ගේ JID එක ලබා දීම
      if (statusRecipients.length === 0) {
        const botUser = (sock.user?.id || "").split(":")[0] + "@s.whatsapp.net";
        statusRecipients = [from, botUser].filter(Boolean);
      }

      // Status Broadcast Relay Options
      const relayOptions = {
        statusJidList: statusRecipients
      };

      // ==========================================
      // 1. IMAGE STATUS
      // ==========================================
      if (quoted?.imageMessage) {
        const buffer = await getMediaBuffer(quoted.imageMessage, "image");

        // Native Baileys Status Message Generation
        await sock.sendMessage(
          statusJid,
          {
            image: buffer,
            caption: captionText || quoted.imageMessage.caption || ""
          },
          {
            ...relayOptions,
            backgroundColor: "#000000",
            font: 1
          }
        );

        await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
        return await reply("✅ Image එක සාර්ථකව WhatsApp Status එකට වැටුණා! (Check My Status)");
      }

      // ==========================================
      // 2. VIDEO STATUS
      // ==========================================
      if (quoted?.videoMessage) {
        const buffer = await getMediaBuffer(quoted.videoMessage, "video");

        await sock.sendMessage(
          statusJid,
          {
            video: buffer,
            caption: captionText || quoted.videoMessage.caption || ""
          },
          {
            ...relayOptions
          }
        );

        await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
        return await reply("✅ Video එක සාර්ථකව WhatsApp Status එකට වැටුණා! (Check My Status)");
      }

      // ==========================================
      // 3. TEXT STATUS
      // ==========================================
      if (captionText) {
        await sock.sendMessage(
          statusJid,
          {
            text: captionText
          },
          {
            ...relayOptions,
            backgroundColor: "#1b1b1b",
            font: 2
          }
        );

        await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
        return await reply("✅ Text එක සාර්ථකව WhatsApp Status එකට වැටුණා! (Check My Status)");
      }

      // කිසිවක් නැති විට Usage Info
      return await reply(
        `💡 *භාවිතා කරන ආකාරය:*\n\n` +
        `• Image/Video එකකට Reply කර: *${prefix}status <Caption එක>*\n` +
        `• Text එකක් දැමීමට: *${prefix}status ඔබගේ Text එක*`
      );

    } catch (err) {
      console.error("Status Upload Error:", err);
      await reply(`❌ Status Upload Error: ${err.message || "Failed"}`);
    }
  }
};
