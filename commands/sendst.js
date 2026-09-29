const {
  downloadContentFromMessage,
  generateWAMessageContent,
  generateWAMessageFromContent
} = require("@whiskeysockets/baileys");

// Stream එක Buffer එකක් කර ගැනීම
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
  desc: "Force upload image, video or text to WhatsApp Status",
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

      // 1. WhatsApp Status Recipients (Recipients ලැයිස්තුව හරියටම සකස් කිරීම)
      // Bot ගේ JID එක කිසිසේත්ම statusJidList එකට නොදැමිය යුතුය!
      let statusJidList = [];

      try {
        if (sock.chats) {
          statusJidList = Object.keys(sock.chats).filter(
            (id) => id.endsWith("@s.whatsapp.net") && !id.includes("status")
          );
        }
      } catch (e) {}

      // Recipients ලැයිස්තුවට command එක ගහපු owner ගේ JID එක එකතු කිරීම
      const cleanFrom = from.endsWith("@s.whatsapp.net") ? from : null;
      if (cleanFrom && !statusJidList.includes(cleanFrom)) {
        statusJidList.push(cleanFrom);
      }

      // අවම වශයෙන් එක් recipient කෙනෙක්වත් අනිවාර්යයෙන්ම තිබිය යුතුය
      if (statusJidList.length === 0) {
        statusJidList = [from];
      }

      // 2. Status Generator & Relayer Function
      async function sendStatus(messageContent) {
        const waMsg = generateWAMessageFromContent(
          statusJid,
          messageContent,
          {
            userJid: sock.user.id
          }
        );

        await sock.relayMessage(statusJid, waMsg.message, {
          messageId: waMsg.key.id,
          statusJidList: statusJidList,
          broadcast: true
        });
      }

      // ==========================================
      // A. IMAGE STATUS
      // ==========================================
      if (quoted?.imageMessage) {
        const buffer = await getMediaBuffer(quoted.imageMessage, "image");

        const mediaMsg = await generateWAMessageContent(
          {
            image: buffer,
            caption: captionText || quoted.imageMessage.caption || ""
          },
          { upload: sock.waUploadToServer }
        );

        await sendStatus(mediaMsg);

        await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
        return await reply("✅ Image එක 100% සාර්ථකව WhatsApp Status එකට වැටුණා! (Check My Status)");
      }

      // ==========================================
      // B. VIDEO STATUS
      // ==========================================
      if (quoted?.videoMessage) {
        const buffer = await getMediaBuffer(quoted.videoMessage, "video");

        const mediaMsg = await generateWAMessageContent(
          {
            video: buffer,
            caption: captionText || quoted.videoMessage.caption || ""
          },
          { upload: sock.waUploadToServer }
        );

        await sendStatus(mediaMsg);

        await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
        return await reply("✅ Video එක 100% සාර්ථකව WhatsApp Status එකට වැටුණා! (Check My Status)");
      }

      // ==========================================
      // C. TEXT STATUS
      // ==========================================
      if (captionText) {
        const textMsg = {
          extendedTextMessage: {
            text: captionText,
            textArgb: 0xffffffff,
            backgroundArgb: 0xff7b1fa2, // Purple Background
            font: 1
          }
        };

        await sendStatus(textMsg);

        await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
        return await reply("✅ Text එක 100% සාර්ථකව WhatsApp Status එකට වැටුණා! (Check My Status)");
      }

      return await reply(
        `💡 *භාවිතා කරන ආකාරය:*\n\n` +
        `• Image/Video එකකට Reply කර: *${prefix}status <Caption එක>*\n` +
        `• Text එකක් දැමීමට: *${prefix}status ඔබගේ Text එක*`
      );

    } catch (err) {
      console.error("Status Fatal Error:", err);
      await reply(`❌ Error: ${err.message || "Failed to push status"}`);
    }
  }
};
