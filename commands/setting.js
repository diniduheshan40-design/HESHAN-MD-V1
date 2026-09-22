// commands/settings.js
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const mongoose = require('mongoose');

// In-memory cache to prevent database hammering & freeze
const memSettingsCache = new Map();

// ⚡ Safe Logo Fetcher with Buffer Fallback
let cachedLogo = null;
async function getBotLogo() {
  if (cachedLogo) return cachedLogo;

  try {
    const paths = [
      path.join(process.cwd(), 'logo.jpg'),
      path.join(__dirname, '../logo.jpg'),
      path.join(process.cwd(), 'assets', 'logo.jpg')
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) {
        cachedLogo = fs.readFileSync(p);
        return cachedLogo;
      }
    }
  } catch (e) {
    console.error("Local logo error:", e.message);
  }

  try {
    const fallbackUrl = 'https://files.catbox.moe/a58add.jpeg';
    const res = await axios.get(fallbackUrl, { responseType: 'arraybuffer', timeout: 5000 });
    cachedLogo = Buffer.from(res.data, 'binary');
    return cachedLogo;
  } catch (e) {
    console.error("Remote logo fetch failed:", e.message);
    return null;
  }
}

// Safe Mongo Model Lookup Helper
function getModel() {
  try {
    if (mongoose.connection.readyState !== 1) return null;
    return mongoose.models.BotSettings || mongoose.model('BotSettings');
  } catch (e) {
    return null;
  }
}

