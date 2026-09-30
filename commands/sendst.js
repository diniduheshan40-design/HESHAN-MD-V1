const {
  downloadContentFromMessage
} = require("@whiskeysockets/baileys");

module.exports = {
  name: "status",
  alias: ["st", "upstatus", "story", "ups"],

  desc: "Upload quoted media or text to WhatsApp Status",

  async execute(sock, msg, args, from) {
    try {
      // ============================================================
      // OWNER
      // ============================================================

      const OWNER_NUMBER = "94719845166";

      const sender =
        msg.key?.participant ||
        msg.key?.remoteJid ||
        "";

      const senderNumber = sender.replace(/[^0-9]/g, "");

      if (senderNumber !== OWNER_NUMBER) {
        return await sock.sendMessage(
          from,
          {
            text:
              "⚠️ *මෙම Command එක භාවිතා කළ හැක්කේ Bot Owner හට පමණි.*"
          },
          { quoted: msg }
        );
      }

      // ============================================================
      // REACTION
      // ============================================================

      await sock.sendMessage(from, {
        react: {
          text: "⏳",
          key: msg.key
        }
      });

      // ============================================================
      // COMMAND TEXT / CAPTION
      // ============================================================

      const captionText = args.join(" ").trim();

      // ============================================================
      // GET QUOTED MESSAGE
      // ============================================================

      const contextInfo =
        msg.message?.extendedTextMessage?.contextInfo;

      let quotedMessage =
        contextInfo?.quotedMessage;

      // Some WhatsApp messages can be wrapped
      // inside ephemeral/viewOnce containers.
      if (quotedMessage?.ephemeralMessage) {
        quotedMessage =
          quotedMessage.ephemeralMessage.message;
      }

      if (quotedMessage?.viewOnceMessage) {
        quotedMessage =
          quotedMessage.viewOnceMessage.message;
      }

      if (quotedMessage?.viewOnceMessageV2) {
        quotedMessage =
          quotedMessage.viewOnceMessageV2.message;
      }

      if (quotedMessage?.viewOnceMessageV2Extension) {
        quotedMessage =
          quotedMessage.viewOnceMessageV2Extension.message;
      }

      // ============================================================
      // STATUS JID
      // ============================================================

      const statusJid = "status@broadcast";

      // ============================================================
      // STATUS RECIPIENT LIST
      // ============================================================

      let statusJidList = [];

      // Bot's own JID
      if (sock.user?.id) {
        statusJidList.push(sock.user.id);
      }

      // Add contacts if available
      try {
        if (sock.store?.contacts) {
          const contacts = Object.keys(sock.store.contacts);

          for (const jid of contacts) {
            if (
              jid.endsWith("@s.whatsapp.net") &&
              !jid.includes("status") &&
              !statusJidList.includes(jid)
            ) {
              statusJidList.push(jid);
            }
          }
        }
      } catch (e) {
        console.log(
          "STATUS CONTACT ERROR:",
          e.message
        );
      }

      // ============================================================
      // DOWNLOAD MEDIA HELPER
      // ============================================================

      async function downloadMedia(message, type) {
        const stream = await downloadContentFromMessage(
          message,
          type
        );

        const chunks = [];

        for await (const chunk of stream) {
          chunks.push(chunk);
        }

        return Buffer.concat(chunks);
      }

      // ============================================================
      // 1. IMAGE
      // ============================================================

      if (quotedMessage?.imageMessage) {
        await sock.sendMessage(
          from,
          {
            text:
              "📸 *Image එක Status එකට Upload කරමින්...*"
          },
          { quoted: msg }
        );

        const image = await downloadMedia(
          quotedMessage.imageMessage,
          "image"
        );

        await sock.sendMessage(
          statusJid,
          {
            image: image,

            caption:
              captionText ||
              quotedMessage.imageMessage.caption ||
              "",

            contextInfo: {
              featureEligibilities: {
                canBeReshared: true
              }
            }
          },
          {
            statusJidList,
            broadcast: true
          }
        );

        await sock.sendMessage(from, {
          react: {
            text: "✅",
            key: msg.key
          }
        });

        return await sock.sendMessage(
          from,
          {
            text:
              "✅ *Image Status එකට Upload කළා!*"
          },
          { quoted: msg }
        );
      }

      // ============================================================
      // 2. VIDEO
      // ============================================================

      if (quotedMessage?.videoMessage) {
        await sock.sendMessage(
          from,
          {
            text:
              "🎥 *Video එක Status එකට Upload කරමින්...*"
          },
          { quoted: msg }
        );

        const video = await downloadMedia(
          quotedMessage.videoMessage,
          "video"
        );

        await sock.sendMessage(
          statusJid,
          {
            video: video,

            caption:
              captionText ||
              quotedMessage.videoMessage.caption ||
              "",

            contextInfo: {
              featureEligibilities: {
                canBeReshared: true
              }
            }
          },
          {
            statusJidList,
            broadcast: true
          }
        );

        await sock.sendMessage(from, {
          react: {
            text: "✅",
            key: msg.key
          }
        });

        return await sock.sendMessage(
          from,
          {
            text:
              "✅ *Video Status එකට Upload කළා!*"
          },
          { quoted: msg }
        );
      }

      // ============================================================
      // 3. AUDIO / VOICE
      // ============================================================

      if (quotedMessage?.audioMessage) {
        await sock.sendMessage(from, {
          react: {
            text: "❌",
            key: msg.key
          }
        });

        return await sock.sendMessage(
          from,
          {
            text:
              "❌ *Voice / Audio Status Upload කරන්න බැහැ.*\n\n" +
              "WhatsApp Status එකට standalone audio/voice message " +
              "upload කිරීම supported නැහැ.\n\n" +
              "🎥 Audio එක video එකක් විදිහට තිබ්බොත් ඒක Status එකට දාන්න පුළුවන්."
          },
          { quoted: msg }
        );
      }

      // ============================================================
      // 4. STICKER
      // ============================================================

      if (quotedMessage?.stickerMessage) {
        await sock.sendMessage(from, {
          react: {
            text: "❌",
            key: msg.key
          }
        });

        return await sock.sendMessage(
          from,
          {
            text:
              "❌ *Sticker එක direct Status එකට upload කරන්න බැහැ.*\n\n" +
              "Sticker එක image එකක් විදිහට convert කරලා `.st` කරන්න."
          },
          { quoted: msg }
        );
      }

      // ============================================================
      // 5. DOCUMENT
      // ============================================================

      if (quotedMessage?.documentMessage) {
        await sock.sendMessage(from, {
          react: {
            text: "❌",
            key: msg.key
          }
        });

        return await sock.sendMessage(
          from,
          {
            text:
              "❌ *Document එක direct WhatsApp Status එකට upload කරන්න බැහැ.*\n\n" +
              "📸 Image / 🎥 Video එකක් reply කරලා `.st` භාවිතා කරන්න."
          },
          { quoted: msg }
        );
      }

      // ============================================================
      // 6. TEXT STATUS
      // ============================================================

      if (captionText) {
        await sock.sendMessage(
          statusJid,
          {
            text: captionText,

            backgroundColor: "#111111",

            font: 3
          },
          {
            statusJidList,
            broadcast: true
          }
        );

        await sock.sendMessage(from, {
          react: {
            text: "✅",
            key: msg.key
          }
        });

        return await sock.sendMessage(
          from,
          {
            text:
              "✅ *Text Status එකට Upload කළා!*"
          },
          { quoted: msg }
        );
      }

      // ============================================================
      // NO MEDIA / NO TEXT
      // ============================================================

      await sock.sendMessage(from, {
        react: {
          text: "❌",
          key: msg.key
        }
      });

      return await sock.sendMessage(
        from,
        {
          text:
            "❌ *Status එකක් Upload කරන්න දෙයක් නැහැ.*\n\n" +

            "📸 *Image*\n" +
            "Image එකකට Reply → `.st`\n\n" +

            "🎥 *Video*\n" +
            "Video එකකට Reply → `.st`\n\n" +

            "📝 *Text*\n" +
            "`.st Hello World ❤️`\n\n" +

            "✨ *Caption සමඟ*\n" +
            "Image/Video එකකට Reply කරලා:\n" +
            "`.st My New Status ❤️`"
        },
        { quoted: msg }
      );

    } catch (error) {
      console.error(
        "STATUS COMMAND ERROR:",
        error
      );

      try {
        await sock.sendMessage(from, {
          react: {
            text: "❌",
            key: msg.key
          }
        });
      } catch (e) {}

      return await sock.sendMessage(
        from,
        {
          text:
            "❌ *Status Upload Failed!*\n\n" +
            "Error: `" +
            (error?.message || "Unknown error") +
            "`"
        },
        { quoted: msg }
      );
    }
  }
};
