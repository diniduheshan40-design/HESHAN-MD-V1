const {
  downloadContentFromMessage,
  generateWAMessageContent,
  generateWAMessageFromContent
} = require("@whiskeysockets/baileys");

// Stream එක Buffer එකක් කරගැනීම
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
  desc: "Upload image, video or text directly to WhatsApp Status via relayMessage",
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

      // 1. Audience / Recipients සැකසීම (Status එක share විය යුතු JID List එක)
      let recipients = [];
      try {
        if (sock.chats) {
          recipients = Object.keys(sock.chats).filter(
            (j) => j.endsWith("@s.whatsapp.net") && !j.includes("status")
          );
        }
      } catch (e) {}

      // Contacts list එකක් නැත්නම් owner ගේ සහ bot ගේ JID එක එකතු කිරීම
      const botNumber = (sock.user?.id || "").split(":")[0] + "@s.whatsapp.net";
      if (!recipients.includes(from)) recipients.push(from);
      if (!recipients.includes(botNumber)) recipients.push(botNumber);

      // Status එක upload කිරීම සඳහා Baileys relayMessage runner එක
      async function uploadToStatus(contentNode) {
        const statusMsg = generateWAMessageFromContent(
          statusJid,
          contentNode,
          {
            userJid: botNumber
          }
        );

        await sock.relayMessage(statusJid, statusMsg.message, {
          messageId: statusMsg.key.id,
          statusJidList: recipients
        });
      }

      // =========================================================
      // 1. IMAGE STATUS
      // =========================================================
      if (quoted?.imageMessage) {
        const buffer = await getMediaBuffer(quoted.imageMessage, "image");

        const mediaContent = await generateWAMessageContent(
          {
            image: buffer,
            caption: captionText || quoted.imageMessage.caption || ""
          },
          { upload: sock.waUploadToServer }
        );

        await uploadToStatus(mediaContent);

        await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
        return await reply("✅ Image එක සාර්ථකව WhatsApp Status එකට වැටුණා! (Bot ගේ WhatsApp එකේ My Status බලන්න)");
      }

      // =========================================================
      // 2. VIDEO STATUS
      // =========================================================
      if (quoted?.videoMessage) {
        const buffer = await getMediaBuffer(quoted.videoMessage, "video");

        const mediaContent = await generateWAMessageContent(
          {
            video: buffer,
            caption: captionText || quoted.videoMessage.caption || ""
          },
          { upload: sock.waUploadToServer }
        );

        await uploadToStatus(mediaContent);

        await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
        return await reply("✅ Video එක සාර්ථකව WhatsApp Status එකට වැටුණා! (Bot ගේ WhatsApp එකේ My Status බලන්න)");
      }

      // =========================================================
      // 3. TEXT STATUS
      // =========================================================
      if (captionText) {
        const textContent = {
          extendedTextMessage: {
            text: captionText,
            textArgb: 0xffffffff,
            backgroundArgb: 0xff000000,
            font: 1
          }
        };

        await uploadToStatus(textContent);

        await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
        return await reply("✅ Text එක සාර්ථකව WhatsApp Status එකට වැටුණා! (Bot ගේ WhatsApp එකේ My Status බලන්න)");
      }

      return await reply(
        `💡 *භාවිතා කරන ආකාරය:*\n\n` +
        `• Image/Video එකකට Reply කර: *${prefix}status <Caption එක>*\n` +
        `• Text එකක් දැමීමට: *${prefix}status ඔබගේ Text එක*`
      );

    } catch (err) {
      console.error("Status upload error:", err);
      await reply(`❌ Status දෝෂය: ${err.message || "Failed to relay status"}`);
    }
  }
};
