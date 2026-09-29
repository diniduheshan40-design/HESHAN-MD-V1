module.exports = {
  name: "ai",
  alias: ["autoai", "chatbot"],
  description: "Toggle auto AI persona reply mode",
  execute: async (sock, msg, args, from, context) => {
    const { reply, sender, DEVELOPER_NUMBER } = context;

    // Check if the user is the owner/developer
    const senderClean = sender.split("@")[0].replace(/[^0-9]/g, "");
    if (senderClean !== DEVELOPER_NUMBER) {
      return await reply("⚠️ මෙම විධානය භාවිතා කළ හැක්කේ Bot Owner හට පමණි.");
    }

    const mode = (args[0] || "").toLowerCase().trim();

    if (mode === "on") {
      global.aiAutoReply = true;
      return await reply("🤖 *HESHAN AI AUTO-REPLY IS NOW ACTIVE!* 🔥\nදැන් එන සාමාන්‍ය මැසේජ් වලට මගේ විලාසයෙන් AI එකෙන් auto reply ලැබෙනවා.");
    } else if (mode === "off") {
      global.aiAutoReply = false;
      return await reply("🛑 *HESHAN AI AUTO-REPLY DEACTIVATED.*");
    } else {
      return await reply(`💡 *භාවිතා කරන ආකාරය:*\n• *.ai on* - AI Auto Reply සක්‍රිය කිරීමට\n• *.ai off* - AI Auto Reply අක්‍රිය කිරීමට\n\n📌 *වත්මන් තත්ත්වය:* ${global.aiAutoReply ? "ON 🟢" : "OFF 🔴"}`);
    }
  }
};
