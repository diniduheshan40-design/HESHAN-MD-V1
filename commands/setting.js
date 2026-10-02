const mongoose = require("mongoose");

// Database Model fallback inside command
const BotSettingsSchema = new mongoose.Schema(
  {
    botNumber: { type: String, unique: true, required: true },
    botName: { type: String, default: "DARK DINU MD" },
    botLogo: { type: String, default: "https://files.catbox.moe/3fxa4u.jpeg" },
    prefix: { type: String, default: "." },
    workMode: { type: String, default: "public" },
    presence: { type: String, default: "off" },
    statusSeen: { type: Boolean, default: true },
    statusReact: { type: String, default: "💚" },
    antiViewRoute: { type: String, default: "me" },
    antiDeleteRoute: { type: String, default: "me" }
  },
  { timestamps: true }
);

const SettingsModel =
  mongoose.models.DarkDinuSettings ||
  mongoose.model("DarkDinuSettings", BotSettingsSchema);

if (!global.settingSessions) global.settingSessions = new Map();

module.exports = {
  name: "setting",
  alias: ["settings", "config", "set"],
  category: "owner",
  description: "Bot Settings Control Panel",
  async execute(sock, msg, args, from, context) {
    const { reply, isOwner, cleanBody } = context;

    // Command එක run කළ bot ගේ අංකය ලබා ගැනීම
    const currentBotNumber = (sock.user?.id || "").split(":")[0].replace(/[^0-9]/g, "");

    // Database එකෙන් settings ලබා ගැනීම
    let currentSettings = await SettingsModel.findOne({ botNumber: currentBotNumber });
    if (!currentSettings) {
      currentSettings = await SettingsModel.create({ botNumber: currentBotNumber });
    }

    // අංක වලට (1.1, 1.2...) reply කර ඇති විට update කිරීම
    const quotedMsgId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
    const inputCode = (cleanBody || "").trim();

    if (quotedMsgId && global.settingSessions.has(quotedMsgId)) {
      let updateData = {};
      let changeText = "";

      switch (inputCode) {
        // Work Mode
        case "1.1": updateData.workMode = "public"; changeText = "Work Mode ➔ PUBLIC"; break;
        case "1.2": updateData.workMode = "private"; changeText = "Work Mode ➔ PRIVATE (Owner Only)"; break;
        case "1.3": updateData.workMode = "groups"; changeText = "Work Mode ➔ GROUPS ONLY"; break;
        case "1.4": updateData.workMode = "inbox"; changeText = "Work Mode ➔ INBOX ONLY"; break;

        // Presence (Off කළ විට stuck වූ recording/typing status එක ක්ෂණිකව reset කිරීම)
        case "2.1":
          updateData.presence = "off";
          changeText = "Fake Presence ➔ OFF";
          try {
            await sock.sendPresenceUpdate("paused", from);
            await sock.sendPresenceUpdate("available");
          } catch (e) {}
          break;
        case "2.2":
          updateData.presence = "typing";
          changeText = "Fake Presence ➔ TYPING (Composing)";
          try {
            await sock.presenceSubscribe(from);
            await sock.sendPresenceUpdate("composing", from);
          } catch (e) {}
          break;
        case "2.3":
          updateData.presence = "recording";
          changeText = "Fake Presence ➔ RECORDING";
          try {
            await sock.presenceSubscribe(from);
            await sock.sendPresenceUpdate("recording", from);
          } catch (e) {}
          break;

        // Anti ViewOnce
        case "3.1": updateData.antiViewRoute = "me"; changeText = "Anti-ViewOnce ➔ ME (Bot Inbox)"; break;
        case "3.2": updateData.antiViewRoute = "from"; changeText = "Anti-ViewOnce ➔ FROM (Current Chat)"; break;

        // Anti Delete
        case "4.1": updateData.antiDeleteRoute = "me"; changeText = "Anti-Delete ➔ ME (Bot Inbox)"; break;
        case "4.2": updateData.antiDeleteRoute = "from"; changeText = "Anti-Delete ➔ FROM (Current Chat)"; break;

        // Status Read
        case "5.1": updateData.statusSeen = true; changeText = "Auto Status Seen ➔ ON"; break;
        case "5.2": updateData.statusSeen = false; changeText = "Auto Status Seen ➔ OFF"; break;

        // Status React
        case "6.1": updateData.statusReact = "💚"; changeText = "Auto Status React ➔ ON (💚)"; break;
        case "6.2": updateData.statusReact = "off"; changeText = "Auto Status React ➔ OFF"; break;

        default:
          return await reply("❌ වැරදි අංකයක්! Menu එකේ ඇති අංකයකට Reply කරන්න (උදා: 1.1).");
      }

      await SettingsModel.findOneAndUpdate(
        { botNumber: currentBotNumber },
        { $set: updateData },
        { upsert: true }
      );

      // In-memory cache reset (අලුත් settings ක්ෂණිකව ක්‍රියාත්මක වීමට)
      if (global.settingsCache) {
        global.settingsCache.delete(currentBotNumber);
      }

      await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
      return await reply(`⚙️ *SETTINGS UPDATED!*\n\n✔ ${changeText}\n🤖 *Bot Number:* +${currentBotNumber}`);
    }

    // Direct arguments (.setting prefix ! හෝ .setting mode private)
    if (args.length >= 2) {
      const opt = args[0].toLowerCase();
      const val = args[1];

      if (opt === "prefix") {
        await SettingsModel.findOneAndUpdate({ botNumber: currentBotNumber }, { $set: { prefix: val } });
        if (global.settingsCache) global.settingsCache.delete(currentBotNumber);
        return await reply(`✅ Prefix එක සාර්ථකව *${val}* ලෙස මාරු කරන ලදී.`);
      }
      if (opt === "mode" && ["public", "private", "groups", "inbox"].includes(val.toLowerCase())) {
        await SettingsModel.findOneAndUpdate({ botNumber: currentBotNumber }, { $set: { workMode: val.toLowerCase() } });
        if (global.settingsCache) global.settingsCache.delete(currentBotNumber);
        return await reply(`✅ Mode එක සාර්ථකව *${val.toUpperCase()}* ලෙස මාරු කරන ලදී.`);
      }
    }

    // Main Control Panel Message
    const panelText = 
`╭───『 ⚙️ 𝐁𝐎𝐓 𝐒𝐄𝐓𝐓𝐈𝐍𝐆 𝐏𝐀𝐍𝐄𝐋 』───◆
│
│ 🤖 *Bot Name:* ${currentSettings.botName}
│ 👤 *Owner:* +${currentBotNumber}
│ ⚡ *Prefix:* [ ${currentSettings.prefix} ]
│ 🌐 *Mode:* ${currentSettings.workMode.toUpperCase()}
│ 🎭 *Presence:* ${currentSettings.presence.toUpperCase()}
│ 👁️ *Status Seen:* ${currentSettings.statusSeen ? "ON" : "OFF"}
│ ❤️ *Status React:* ${currentSettings.statusReact}
│ 🔄 *Anti-ViewOnce:* ${currentSettings.antiViewRoute.toUpperCase()}
│ 🗑️ *Anti-Delete:* ${currentSettings.antiDeleteRoute.toUpperCase()}
│
╰──────────────────────────◆

*මාරු කිරීමට පහත අංකයකට Reply කරන්න:*

┏━━━『 1. WORK MODE 』
┃ 1.1 ➔ Public (Everyone)
┃ 1.2 ➔ Private (Owner Only)
┃ 1.3 ➔ Groups Only
┃ 1.4 ➔ Inbox Only
┗━━━━━━━━━━━━━━━━━━━━━
┏━━━『 2. FAKE PRESENCE 』
┃ 2.1 ➔ Off
┃ 2.2 ➔ Always Typing
┃ 2.3 ➔ Always Recording
┗━━━━━━━━━━━━━━━━━━━━━
┏━━━『 3. ANTI-VIEWONCE ROUTE 』
┃ 3.1 ➔ Send to ME (Bot Inbox)
┃ 3.2 ➔ Send to FROM (Same Chat)
┗━━━━━━━━━━━━━━━━━━━━━
┏━━━『 4. ANTI-DELETE ROUTE 』
┃ 4.1 ➔ Send to ME (Bot Inbox)
┃ 4.2 ➔ Send to FROM (Same Chat)
┗━━━━━━━━━━━━━━━━━━━━━
┏━━━『 5. AUTO STATUS READ 』
┃ 5.1 ➔ Turn ON
┃ 5.2 ➔ Turn OFF
┗━━━━━━━━━━━━━━━━━━━━━
┏━━━『 6. AUTO STATUS REACT 』
┃ 6.1 ➔ Turn ON (💚)
┃ 6.2 ➔ Turn OFF
┗━━━━━━━━━━━━━━━━━━━━━

💡 *Shortcuts:*
• .setprefix [symbol]
• .setname [name]
• .setlogo [reply to photo]`;

    try {
      const panelLogo = currentSettings.botLogo || "https://files.catbox.moe/3fxa4u.jpeg";

      let sent;
      try {
        sent = await sock.sendMessage(
          from,
          {
            image: { url: panelLogo },
            caption: panelText
          },
          { quoted: msg }
        );
      } catch (imgErr) {
        sent = await sock.sendMessage(from, { text: panelText }, { quoted: msg });
      }

      if (sent?.key?.id) {
        global.settingSessions.set(sent.key.id, { timestamp: Date.now() });
        setTimeout(() => global.settingSessions.delete(sent.key.id), 180000);
      }
    } catch (e) {
      console.error("Setting Panel Error:", e.message);
      await reply("❌ Setting panel එක පෙන්වීමේදී දෝෂයක් ආවා: " + e.message);
    }
  }
};
