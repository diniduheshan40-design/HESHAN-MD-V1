const {
  downloadContentFromMessage
} = require("@whiskeysockets/baileys");

const fs = require("fs");
const path = require("path");
const os = require("os");

module.exports = {
  name: "status",
  alias: ["st", "upstatus", "story", "ups"],

  desc: "Upload image, video or text to WhatsApp Status",

  async execute(sock, msg, args, from) {
    try {
      // ============================================================
      // OWNER CHECK
      // ============================================================
      // NOTE:
      // මේ command එක owner-only කරන්න නම් මෙතන ඔයාගේ owner number
      // එක දාන්න.
      //
      // Example:
      // const OWNER_NUMBER = "947XXXXXXXX";
      //
      // ============================================================

      const OWNER_NUMBER = "947XXXXXXXX";

      const sender =
        msg.key?.participant ||
        msg.key?.remoteJid ||
        "";

      const senderNumber = sender
        .replace(/[^0-9]/g, "");

      if (
        OWNER_NUMBER !== "947XXXXXXXX" &&
        senderNumber !== OWNER_NUMBER
      ) {
        return await sock.sendMessage(
          from,
          {
            text: "⚠️ *මෙම Command එක භාවිතා කළ හැක්කේ Bot Owner හට පමණි.*"
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
      // COMMAND TEXT
      // ============================================================

      const captionText = args.join(" ").trim();

      // ============================================================
      // GET QUOTED MESSAGE
      // ============================================================

      const contextInfo =
        msg.message?.extendedTextMessage?.contextInfo;

      const quotedMessage =
        contextInfo?.quotedMessage;

      // ============================================================
      // STATUS JID
      // ============================================================

      const statusJid = "status@broadcast";

      // ============================================================
      // STATUS RECIPIENTS
      // ============================================================

      let statusJidList = [];

      /*
       * Botගේ own WhatsApp JID එක මුලින්ම add කරනවා.
       * මේක වැදගත් — status එක Botගේ WhatsApp එකේ
       * My Status එකට appear වෙන්න.
       */

      if (sock.user?.id) {
        statusJidList.push(sock.user.id);
      }

      /*
       * Store එකේ contacts තියෙනවා නම් ඒවත් add කරනවා.
       */

      try {
        if (sock.store?.contacts) {
          const contacts = Object.keys(sock.store.contacts);

          for (const jid of contacts) {
            if (
              jid.endsWith("@s.whatsapp.net") &&
              !jid.includes("status")
            ) {
              if (!statusJidList.includes(jid)) {
                statusJidList.push(jid);
              }
            }
          }
        }
      } catch (e) {
        console.log(
          "Contact list error:",
          e.message
        );
      }

      /*
       * Contacts නැත්නම් bot JID එක විතරක්.
       */

      if (statusJidList.length === 0) {
        if (sock.user?.id) {
          statusJidList = [sock.user.id];
        }
      }

      // ============================================================
      // 1. IMAGE STATUS
      // ============================================================

      if (quotedMessage?.imageMessage) {

        await sock.sendMessage(
          from,
          {
            text: "📤 *Image එක Status එකට Upload කරමින්...*"
          },
          { quoted: msg }
        );

        const stream = await downloadContentFromMessage(
          quotedMessage.imageMessage,
          "image"
        );

        const chunks = [];

        for await (const chunk of stream) {
          chunks.push(chunk);
        }

        const buffer = Buffer.concat(chunks);

        await sock.sendMessage(
          statusJid,
          {
            image: buffer,

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
              "✅ *Image Status එකට Upload කළා!*\n\n" +
              "📱 Botගේ WhatsApp එකේ *My Status* බලන්න."
          },
          { quoted: msg }
        );
      }

      // ============================================================
      // 2. VIDEO STATUS
      // ============================================================

      if (quotedMessage?.videoMessage) {

        await sock.sendMessage(
          from,
          {
            text: "📤 *Video එක Status එකට Upload කරමින්...*"
          },
          { quoted: msg }
        );

        const stream = await downloadContentFromMessage(
          quotedMessage.videoMessage,
          "video"
        );

        const chunks = [];

        for await (const chunk of stream) {
          chunks.push(chunk);
        }

        const buffer = Buffer.concat(chunks);

        await sock.sendMessage(
          statusJid,
          {
            video: buffer,

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
              "✅ *Video Status එකට Upload කළා!*\n\n" +
              "📱 Botගේ WhatsApp එකේ *My Status* බලන්න."
          },
          { quoted: msg }
        );
      }

      // ============================================================
      // 3. TEXT STATUS
      // ============================================================

      if (captionText) {

        await sock.sendMessage(
          statusJid,
          {
            text: captionText
          },
          {
            statusJidList,
            broadcast: true,

            // Text status background
            backgroundColor: "#111111",

            // WhatsApp status font
            font: 3
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
              "✅ *Text Status එකට Upload කළා!*\n\n" +
              "📱 Botගේ WhatsApp එකේ *My Status* බලන්න."
          },
          { quoted: msg }
        );
      }

      // ============================================================
      // NO MEDIA / NO TEXT
      // ============================================================

      return await sock.sendMessage(
        from,
        {
          text:
            "❌ *Status එකක් දෙන්නෙ කොහොමද?*\n\n" +

            "📸 *Image:*\n" +
            "Image එකකට Reply කරලා `.st`\n\n" +

            "🎥 *Video:*\n" +
            "Video එකකට Reply කරලා `.status`\n\n" +

            "📝 *Text:*\n" +
            "`.st Hello World ❤️`\n\n" +

            "💡 Caption එකක් දාන්න:\n" +
            "Image/Video එකකට Reply කරලා\n" +
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
