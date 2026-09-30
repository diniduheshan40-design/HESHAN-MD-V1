const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
const axios = require("axios");
const FormData = require("form-data");
const { fileTypeFromBuffer } = require("file-type");

// Media Buffer එක Baileys Stream එකෙන් බාගත කිරීමේ function එක
async function downloadMedia(message, type) {
  const stream = await downloadContentFromMessage(message, type);
  let buffer = Buffer.from([]);
  for await (const chunk of stream) {
    buffer = Buffer.concat([buffer, chunk]);
  }
  return buffer;
}

// Buffer එක Direct CDN Link එකක් බවට පත් කිරීම (Catbox API)
async function uploadToCatbox(buffer, ext) {
  const form = new FormData();
  form.append("reqtype", "fileupload");
  form.append("fileToUpload", buffer, { filename: `dark_dinu_${Date.now()}.${ext}` });

  const res = await axios.post("https://catbox.moe/user/api.php", form, {
    headers: form.getHeaders(),
    timeout: 60000
  });

  return res.data;
}

module.exports = {
  name: "url",
  alias: ["tourl", "upload", "imgurl"],
  desc: "Convert Image, Video, Audio, Voice Note, or Sticker to Public Direct URL",
  async execute(sock, msg, args, from) {
    try {
      // 1. Quoted Message එකක් හෝ Direct Caption Message එකක්දැයි හඳුනාගැනීම
      const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const targetMessage = quoted || msg.message;

      // 2. මාධ්‍ය වර්ගය (Media Type) පරීක්ෂා කිරීම
      let mediaNode = null;
      let mediaType = null;
      let defaultExt = "bin";

      if (targetMessage?.imageMessage) {
        mediaNode = targetMessage.imageMessage;
        mediaType = "image";
        defaultExt = "jpg";
      } else if (targetMessage?.videoMessage) {
        mediaNode = targetMessage.videoMessage;
        mediaType = "video";
        defaultExt = "mp4";
      } else if (targetMessage?.audioMessage) {
        mediaNode = targetMessage.audioMessage;
        mediaType = "audio";
        defaultExt = targetMessage.audioMessage.ptt ? "opus" : "mp3";
      } else if (targetMessage?.stickerMessage) {
        mediaNode = targetMessage.stickerMessage;
        mediaType = "sticker";
        defaultExt = "webp";
      } else if (targetMessage?.documentMessage) {
        mediaNode = targetMessage.documentMessage;
        mediaType = "document";
        defaultExt = targetMessage.documentMessage.fileName?.split(".").pop() || "bin";
      }

      if (!mediaNode) {
        return await sock.sendMessage(from, {
          text: "⚠️ කරුණාකර Photo, Video, Audio, Voice Note හෝ Sticker එකකට Reply කර *.url* ලබා දෙන්න!"
        }, { quoted: msg });
      }

      await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } });

      // 3. Media එක Buffer එකක් ලෙස download කරගැනීම
      const buffer = await downloadMedia(mediaNode, mediaType);
      const sizeMB = (buffer.length / (1024 * 1024)).toFixed(2);

      // 4. File extension එක නිවැරදිව හඳුනා ගැනීම
      let ext = defaultExt;
      try {
        const detectedType = await fileTypeFromBuffer(buffer);
        if (detectedType && detectedType.ext) {
          ext = detectedType.ext;
        }
      } catch (e) {}

      // 5. Cloud CDN එකට upload කිරීම
      const directUrl = await uploadToCatbox(buffer, ext);

      if (!directUrl || !directUrl.startsWith("http")) {
        throw new Error("CDN Server එකෙන් Link එකක් ලබාගැනීමට නොහැකි විය.");
      }

      // 6. ලස්සන Card එකකින් Direct URL එක යැවීම
      const responseCard = 
`╭───『 𝐃𝐀𝐑𝐊 𝐃𝐈𝐍𝐔 𝐔𝐑𝐋 』───◆
│
│ 📁 *ᴛʏᴘᴇ:* ${mediaType.toUpperCase()}
│ ⚖️ *sɪᴢᴇ:* ${sizeMB} MB
│ 🏷️ *ғᴏʀᴍᴀᴛ:* .${ext}
│ 🌐 *ʟɪɴᴋ:*
│ ${directUrl.trim()}
│
╰──────────────────────────◆
> *ᴅᴀʀᴋ ᴅɪɴᴜ ᴍᴅ 🐦‍🔥*`;

      await sock.sendMessage(from, { 
        text: responseCard 
      }, { quoted: msg });

      await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });

    } catch (err) {
      console.error("URL Converter Error:", err.message);
      await sock.sendMessage(from, { react: { text: "❌", key: msg.key } });
      await sock.sendMessage(from, { 
        text: `❌ URL එකක් සෑදීමට නොහැකි විය: ${err.message || "Error"}` 
      }, { quoted: msg });
    }
  }
};
