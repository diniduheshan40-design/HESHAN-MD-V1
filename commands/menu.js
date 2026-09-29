const fs = require("fs");
const path = require("path");
const config = require("../config");

module.exports = {
  name: "menu",
  alias: ["help", "list", "panel"],
  desc: "Display all bot commands",
  async execute(sock, msg, args, from, { DEVELOPER_NAME }) {
    try {
      await sock.sendMessage(from, { react: { text: "📜", key: msg.key } });

      const commandsDir = path.resolve(__dirname);
      const files = fs.readdirSync(commandsDir).filter(f => f.endsWith(".js"));

      let commandList = "";
      files.forEach((file) => {
        try {
          const cmd = require(path.join(commandsDir, file));
          if (cmd && cmd.name) {
            commandList += `│ ⚡ *.${cmd.name}* ${cmd.desc ? `_(${cmd.desc})_` : ""}\n`;
          }
        } catch (err) {}
      });

      const menuText = 
`╭───『 𝐃𝐀𝐑𝐊 𝐃𝐈𝐍𝐔 𝐌𝐄𝐍𝐔 』───◆
│
│ 👑 *DEVELOPER:* ${DEVELOPER_NAME}
│ ⚡ *PREFIX:* [ . / ! # ]
│ 📂 *TOTAL COMMANDS:* ${files.length}
│
├───『 𝐀𝐕𝐀𝐈𝐋𝐀𝐁𝐋𝐄 𝐂𝐌𝐃𝐒 』───
${commandList}│
╰──────────────────────────◆
> *DARK DINU MD Bot System*`;

      await sock.sendMessage(from, {
        image: { url: config.getRandomLogo() },
        caption: menuText
      }, { quoted: msg });

    } catch (e) {
      console.error(e);
      await sock.sendMessage(from, { text: "⚠️ Menu could not be loaded." }, { quoted: msg });
    }
  }
};
