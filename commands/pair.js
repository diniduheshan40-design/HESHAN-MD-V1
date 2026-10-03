const QRCode = require("qrcode");
const path = require("path");

// Auth module එකෙන් requestPairCode function එක import කරගැනීම
const { requestPairCode } = require("../auth");

module.exports = {
  name: "pair",
  alias: ["bot", "link", "paircode"],
  desc: "WhatsApp එකෙන්ම නව බොට් කෙනෙක් link කරගැනීමට QR & Pairing Code ලබා ගැනීම",

  async execute(sock, msg, args, from, { reply, prefix, DEVELOPER_NAME }) {
    try {
      // 1. Phone number එක ලබාගැනීම
      let targetNumber = args[0];

      if (!targetNumber) {
        return await reply(
          `⚠️ *කරුණාකර Phone Number එක ලබා දෙන්න!*\n\n*භාවිතය:* ${prefix}pair 0771234567\n*හෝ:* ${prefix}bot 94771234567`
        );
      }

      // 2. අංකය clean කර ගැනීම
      let cleanNumber = String(targetNumber).replace(/[^0-9]/g, "");
      if (cleanNumber.startsWith("0")) {
        cleanNumber = "94" + cleanNumber.substring(1);
      }

      if (!cleanNumber.startsWith("94") || cleanNumber.length !== 11) {
        return await reply(
          "❌ *වැරදි දුරකථන අංක ආකෘතියක්!* කරුණාකර නිවැරදි ශ්‍රී ලාංකික අංකයක් ලබා දෙන්න.\n\nඋදාහරණ: 0771234567"
        );
      }

      await sock.sendMessage(from, { react: { text: "⏳", key: msg.key } });

      const waitMsg = await reply(
        `⏳ *Generating Pairing Code for +${cleanNumber}...*\nවිනාඩියක් රැඳී සිටින්න.`
      );

      // 3. auth.js එකෙන් Pair code එක generate කරගැනීම
      const result = await requestPairCode(cleanNumber);
      const pairCode = result.code; // Format: ABCD-EFGH

      if (!pairCode) {
        throw new Error("WhatsApp වෙතින් Pairing Code එකක් නොලැබුණි.");
      }

      // 4. Pairing Code එකෙන් ලස්සන QR Code Image එකක් Buffer එකක් ලෙස හැදීම
      const qrBuffer = await QRCode.toBuffer(pairCode, {
        errorCorrectionLevel: "H",
        type: "image/png",
        margin: 2,
        scale: 8,
        color: {
          dark: "#000000",
          light: "#ffffff"
        }
      });

      // 5. Link Device කරන පිළිවෙළ සහ Code එක සහිත Caption එක
      const captionText = 
`╭───『 𝐃𝐀𝐑𝐊 𝐃𝐈𝐍𝐔 𝐏𝐀𝐈𝐑 』───◆
│
│ 📱 *PHONE:* +${cleanNumber}
│ 🔐 *PAIR CODE:* \`${pairCode}\`
│
╰──────────────────────────◆

📋 *LINK DEVICE කරන පිළිවෙළ:*
1️⃣ ඔබගේ WhatsApp Settings (හෝ තිත් තුන ⋮) වෙත යන්න.
2️⃣ *Linked Devices* තෝරන්න.
3️⃣ *Link a Device* click කරන්න.
4️⃣ පහළ ඇති *Link with phone number instead* ඔබන්න.
5️⃣ ඉහත ලබාදී ඇති අකුරු 8 කේතය ඇතුළත් කරන්න:
👉 \`${pairCode}\`

> ⚠️ *තත්පර 45ක් ඇතුළත කේතය ඇතුළත් කර අවසන් කරන්න.*
> *Powered by ${DEVELOPER_NAME || "DINIDU HESHAN"}* 🔥`;

      // 6. QR Code එක සහ Caption එක එකවර Send කිරීම
      await sock.sendMessage(from, {
        image: qrBuffer,
        caption: captionText
      }, { quoted: msg });

      // Code එක පමණක් වෙනම Copy කරගන්න Message එකක්
      await sock.sendMessage(from, {
        text: `${pairCode}`
      }, { quoted: msg });

      await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });

    } catch (err) {
      console.error("Pair Command Error:", err);
      await sock.sendMessage(from, { react: { text: "❌", key: msg.key } });
      await reply(`❌ Pairing Code එක ලබාගැනීමට නොහැකි විය:\n_${err.message || "Error"}_`);
    }
  }
};
