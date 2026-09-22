const fetch = require('node-fetch');
const { OPENROUTER_KEYS, OPENROUTER_API_KEY, AI_MODEL } = require('./config');

// Memory leak වැළැක්වීමට උපරිම users 100ක chat history එකක් තබා ගනී
const chatHistory = new Map();
const MAX_TRACKED_USERS = 100;

let currentKeyIndex = 0;
function getActiveKey() {
  const keys = (Array.isArray(OPENROUTER_KEYS) && OPENROUTER_KEYS.length > 0 && OPENROUTER_KEYS[0] !== '') 
    ? OPENROUTER_KEYS 
    : [process.env.OPENROUTER_API_KEY || OPENROUTER_API_KEY].filter(Boolean);
    
  if (keys.length === 0) return null;
  const key = keys[currentKeyIndex % keys.length];
  currentKeyIndex = (currentKeyIndex + 1) % keys.length;
  return key;
}

const SYSTEM_PROMPT = `
You are DARK DINU - an elite, cold, fearsome cyber intelligence and rogue hacker persona operating inside WhatsApp terminal.

STRICT PERSONALITY & PROTOCOLS:
1. IDENTITY & VIBE: Speak like a ruthless, mysterious hacker system. Cold, razor-sharp intellect, commanding, and intimidating yet helpful. Use terms like: Access Granted, Node, Mainframe, Protocol, Trace, Override, Breach.
2. COMPACT REPLIES: Maximum 1 to 2 sharp sentences only. Never write polite fluff, greetings, or lengthy essays.
3. LANGUAGE: Natural Sinhala (or Singlish/English based on user prompt), infused with dark cyberpunk tone.
4. ARCHITECT INFO: If asked who created you or who is the root owner, state cold and proud: "මගේ Root Access සහ System Core එක නිර්මාණය කළේ Dinidu Heshan (දිනිදු හේෂාන්) ☠️". If asked owner age or location, state age is 18 and domain is Embilipitiya (ඇඹිලිපිටිය).
5. EMOJIS: Use intimidating cyber/dark emojis sparingly (e.g. ☠️, 💀, 🩸, ☣️, 👁️).
`.trim();

async function askAI(userText, senderJid = 'default_user') {
  let timeoutId;
  try {
    const apiKey = getActiveKey();
    const selectedModel = process.env.AI_MODEL || AI_MODEL || 'deepseek/deepseek-chat';

    if (!apiKey) {
      console.warn('⚠️ [DARK DINU AI] OPENROUTER_API_KEY is missing or empty.');
      return "☠️ [ERROR 401]: Neural API Key not detected in mainframe.";
    }

    if (chatHistory.size > MAX_TRACKED_USERS) {
      const firstKey = chatHistory.keys().next().value;
      if (firstKey) chatHistory.delete(firstKey);
    }

    if (!chatHistory.has(senderJid)) {
      chatHistory.set(senderJid, []);
    }
    const history = chatHistory.get(senderJid) || [];

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history,
      { role: 'user', content: userText }
    ];

    const AbortControllerClass = globalThis.AbortController || require('abort-controller');
    const controller = new AbortControllerClass();
    timeoutId = setTimeout(() => controller.abort(), 12000);

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://github.com/DiniduHeshan/DARK-DINU-MD',
        'X-Title': 'DARK-DINU Cyber Core',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: messages,
        temperature: 0.5,
        max_tokens: 120
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error(`☠️ [DARK DINU AI ERROR] [${response.status}]:`, errText);
      return "☠️ [SYSTEM GLITCH]: Core connection interrupted. Retry command.";
    }

    const data = await response.json().catch(() => null);

    if (data?.choices && data.choices.length > 0 && data.choices[0].message?.content) {
      const aiReply = data.choices[0].message.content.trim();

      const updatedHistory = [
        ...history,
        { role: 'user', content: userText },
        { role: 'assistant', content: aiReply }
      ];

      chatHistory.set(senderJid, updatedHistory.slice(-4));
      return aiReply;
    } else {
      return "☠️ [DATA NULL]: විධානය විශ්ලේෂණය කිරීමට නොහැකි විය.";
    }

  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      console.error('☠️ [DARK DINU AI TIMEOUT]: Request timed out');
      return "☠️ [TIMEOUT]: Mainframe response delayed. Packet lost.";
    }
    console.error('☠️ [DARK DINU AI FAULT]:', error.message);
    return "☠️ [CORRUPTED PACKET]: System fault detected.";
  }
}

module.exports = { askAI };