module.exports = {
  name: 'settings',
  alias: ['setting', 'set', 'config'],
  category: 'owner',
  desc: 'Control DARK DINU mainframe parameters',

  async execute(sock, msg, args = [], chatJid, safeReply, options = {}) {
    const targetChat = (typeof chatJid === 'string' && chatJid.includes('@')) 
      ? chatJid 
      : (msg.key && msg.key.remoteJid ? msg.key.remoteJid : null);

    if (!targetChat) return;

    // ⚡ Channel Context Info
    const channelContext = global.channelContext?.contextInfo || {
      forwardingScore: 999,
      isForwarded: true,
      forwardedNewsletterMessageInfo: {
        newsletterJid: '120363421906774107@newsletter',
        newsletterName: '☠️ ᴅᴀʀᴋ ᴅɪɴᴜ ᴄᴏʀᴇ ☠️',
        serverMessageId: 1
      }
    };

    const quotedCaption = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage?.caption || 
                          msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation || 
                          msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text || '';

    const isSettingsReply = quotedCaption.includes("SYSTEM SETTINGS") || 
                            quotedCaption.includes("DARK DINU") ||
                            quotedCaption.includes("WORK MODE") ||
                            quotedCaption.includes("FAKE ACTION") ||
                            quotedCaption.includes("AI AUTO CHAT") ||
                            quotedCaption.includes("ANTI-DELETE");

    const rawText = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '').trim();
    const isExplicitCommand = /^[./!#]?(settings|setting|set|config)/i.test(rawText);

    const hasArgsPassed = Array.isArray(args) && args.length > 0;
    if (!isExplicitCommand && !isSettingsReply && !hasArgsPassed) {
      return;
    }

    const rawBotId = sock.user?.id || sock.user?.jid || '';
    const botNumber = rawBotId.split(':')[0].split('@')[0].replace(/\D/g, '') || 'default';
    const senderNumber = (msg.key.participant || targetChat || '').split(':')[0].split('@')[0].replace(/\D/g, '');

    const isOwner = Boolean(
      options.isOwner || 
      msg.key.fromMe || 
      (Array.isArray(global.owner) && global.owner.includes(senderNumber)) ||
      senderNumber === botNumber
    );

    const reply = async (content) => {
      try {
        if (typeof safeReply === 'function') return await safeReply(content);
        const payload = typeof content === 'string' ? { text: content } : { ...content };
        payload.contextInfo = {
          ...(payload.contextInfo || {}),
          ...channelContext
        };
        return await sock.sendMessage(targetChat, payload, { quoted: msg });
      } catch (err) {
        console.error("Reply sending failed:", err.message);
      }
    };

    if (!isOwner) {
      return await reply('☠️ *[ACCESS DENIED]* Root privileges required to access DARK DINU Mainframe.');
    }

    sock.sendMessage(targetChat, { react: { text: "☣️", key: msg.key } }).catch(() => {});

    const defaultValues = {
      workMode: 'public',
      autoStatusSeen: true,
      statusReact: true,
      statusReactEmoji: '💀',
      autoPresence: 'off',
      autoChatRead: false,
      aiChatEnabled: false,
      antiDeleteEnabled: true,
      antiDeleteType: 'all',
      antiDeleteDest: 'me',
      securityPin: '1234'
    };

    let settings = { ...defaultValues };

    if (memSettingsCache.has(botNumber)) {
      settings = Object.assign(settings, memSettingsCache.get(botNumber));
    } else {
      try {
        const SettingsModel = getModel();
        if (SettingsModel) {
          const doc = await SettingsModel.findById(botNumber).lean();
          if (doc) settings = Object.assign(settings, doc);
        }
      } catch (e) {
        console.error("Settings DB Fetch Error:", e.message);
      }
      memSettingsCache.set(botNumber, settings);
    }

    // Input Extraction
    let input = "";
    if (Array.isArray(args) && args.length > 0) {
      input = args.join(' ').trim().toLowerCase();
    } else if (isSettingsReply) {
      input = rawText.toLowerCase();
    }

    let isUpdated = false;

    // 1. WORK MODE
    if (input === '1.1' || input === 'private') { settings.workMode = 'private'; isUpdated = true; }
    else if (input === '1.2' || input === 'public') { settings.workMode = 'public'; isUpdated = true; }
    else if (input === '1.3' || input === 'inbox') { settings.workMode = 'inbox'; isUpdated = true; }
    else if (input === '1.4' || input === 'groups' || input === 'group') { settings.workMode = 'groups'; isUpdated = true; }

    // 2. AUTO STATUS SEEN
    else if (input === '2.1') { settings.autoStatusSeen = true; isUpdated = true; }
    else if (input === '2.2') { settings.autoStatusSeen = false; isUpdated = true; }

    // 3. STATUS REACTION
    else if (input === '3.1') { settings.statusReact = true; isUpdated = true; }
    else if (input === '3.2') { settings.statusReact = false; isUpdated = true; }

    // 4. STATUS REACT EMOJI
    else if (input.startsWith('4')) {
      const parts = input.split(' ');
      if (parts[1]) {
        settings.statusReactEmoji = parts[1].trim();
        isUpdated = true;
      } else {
        return await reply('⚠️ සංකේතයක් ඇතුළත් කරන්න. (Syntax: `.set 4 💀`)');
      }
    }

    // 5. FAKE ACTION (PRESENCE)
    else if (input === '5.1') { settings.autoPresence = 'composing'; isUpdated = true; }
    else if (input === '5.2') { settings.autoPresence = 'recording'; isUpdated = true; }
    else if (input === '5.3') { settings.autoPresence = 'off'; isUpdated = true; }

    // 6. CHANGE PIN
    else if (input.startsWith('pin') || input.startsWith('6')) {
      const parts = input.split(' ');
      const newPin = parts[1] ? parts[1].trim() : '';
      if (newPin && newPin.length >= 4) {
        settings.securityPin = newPin;
        isUpdated = true;
      } else {
        return await reply('⚠️ අවම අංක 4ක PIN එකක් ඇතුළත් කරන්න. (Syntax: `.set 6 7788`)');
      }
    }

    // 7. AUTO CHAT READ (BLUE TICK) ON/OFF
    else if (input === '7.1') { settings.autoChatRead = true; isUpdated = true; }
    else if (input === '7.2') { settings.autoChatRead = false; isUpdated = true; }

    // 8. AI AUTO CHAT ON/OFF
    else if (input === '8.1' || input === 'aichat on') { settings.aiChatEnabled = true; isUpdated = true; }
    else if (input === '8.2' || input === 'aichat off') { settings.aiChatEnabled = false; isUpdated = true; }

    // 🛡️ 9. ANTI-DELETE STATUS (ON / OFF)
    else if (input === '9.1' || input === 'antidel on') { settings.antiDeleteEnabled = true; isUpdated = true; }
    else if (input === '9.2' || input === 'antidel off') { settings.antiDeleteEnabled = false; isUpdated = true; }

    // 🛡️ 10. ANTI-DELETE SCOPE (INBOX / GROUP / ALL)
    else if (input === '10.1' || input === 'antidel inbox') { settings.antiDeleteType = 'inbox'; isUpdated = true; }
    else if (input === '10.2' || input === 'antidel group') { settings.antiDeleteType = 'group'; isUpdated = true; }
    else if (input === '10.3' || input === 'antidel all') { settings.antiDeleteType = 'all'; isUpdated = true; }

    // 🛡️ 11. ANTI-DELETE DESTINATION (ME / FROM)
    else if (input === '11.1' || input === 'antidel to me') { settings.antiDeleteDest = 'me'; isUpdated = true; }
    else if (input === '11.2' || input === 'antidel to from') { settings.antiDeleteDest = 'from'; isUpdated = true; }

    // UPDATE EXECUTOR
    if (isUpdated) {
      memSettingsCache.set(botNumber, settings);

      try {
        const SettingsModel = getModel();
        if (SettingsModel) {
          await SettingsModel.findByIdAndUpdate(
            botNumber,
            { $set: settings },
            { upsert: true, new: true }
          );
        }
      } catch (e) {
        console.error("Settings DB Save Error:", e.message);
      }

      if (typeof global.clearSettingsCache === 'function') {
        global.clearSettingsCache(botNumber);
      }

      const modeBadge = {
        public: 'PUBLIC 🌐',
        private: 'PRIVATE 🔒',
        inbox: 'INBOX 📥',
        groups: 'GROUPS 👥'
      }[settings.workMode] || 'PUBLIC 🌐';

      const presenceBadge = {
        composing: 'COMPOSING ✍️',
        recording: 'RECORDING 🎙️',
        off: 'OFF 🔴'
      }[settings.autoPresence] || 'OFF 🔴';

      const antiDelDestBadge = settings.antiDeleteDest === 'from' ? 'ORIGIN CHAT 💬' : 'OPERATOR TERMINAL (ME) 👤';

      return await reply(
        `☠️ *[DARK DINU :: PARAMETERS RECONFIGURED]*\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `• Target Node    : *+${botNumber}*\n` +
        `• Operation Mode : *${modeBadge}*\n` +
        `• Auto Status    : *${settings.autoStatusSeen ? 'ACTIVE 🟢' : 'DISABLED 🔴'}*\n` +
        `• Status React   : *${settings.statusReact ? 'ACTIVE 🟢' : 'DISABLED 🔴'} (${settings.statusReactEmoji || '💀'})*\n` +
        `• Stealth Action : *${presenceBadge}*\n` +
        `• Blue Tick Trap : *${settings.autoChatRead ? 'ACTIVE 🟢' : 'DISABLED 🔴'}*\n` +
        `• Neural Core AI : *${settings.aiChatEnabled ? 'ONLINE 🟢' : 'OFFLINE 🔴'}*\n` +
        `• Intercept Anti : *${settings.antiDeleteEnabled ? 'ARMED 🟢' : 'DISARMED 🔴'}*\n` +
        `• Intercept Zone : *${(settings.antiDeleteType || 'all').toUpperCase()}*\n` +
        `• Routing Path   : *${antiDelDestBadge}*\n` +
        `━━━━━━━━━━━━━━━━━━━━━`
      );
    }

    // DISPLAY SETTINGS MENU
    const stateBadge = (val) => (val !== false ? '🟢 ARMED' : '🔴 MUTED');
    const modeBadge = {
      public: 'PUBLIC 🌐',
      private: 'STEALTH [PRIVATE] 🔒',
      inbox: 'INBOX EXCLUSIVE 📥',
      groups: 'GROUP DOMAINS 👥'
    }[settings.workMode] || 'PUBLIC 🌐';

    const presenceBadge = {
      composing: 'COMPOSING ✍️',
      recording: 'RECORDING 🎙️',
      off: 'STEALTH (OFF) 🔴'
    }[settings.autoPresence] || 'STEALTH 🔴';

    const antiDelDestBadge = settings.antiDeleteDest === 'from' ? 'SAME DOMAIN' : 'OPERATOR INBOX';

    const menu = `╭─── ☠️ *DARK DINU :: CONTROL MAINFRAME* ☠️ ───╮
│
├ ⚡ *Target Node :* +${botNumber}
├ ☣️ *Threat Lv   :* CRITICAL
├ 🔐 *Root PIN    :* ${settings.securityPin || '1234'}
│
├─◈ *1. WORK MODE* ⤿ [ ${modeBadge} ]
│  ├ 1.1 Stealth (Private)
│  ├ 1.2 Public Mode
│  ├ 1.3 Inbox Domains
│  └ 1.4 Group Domains
│
├─◈ *2. AUTO STATUS MONITOR* ⤿ [ ${stateBadge(settings.autoStatusSeen)} ]
│  ├ 2.1 Monitor On
│  └ 2.2 Monitor Off
│
├─◈ *3. STATUS REACTION* ⤿ [ ${stateBadge(settings.statusReact)} ]
│  ├ 3.1 React On
│  └ 3.2 React Off
│
├─◈ *4. STATUS EMOJI* ⤿ [ ${settings.statusReactEmoji || '💀'} ]
│  └ ✦ Syntax: .set 4 <emoji>
│
├─◈ *5. STEALTH ACTIVITY* ⤿ [ ${presenceBadge} ]
│  ├ 5.1 Fake Typing ✍️
│  ├ 5.2 Fake Recording 🎙️
│  └ 5.3 Abort Stealth 🔴
│
├─◈ *6. ROOT PIN OVERRIDE* ⤿ [ ${settings.securityPin || '1234'} ]
│  └ ✦ Syntax: .set 6 <new_pin>
│
├─◈ *7. BLUE TICK TRACE* ⤿ [ ${stateBadge(settings.autoChatRead)} ]
│  ├ 7.1 Auto Read Armed
│  └ 7.2 Auto Read Disarmed
│
├─◈ *8. NEURAL AI CORE* ⤿ [ ${stateBadge(settings.aiChatEnabled)} ]
│  ├ 8.1 Neural Core On 🤖
│  └ 8.2 Neural Core Off 🛑
│
├─◈ *9. ANTI-DELETE INTERCEPT* ⤿ [ ${stateBadge(settings.antiDeleteEnabled)} ]
│  ├ 9.1 Intercept Armed 🛡️
│  └ 9.2 Intercept Disarmed 🛑
│
├─◈ *10. INTERCEPT SCOPE* ⤿ [ ${(settings.antiDeleteType || 'all').toUpperCase()} ]
│  ├ 10.1 Inboxes Only 📥
│  ├ 10.2 Groups Only 👥
│  └ 10.3 All Sectors 🌐
│
├─◈ *11. DATA DUMP TARGET* ⤿ [ ${antiDelDestBadge} ]
│  ├ 11.1 Dump To Me (Operator) 👤
│  └ 11.2 Dump In Origin Chat 💬
│
╰────────────────────────────────╯
💡 *EXECUTE PARAMETER:*
• Type command with code (e.g. *.set 9.1*, *.set 10.3*)
• Or reply directly with index token (e.g. *9.1*)

> ☠️ ᴅᴀʀᴋ ᴅɪɴᴜ ᴇxᴄʟᴜꜱɪᴠᴇ ꜱʏꜱᴛᴇᴍ`.trim();

    try {
      const logo = await getBotLogo();
      if (logo) {
        await sock.sendMessage(targetChat, {
          image: logo,
          caption: menu,
          mimetype: 'image/jpeg',
          contextInfo: channelContext
        }, { quoted: msg });
        return;
      }
    } catch (err) {
      console.error("Settings Menu Image dispatch failed:", err.message);
    }

    await sock.sendMessage(targetChat, { 
      text: menu,
      contextInfo: channelContext
    }, { quoted: msg }).catch(() => {});
  }
};

