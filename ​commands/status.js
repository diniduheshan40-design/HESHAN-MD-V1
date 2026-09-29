const { downloadMediaMessage } = require("@whiskeysockets/baileys");

module.exports = {
  name: "status",
  alias: ["upstatus", "story", "ups"],
  desc: "Upload image, video or text directly to WhatsApp Status",
  async execute(sock, msg, args, from, context) {
    const { reply, isOwner, prefix } = context;

    // ආරක්ෂාව සඳහා Bot Owner හට පමණක් Status Upload කළ හැක
    if (!isOwner) {
      return await reply("⚠️ මෙම විධානය භාවිත කළ හැක්කේ Bot Owner හට පමණි.");
    }

    try {
      const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const captionText = args.join(" ").trim();
      const statusJid = "status@broadcast";

      await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } });

      // 1. Image Status Upload
      if (quoted?.imageMessage) {
        const fakeQuoted = {
          message: { imageMessage: quoted.imageMessage },
          key: {
            remoteJid: from,
            id: msg.message.extendedTextMessage.contextInfo.stanzaId
          }
        };

        const buffer = await downloadMediaMessage(fakeQuoted, "buffer", {});

        await sock.sendMessage(statusJid, {
          image: buffer,
          caption: captionText || quoted.imageMessage.caption || ""
        });

        await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
        return await reply("✅ Image එක සාර්ථකව WhatsApp Status එකට Upload කරන ලදී!");
      }

      // 2. Video Status Upload
      if (quoted?.videoMessage) {
        const fakeQuoted = {
          message: { videoMessage: quoted.videoMessage },
          key: {
            remoteJid: from,
            id: msg.message.extendedTextMessage.contextInfo.stanzaId
          }
        };

        const buffer = await downloadMediaMessage(fakeQuoted, "buffer", {});

        await sock.sendMessage(statusJid, {
          video: buffer,
          caption: captionText || quoted.videoMessage.caption || ""
        });

        await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
        return await reply("✅ Video එක සාර්ථකව WhatsApp Status එකට Upload කරන ලදී!");
      }

      // 3. Audio/Voice Note Status Upload
      if (quoted?.audioMessage) {
        const fakeQuoted = {
          message: { audioMessage: quoted.audioMessage },
          key: {
            remoteJid: from,
            id: msg.message.extendedTextMessage.contextInfo.stanzaId
          }
        };

        const buffer = await downloadMediaMessage(fakeQuoted, "buffer", {});

        await sock.sendMessage(statusJid, {
          audio: buffer,
          mimetype: "audio/mp4",
          ptt: true
        });

        await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
        return await reply("✅ Audio එක සාර්ථකව Voice Status එකක් ලෙස Upload කරන ලදී!");
      }

      // 4. Text Status Upload
      if (captionText) {
        await sock.sendMessage(statusJid, {
          text: captionText,
          backgroundColor: "#080808",
          font: 3
        });

        await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
        return await reply("✅ Text එක සාර්ථකව WhatsApp Status එකට Upload කරන ලදී!");
      }

      // කිසිවක් නැති විට Help පණිවිඩය
      return await reply(
        `💡 *භාවිතා කරන ආකාරය:*\n\n` +
        `1. Image එකකට හෝ Video එකකට Reply කර:\n   *${prefix}status <Caption එක (අවශ්‍ය නම්)>*\n\n` +
        `2. Text Status එකක් දැමීමට:\n   *${prefix}status ඔබගේ Text එක මෙතන ලියන්න*`
      );

    } catch (err) {
      console.error("Status upload error:", err);
      await reply(`❌ Status Upload කිරීම අසාර්ථක විය: ${err.message}`);
    }
  }
};
