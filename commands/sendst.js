const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
const fs = require("fs");
const path = require("path");
const os = require("os");

module.exports = {
  name: "status",
  alias: ["upstatus", "story", "ups"],
  desc: "Upload media to status using local file streaming",
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

      // Bot එකේ contacts ලැයිස්තුව ලබා ගැනීම
      let contacts = [];
      try {
        if (sock.store && sock.store.contacts) {
          contacts = Object.keys(sock.store.contacts);
        } else if (sock.chats) {
          contacts = Object.keys(sock.chats);
        }
      } catch (e) {}

      // Contacts filter කිරීම (status සහ groups අයින් කර සාමාන්‍ය users පමණක් තෝරා ගැනීම)
      let statusJidList = contacts.filter(
        (jid) => jid.endsWith("@s.whatsapp.net") && !jid.includes("status")
      );

      // කිසිම contact එකක් හමු නොවුණහොත් ඔයාගේ JID එක ලබා දීම
      if (statusJidList.length === 0) {
        statusJidList = [from];
      }

      // ==========================================
      // 1. IMAGE STATUS (Temporary File Method)
      // ==========================================
      if (quoted?.imageMessage) {
        const stream = await downloadContentFromMessage(quoted.imageMessage, "image");
        const tempPath = path.join(os.tmpdir(), `status_${Date.now()}.jpg`);
        const fileStream = fs.createWriteStream(tempPath);

        for await (const chunk of stream) {
          fileStream.write(chunk);
        }
        fileStream.end();

        await new Promise((resolve) => fileStream.on("finish", resolve));

        await sock.sendMessage(
          statusJid,
          {
            image: fs.readFileSync(tempPath),
            caption: captionText || quoted.imageMessage.caption || ""
          },
          {
            statusJidList: statusJidList
          }
        );

        try { fs.unlinkSync(tempPath); } catch (e) {}

        await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
        return await reply("✅ Image එක Status එකට Send කරන ලදී! (Bot ගේ WhatsApp එකේ My Status බලන්න)");
      }

      // ==========================================
      // 2. VIDEO STATUS (Temporary File Method)
      // ==========================================
      if (quoted?.videoMessage) {
        const stream = await downloadContentFromMessage(quoted.videoMessage, "video");
        const tempPath = path.join(os.tmpdir(), `status_${Date.now()}.mp4`);
        const fileStream = fs.createWriteStream(tempPath);

        for await (const chunk of stream) {
          fileStream.write(chunk);
        }
        fileStream.end();

        await new Promise((resolve) => fileStream.on("finish", resolve));

        await sock.sendMessage(
          statusJid,
          {
            video: fs.readFileSync(tempPath),
            caption: captionText || quoted.videoMessage.caption || ""
          },
          {
            statusJidList: statusJidList
          }
        );

        try { fs.unlinkSync(tempPath); } catch (e) {}

        await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
        return await reply("✅ Video එක Status එකට Send කරන ලදී! (Bot ගේ WhatsApp එකේ My Status බලන්න)");
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
            statusJidList: statusJidList
          }
        );

        await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
        return await reply("✅ Text එක Status එකට Send කරන ලදී! (Bot ගේ WhatsApp එකේ My Status බලන්න)");
      }

      return await reply(
        `💡 *භාවිතය:*\n• Image/Video එකකට Reply කර: *${prefix}status <Caption>*\n• Text සඳහා: *${prefix}status ඔබගේ Text එක*`
      );

    } catch (err) {
      console.error("Status upload error:", err);
      await reply(`❌ Error: ${err.message || "Failed to upload status"}`);
    }
  }
};
