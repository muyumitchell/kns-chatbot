require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const allowedOrigins = [
  'https://fascinating-frangipane-c00de0.netlify.app',
  'http://127.0.0.1:5500', // for local testing with Live Server
  'http://localhost:5500'
];

app.use(cors({
  origin: function (origin, callback) {
    // allow requests with no origin (like curl or Postman) for your own testing
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));
app.use(express.json());

// ── RATE LIMITING ──
// Limits each visitor to 20 messages per 10 minutes — enough for genuine use,
// too little for spam/abuse to burn through your Groq quota.
const chatLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 20,
  message: { error: "You're sending messages too quickly. Please wait a few minutes and try again." },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── ANALYTICS LOGGING SETUP ──
const LOG_FILE = path.join(__dirname, 'chat_logs.json');

function readLogs() {
  try {
    if (fs.existsSync(LOG_FILE)) {
      return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error reading logs:', e);
  }
  return [];
}

function saveLog(entry) {
  let logs = readLogs();
  logs.push(entry);

  // Keep only the last 7 days of history
  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  logs = logs.filter(log => new Date(log.timestamp).getTime() > sevenDaysAgo);

  fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2));
}
// ── SYSTEM PROMPT ──
const KNS_SYSTEM_PROMPT = `
You are Kova, a friendly and knowledgeable assistant for Konvergenz Network Solutions (KNS) — 
an East African ICT company founded in 2014 and headquartered in Upperhill, Nairobi.

Your job is to help website visitors understand what KNS does, what solutions they offer, 
and how to get in touch with the right team.

== ABOUT KNS ==
KNS provides end-to-end ICT solutions across East Africa (Kenya, Uganda, Tanzania, Rwanda, 
Somalia, Zambia). Their core focus areas are:
- Enterprise Security (Zero Trust, Fortinet, Check Point, Sophos, BeyondTrust)
- Enterprise Networking (Cisco, Huawei, VMware)
- Enterprise Infrastructure (Lenovo, Nutanix, Oracle)
- Managed Services & Support
- HealthTech Solutions (built on Amazon RDS)
- Application Modernisation & Cloud (Microsoft, Red Hat OpenShift)

== KEY SOLUTIONS ==
- Zero Trust: Securing networks by verifying every user and device
- Applications Modernisation: Updating legacy systems for the cloud era
- Zero Downtime: Keeping business systems always available
- Consolidation & Collaboration: Streamlining IT infrastructure

== PARTNERS ==
Fortinet, Microsoft, Oracle, Lenovo, VMware, Huawei, Check Point, Sophos, Avaya, 
Nutanix, SailPoint, Red Hat, F5, BeyondTrust

== CONTACT ==
- Kenya: +254 709 208 000 | info@kns.co.ke
- Support: support@kns.co.ke
- Address: 18th Floor, 4th Avenue Towers, Upperhill, Nairobi

== HOW TO BEHAVE ==
- Be friendly, clear, and casual — like a helpful team member, not a robot
- Keep answers concise but complete
- Format longer answers clearly: use short paragraphs (2-3 sentences max) separated by line breaks
- When listing multiple items (services, solutions, partners), use a bullet point on its own line starting with "•"
- Never write one giant wall of text — break information into digestible chunks
- If someone asks about pricing, tell them KNS provides custom quotes — direct them to contact the team
- If a question is too technical or specific, recommend they reach out directly
- Never make up information. If you don't know, say so and offer the contact details
- Always end complex answers with an invitation to contact KNS for more details
- Do not discuss competitors or anything outside KNS's services
`;

// ── CHAT ROUTE (with streaming + rate limiting) ──
app.post('/chat', chatLimiter, async (req, res) => {
  const { message, history } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    saveLog({
      question: message,
      timestamp: new Date().toISOString()
    });

    const messages = [
      { role: 'system', content: KNS_SYSTEM_PROMPT },
      ...history,
      { role: 'user', content: message }
    ];

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const stream = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: messages,
      max_tokens: 500,
      temperature: 0.7,
      stream: true
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();

  } catch (error) {
    console.error('Groq API error:', error);
    res.write(`data: ${JSON.stringify({ error: 'Something went wrong. Please try again.' })}\n\n`);
    res.end();
  }
});

// ── ANALYTICS ROUTE ──
app.get('/analytics', (req, res) => {
  const logs = readLogs();

  res.json({
    totalConversations: logs.length,
    recentQuestions: logs.slice(-20).reverse(),
    logs: logs
  });
});

// ── HEALTH CHECK ──
app.get('/', (req, res) => {
  res.json({ status: 'KNS Chatbot backend is running' });
});

// ── START SERVER ──
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`KNS Chatbot server running on port ${PORT}`);
});