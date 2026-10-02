const { updateBotSettings } = require("../lib/settingsHelper");

module.exports = {
  name: "setprefix",
  alias: ["prefix"],
  category: "owner",
  description: "Change Bot Prefix dynamically for this number",
  async execute(sock, msg, args, from, context) {
    const { reply, isOwner } = context;
    if (!isOwner) return await reply("❌ මෙම Command එක භාවිතා කළ හැක්කේ Bot හිමිකරුට පමණි!");

    const newPrefix = args[0];
    if (!newPrefix) {
      return await reply("⚠️ කරුණාකර අලුත් Prefix එක ලබා දෙන්න. උදා: *.setprefix !* හෝ *.setprefix #*");
    }

    const currentBotNumber = (sock.user?.id || "").split(":")[0].replace(/[^0-9]/g, "");
    await updateBotSettings(currentBotNumber, { prefix: newPrefix });

    await reply(`✅ සාර්ථකයි! බොට්ගේ Prefix එක *${newPrefix}* ලෙස update කරන ලදී.`);
  }
};
