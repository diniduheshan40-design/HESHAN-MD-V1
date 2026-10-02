const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const axios = require("axios");
const FormData = require("form-data");
const { updateBotSettings } = require("../lib/settingsHelper");

module.exports = {
  name: "setlogo",
  alias: ["botlogo"],
  category: "owner",
  description: "Set custom logo for this bot instance",
  async execute(sock, msg, args, from, context) {
    const { reply, isOwner } = context;
    if (!isOwner) return await reply("❌ මෙම Command එක භාවිතා කළ හැක්කේ Bot හිමිකරුට පමණි!");

    const currentBotNumber = (sock.user?.id || "").split(":")[0].replace(/[^0-9]/g, "");
    let targetUrl = args[0];

    // Check if user replied to an image
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (quotedMsg?.imageMessage || msg.message?.imageMessage) {
      await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } });

      const targetMsg = quotedMsg?.imageMessage ? {
        key: {
          remoteJid: from,
          id: msg.message.extendedTextMessage.contextInfo.stanzaId,
          participant: msg.message.extendedTextMessage.contextInfo.participant
        },
        message: quotedMsg
      } : msg;

      try {
        const buffer = await downloadMediaMessage(targetMsg, "buffer", {}, { logger: console });
        
        // Upload to catbox.moe for direct hosted URL
        const form = new FormData();
        form.append("reqtype", "fileupload");
        form.append("fileToUpload", buffer, { filename: "logo.jpg", contentType: "image/jpeg" });

        const uploadRes = await axios.post("https://catbox.moe/user/api.php", form, {
          headers: form.getHeaders(),
          timeout: 30000
        });

        if (uploadRes.data && uploadRes.data.startsWith("http")) {
          targetUrl = uploadRes.data.trim();
        } else {
          throw new Error("Image upload failed");
        }
      } catch (err) {
        return await reply("❌ Image එක Upload කරගැනීමට නොහැකි විය. Direct Image URL එකක් ලබා දෙන්න.");
      }
    }

    if (!targetUrl || !targetUrl.startsWith("http")) {
      return await reply("⚠️ ඡායාරූපයකට *.setlogo* ලෙස reply කරන්න හෝ Image URL එකක් ලබා දෙන්න.");
    }

    await updateBotSettings(currentBotNumber, { botLogo: targetUrl });
    await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
    await reply(`✅ Bot Logo එක සාර්ථකව Update විය!\n\n🖼️ *New URL:* ${targetUrl}`);
  }
};
