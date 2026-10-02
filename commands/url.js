const axios = require("axios");
const FormData = require("form-data");
const { downloadContentFromMessage } = require("@whiskeysockets/baileys");

// Stream එකෙන් Media Buffer එක ගන්නා Helper Function එක
async function getMediaBuffer(mediaNode, type) {
  const stream = await downloadContentFromMessage(mediaNode, type);
  let buffer = Buffer.from([]);
  for await (const chunk of stream) {
    buffer = Buffer.concat([buffer, chunk]);
  }
  return buffer;
}

// Catbox API එකට Buffer Upload කිරීම
async function uploadToCatbox(buffer, ext) {
  const form = new FormData();
  form.append("reqtype", "fileupload");
  form.append("fileToUpload", buffer, {
    filename: `dark_dinu_${Date.now()}.${ext}`
  });

  const res = await axios.post("https://catbox.moe/user/api.php", form, {
    headers: form.getHeaders(),
    timeout: 60000
  });

  return String(res.data).trim();
}

module.exports = {
  name: "url",
  alias: ["tourl", "upload", "imgurl"],
  desc: "Convert Image, Video, Audio, Voice Note, Sticker or Document to Direct URL",

  async execute(sock, msg, args, from) {
    try {
      // 1. Quoted Message හෝ Direct Message එක හඳුනාගැනීම
      let target = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage || msg.message;

      if (!target) {
        return await sock.sendMessage(from, {
          text: "⚠️ කරුණාකර Photo, Video, Audio, Voice Note හෝ Sticker එකකට Reply කර *.url* ලබා දෙන්න!"
        }, { quoted: msg });
      }

      // Ephemeral / ViewOnce messages unpack කිරීම
      if (target.ephemeralMessage) target = target.ephemeralMessage.message;
      if (target.viewOnceMessageV2) target = target.viewOnceMessageV2.message;
      if (target.viewOnceMessage) target = target.viewOnceMessage.message;
      if (target.documentWithCaptionMessage) target = target.documentWithCaptionMessage.message;

      // 2. Media Node සහ Type එක තෝරාගැනීම
      let mediaNode = null;
      let mediaType = null;
      let ext = "bin";

      if (target.imageMessage) {
        mediaNode = target.imageMessage;
        mediaType = "image";
        ext = mediaNode.mimetype?.includes("png") ? "png" : "jpg";
      } else if (target.videoMessage) {
        mediaNode = target.videoMessage;
        mediaType = "video";
        ext = "mp4";
      } else if (target.audioMessage) {
        mediaNode = target.audioMessage;
        mediaType = "audio";
        ext = mediaNode.ptt ? "opus" : "mp3";
      } else if (target.stickerMessage) {
        mediaNode = target.stickerMessage;
        mediaType = "sticker";
        ext = "webp";
      } else if (target.documentMessage) {
        mediaNode = target.documentMessage;
        mediaType = "document";
        ext = mediaNode.fileName?.split(".").pop() || "bin";
      }

      if (!mediaNode) {
        return await sock.sendMessage(from, {
          text: "⚠️ කරුණාකර Photo, Video, Audio, Voice Note හෝ Sticker එකකට Reply කර *.url* ලබා දෙන්න!"
        }, { quoted: msg });
      }

      await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } });

      // 3. Media එක Buffer එකකට Download කිරීම
      const buffer = await getMediaBuffer(mediaNode, mediaType);
      if (!buffer || buffer.length === 0) {
        throw new Error("Media Buffer එක ලබාගත නොහැකි විය.");
      }

      const sizeMB = (buffer.length / (1024 * 1024)).toFixed(2);

      // 4. Catbox එකට Upload කිරීම
      const directUrl = await uploadToCatbox(buffer, ext);

      if (!directUrl || !directUrl.startsWith("http")) {
        throw new Error("Catbox Server එකෙන් Link එක ලබාගැනීමට නොහැකි විය.");
      }

      // 5. Result එක Send කිරීම
      const responseCard = 
`╭───『 𝐃𝐀𝐑𝐊 𝐃𝐈𝐍𝐔 𝐔𝐑𝐋 』───◆
│
│ 📁 *TYPE:* ${mediaType.toUpperCase()}
│ ⚖️ *SIZE:* ${sizeMB} MB
│ 🏷️ *FORMAT:* .${ext}
│ 🌐 *LINK:*
│ ${directUrl}
│
╰──────────────────────────◆
> *ᴅᴀʀᴋ ᴅɪɴᴜ ᴍᴅ 🐦‍🔥*`;

      await sock.sendMessage(from, { 
        text: responseCard 
      }, { quoted: msg });

      await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });

    } catch (err) {
      console.error("URL Command Error:", err);
      await sock.sendMessage(from, { react: { text: "❌", key: msg.key } });
      await sock.sendMessage(from, { 
        text: `❌ URL සෑදීම අසාර්ථක විය: ${err.message || "Error"}` 
      }, { quoted: msg });
    }
  }
};
