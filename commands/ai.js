const config = require("../config");

module.exports = {
  name: "ai",
  alias: ["gpt", "ask", "botai"],
  desc: "Ask anything from AI",
  async execute(sock, msg, args, from, { reply }) {
    try {
      const prompt = args.join(" ").trim();

      // User ප්‍රශ්නයක් ලියලා නැත්නම්
      if (!prompt) {
        return await reply("⚠️ කරුණාකර ප්‍රශ්නයක් අසන්න.\n*උදාහරණ:* `.ai ලංකාවේ අගනුවර කුමක්ද?`");
      }

      // API Key එක config එකේ තියෙනවද බැලීම
      if (!config.OPENROUTER_API_KEY) {
        return await reply("⚠️ OpenRouter API Key එක සකසා නැත! කරුණාකර .env එකට OPENROUTER_API_KEY එක් කරන්න.");
      }

      // Reaction එකක් දානවා (AI හිතන බව පෙන්වන්න)
      await sock.sendMessage(from, { react: { text: "🧠", key: msg.key } });

      // OpenRouter API Call
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${config.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com",
          "X-Title": "DARK DINU MD"
        },
        body: JSON.stringify({
          model: config.AI_MODEL,
          messages: [
            {
              role: "system",
              content: "You are DARK DINU AI, a smart and helpful WhatsApp assistant developed by DINIDU HESHAN. Answer accurately and politely in the language the user speaks (Sinhala, English, Singlish)."
            },
            {
              role: "user",
              content: prompt
            }
          ]
        })
      });

      const data = await response.json();

      if (data.choices && data.choices[0] && data.choices[0].message) {
        const aiReply = data.choices[0].message.content.trim();
        
        const formattedReply = 
`╭───『 𝐃𝐀𝐑𝐊 𝐃𝐈𝐍𝐔 𝐀𝐈 』───◆
│
${aiReply}
│
╰───────────────────────◆
> *Model: ${config.AI_MODEL.split(":")[0]}*`;

        // Logo එකක් එක්ක යැවීම
        const logoUrl = config.getRandomLogo();
        if (logoUrl) {
          await sock.sendMessage(from, {
            image: { url: logoUrl },
            caption: formattedReply
          }, { quoted: msg });
        } else {
          await reply(formattedReply);
        }

        await sock.sendMessage(from, { react: { text: "✅", key: msg.key } });
      } else {
        console.error("OpenRouter Error response:", data);
        await reply("❌ AI සේවාවෙන් පිළිතුරක් ලබා ගැනීමට නොහැකි විය.");
      }

    } catch (err) {
      console.error("AI Command Error:", err.message);
      await reply(`❌ AI Error: ${err.message}`);
    }
  }
};
