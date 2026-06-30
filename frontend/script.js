// ── CONFIG ──
const BACKEND_URL = 'http://localhost:3000/chat';

// ── GRAB ELEMENTS ──
const bubbleBtn = document.getElementById('bubbleBtn');
const unreadBadge = document.getElementById('unreadBadge');
const chatWindow = document.getElementById('chatWindow');
const closeBtn = document.getElementById('closeBtn');
const messagesEl = document.getElementById('messages');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');

// ── STATE ──
let conversationHistory = [];   // sent to backend for context
let chatOpened = false;         // tracks first open

// ── START: chat window starts hidden ──
chatWindow.classList.add('hidden');

// ── HELPER: get current time like "10:42 AM" ──
function getTime() {
  const now = new Date();
  let hours = now.getHours();
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${ampm}`;
}

// ── HELPER: add a message bubble to the chat ──
function formatMessage(text) {
  // Escape HTML first to prevent injection issues
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Split into lines, wrap bullets and paragraphs properly
  const lines = escaped.split('\n').filter(line => line.trim() !== '');

  let html = '';
  let inList = false;

  lines.forEach(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith('•')) {
      if (!inList) {
        html += '<ul>';
        inList = true;
      }
      html += `<li>${trimmed.slice(1).trim()}</li>`;
    } else {
      if (inList) {
        html += '</ul>';
        inList = false;
      }
      html += `<p>${trimmed}</p>`;
    }
  });

  if (inList) html += '</ul>';

  return html;
}

function addMessage(text, type) {
  const msg = document.createElement('div');
  msg.className = 'message ' + type;

  if (type === 'bot') {
    msg.innerHTML = formatMessage(text);
  } else {
    msg.textContent = text; // user messages stay plain, no need to format
  }

  messagesEl.appendChild(msg);

  const time = document.createElement('div');
  time.className = 'timestamp';
  time.textContent = getTime();
  messagesEl.appendChild(time);

  messagesEl.scrollTop = messagesEl.scrollHeight;
}
// ── HELPER: add suggestion chips (only shown once, at the start) ──
function addChips() {
  const chipsWrap = document.createElement('div');
  chipsWrap.className = 'chips';
  chipsWrap.id = 'chips';

  const suggestions = [
    'What does KNS do?',
    'Cybersecurity services',
    'Contact the team'
  ];

  suggestions.forEach(text => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = text;
    chip.onclick = () => {
      chipsWrap.remove();
      sendMessage(text);
    };
    chipsWrap.appendChild(chip);
  });

  messagesEl.appendChild(chipsWrap);
}

// ── HELPER: show typing indicator ──
function showTyping() {
  const typing = document.createElement('div');
  typing.className = 'typing';
  typing.id = 'typingIndicator';
  typing.innerHTML = '<span></span><span></span><span></span>';
  messagesEl.appendChild(typing);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function removeTyping() {
  const typing = document.getElementById('typingIndicator');
  if (typing) typing.remove();
}

// ── CORE: send a message to the backend and display the response ──
async function sendMessage(text) {
  if (!text.trim()) return;

  // Show user's message immediately
  addMessage(text, 'user');

  // Add to history
  conversationHistory.push({ role: 'user', content: text });

  // Show typing indicator
  showTyping();

  try {
    const response = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        history: conversationHistory.slice(0, -1) // history BEFORE this message
      })
    });

    const data = await response.json();
    removeTyping();

    if (data.reply) {
      addMessage(data.reply, 'bot');
      conversationHistory.push({ role: 'assistant', content: data.reply });
    } else {
      addMessage("Sorry, something went wrong. Please try again or contact info@kns.co.ke", 'bot');
    }

  } catch (error) {
    console.error('Error talking to backend:', error);
    removeTyping();
    addMessage("I'm having trouble connecting right now. Please try again shortly.", 'bot');
  }
}

// ── EVENT: open chat ──
function openChat() {
  chatWindow.classList.remove('hidden');
  chatWindow.style.animation = 'none';
  chatWindow.offsetHeight; // force reflow so animation replays
  chatWindow.style.animation = 'bounce-in-right 1.1s both';

  unreadBadge.classList.add('hidden');

  // First time opening — show greeting + chips
  if (!chatOpened) {
    chatOpened = true;
    addMessage("Hey there 👋 I'm Kova, your guide to everything Konvergenz. What can I help you with?", 'bot');
    addChips();
  }
}

// ── EVENT: close chat ──
function closeChat() {
  chatWindow.style.animation = 'bounce-out-left 1.5s both';
  setTimeout(() => {
    chatWindow.classList.add('hidden');
  }, 1500);
}

// ── WIRE UP EVENTS ──
bubbleBtn.addEventListener('click', openChat);
closeBtn.addEventListener('click', closeChat);

sendBtn.addEventListener('click', () => {
  const text = chatInput.value;
  chatInput.value = '';
  sendMessage(text);
});

chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    const text = chatInput.value;
    chatInput.value = '';
    sendMessage(text);
  }
});