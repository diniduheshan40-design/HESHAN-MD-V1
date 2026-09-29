const { downloadContentFromMessage } = require("@whiskeysockets/baileys");

// Media download helper
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

      // Status එක දකින්න ඕන audience එක (Contacts වලට පේන්න)
      const statusOptions = {
        statusJidList: [from]
      };

      // 1. Image Status Upload
      if (quoted?.imageMessage) {
        const buffer = await getMediaBuffer(quoted.imageMessage, "image");

        await sock.sendMessage(
          statusJid,
          {
            image: buffer,
            caption: captionText || quoted.imageMessage.caption || ""
          },
          statusOptions
        );

        await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
        return await reply("✅ Image එක සාර්ථකව WhatsApp Status එකට Upload කරන ලදී!");
      }

      // 2. Video Status Upload
      if (quoted?.videoMessage) {
        const buffer = await getMediaBuffer(quoted.videoMessage, "video");

        await sock.sendMessage(
          statusJid,
          {
            video: buffer,
            caption: captionText || quoted.videoMessage.caption || ""
          },
          statusOptions
        );

        await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
        return await reply("✅ Video එක සාර්ථකව WhatsApp Status එකට Upload කරන ලදී!");
      }

      // 3. Audio / Voice Status Upload
      if (quoted?.audioMessage) {
        const buffer = await getMediaBuffer(quoted.audioMessage, "audio");

        await sock.sendMessage(
          statusJid,
          {
            audio: buffer,
            mimetype: "audio/mp4",
            ptt: true
          },
          statusOptions
        );

        await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
        return await reply("✅ Voice Note එක සාර්ථකව Status එකට Upload කරන ලදී!");
      }

      // 4. Text Status Upload
      if (captionText) {
        await sock.sendMessage(
          statusJid,
          {
            text: captionText
          },
          statusOptions
        );

        await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
        return await reply("✅ Text එක සාර්ථකව WhatsApp Status එකට Upload කරන ලදී!");
      }

      // Help Text
      return await reply(
        `💡 *භාවිතා කරන ආකාරය:*\n\n` +
        `• Image/Video එකකට Reply කර: *${prefix}status <Caption එක>*\n` +
        `• Text එකක් දැමීමට: *${prefix}status ඔබගේ Text එක*`
      );

    } catch (err) {
      console.error("Status upload error:", err);
      await reply(`❌ Error: ${err.message || "Status upload failed"}`);
    }
  }
};
