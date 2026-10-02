const { downloadMediaMessage } = require("@whiskeysockets/baileys");

module.exports = {
  name: "setdp",
  alias: ["setpfp", "updatepfp"],
  category: "owner",
  description: "Change the Bot Profile Picture (Reply to an image)",
  async execute(sock, msg, args, from, context) {
    const { reply, isOwner } = context;

    // Owner check (bot owner or developer only)
    if (!isOwner) {
      return await reply("❌ මෙම Command එක භාවිතා කළ හැක්කේ Bot හිමිකරුට (Owner) පමණි!");
    }

    try {
      // 1. Check whether quoted message is an image
      const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      let targetMsg = null;

      if (quotedMsg?.imageMessage) {
        targetMsg = {
          key: {
            remoteJid: from,
            id: msg.message.extendedTextMessage.contextInfo.stanzaId,
            participant: msg.message.extendedTextMessage.contextInfo.participant
          },
          message: quotedMsg
        };
      } else if (msg.message?.imageMessage) {
        targetMsg = msg;
      }

      if (!targetMsg) {
        return await reply("📸 කරුණාකර Profile Picture එක ලෙස දැමීමට අවශ්‍ය Photo එකකට *.setdp* ලෙස reply කරන්න.");
      }

      await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } });

      // Image එක buffer එකක් ලෙස බාගත කිරීම
      const buffer = await downloadMediaMessage(
        targetMsg,
        "buffer",
        {},
        {
          logger: console,
          reuploadRequest: sock.updateMediaMessage
        }
      );

      if (!buffer) {
        throw new Error("ඡායාරූපය බාගත කර ගැනීමට නොහැකි විය.");
      }

      // WhatsApp bot account එකේ DP එක update කිරීම
      const botJid = (sock.user?.id || "").split(":")[0] + "@s.whatsapp.net";
      await sock.updateProfilePicture(botJid, buffer);

      await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
      await reply("🎉 *Bot Profile Picture එක සාර්ථකව update කරන ලදී!*");
    } catch (error) {
      console.error("Error in setdp:", error);
      await sock.sendMessage(from, { react: { text: "❌", key: msg.key } });
      await reply(`❌ Profile Picture update කිරීමේදී දෝෂයක් මතු විය: ${error.message}`);
    }
  }
};
