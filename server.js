const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const textToSpeech = require('@google-cloud/text-to-speech');
let Groq, groqClient = null;
let Anthropic, anthropicClient = null;
let xaiConfigured = false;

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use(express.static(path.join(__dirname, 'public')));

// Ensure uploads directory exists for multer (fallback to /tmp/uploads on read-only FS)
let uploadsDir = process.env.UPLOADS_DIR || path.join(__dirname, 'uploads');
try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
} catch (e) {
  console.warn('Primary uploads dir not available, falling back to /tmp/uploads:', e.message);
  uploadsDir = path.join('/tmp', 'uploads');
  try {
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
  } catch (err) {
    console.error('Failed to prepare fallback uploads directory:', err);
  }
}

// Configure multer for file uploads
const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 10 * 1024 * 1024 }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize provider clients conditionally
const groqApiKey = (process.env.GROQ_API_KEY || '').trim();
const anthropicApiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
const xaiApiKey = (process.env.XAI_API_KEY || '').trim();
try {
  if (groqApiKey) {
    Groq = require('groq-sdk');
    groqClient = new Groq({ apiKey: groqApiKey });
  }
} catch (e) {
  console.warn('Groq SDK not available:', e.message);
}
try {
  if (anthropicApiKey) {
    Anthropic = require('@anthropic-ai/sdk');
    anthropicClient = new Anthropic({ apiKey: anthropicApiKey });
  }
} catch (e) {
  console.warn('Anthropic SDK not available:', e.message);
}

// xAI Grok via REST; mark configured if API key present
if (xaiApiKey) {
  xaiConfigured = true;
}

// Decide mock mode: true only if explicitly requested or no providers available
const useMockEnv = (process.env.USE_MOCK || '').trim() === 'true';
const useMock = useMockEnv || (!groqClient && !anthropicClient && !xaiConfigured);

// Initialize Text-to-Speech client (optional)
let ttsClient = null;
try {
  const options = {};
  const jsonRaw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || process.env.GOOGLE_CREDENTIALS_JSON;
  const base64Raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64 || process.env.GOOGLE_CREDENTIALS_BASE64;
  if (jsonRaw) {
    const parsed = JSON.parse(jsonRaw);
    if (parsed.client_email && parsed.private_key) options.credentials = parsed;
  } else if (base64Raw) {
    const decoded = Buffer.from(base64Raw, 'base64').toString('utf8');
    const parsed = JSON.parse(decoded);
    if (parsed.client_email && parsed.private_key) options.credentials = parsed;
  }
  if (process.env.GOOGLE_PROJECT_ID) options.projectId = process.env.GOOGLE_PROJECT_ID;
  ttsClient = new textToSpeech.TextToSpeechClient(options);
} catch (error) {
  console.log('Text-to-Speech not configured, using mock audio generation');
  ttsClient = null;
}

// Basic health and status endpoints
app.get('/healthz', (req, res) => {
  res.json({ ok: true });
});

// Graceful handler for oversized request bodies
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request too large', limit: '50mb' });
  }
  return next(err);
});

app.get('/status', (req, res) => {
  // Determine active mode; prefer Anthropic by default if configured
  const p = (process.env.PROVIDER || '').toLowerCase();
  let mode = 'unknown';
  if (useMock) mode = 'mock';
  else if (p === 'anthropic' && anthropicClient) mode = 'anthropic';
  else if (p === 'groq' && groqClient) mode = 'groq';
  else if (p === 'xai' && xaiConfigured) mode = 'xai';
  else if (anthropicClient) mode = 'anthropic';
  else if (groqClient) mode = 'groq';
  else if (xaiConfigured) mode = 'xai';

  const render = !!(process.env.RENDER || process.env.RENDER_SERVICE_ID || process.env.RENDER_INSTANCE_ID);
  res.json({
    mode,
    mock: { forced: useMockEnv },
    groq: {
      configured: !!groqApiKey,
      model: process.env.GROQ_MODEL || 'llama-3.1-70b-versatile'
    },
    anthropic: {
      configured: !!anthropicApiKey,
      model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20240620'
    },
    xai: {
      configured: !!xaiApiKey,
      model: process.env.XAI_MODEL || 'grok-2-latest'
    },
    tts: {
      configured: !!ttsClient,
      language: process.env.GOOGLE_TTS_LANGUAGE || 'en-US',
      voice: process.env.GOOGLE_TTS_VOICE || null
    },
    platform: {
      render,
      renderServiceId: process.env.RENDER_SERVICE_ID || null,
      renderServiceName: process.env.RENDER_SERVICE_NAME || null,
      renderInstanceId: process.env.RENDER_INSTANCE_ID || null
    }
  });
});

// Diagnostics: show provider key presence and loaded SDKs (no secrets)
app.get('/providers', (req, res) => {
  res.json({
    mock: { forced: useMockEnv },
    keys: {
      anthropic: Boolean(anthropicApiKey),
      groq: Boolean(groqApiKey),
      xai: Boolean(xaiApiKey)
    },
    modules: {
      anthropicLoaded: Boolean(anthropicClient),
      groqLoaded: Boolean(groqClient),
      xaiConfigured: Boolean(xaiConfigured)
    }
  });
});

app.post('/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const filePath = req.file.path;
    const originalName = req.file.originalname;
    res.json({ success: true, filename: originalName, message: 'File uploaded successfully' });
    setTimeout(() => {
      fs.unlink(filePath, (err) => {
        if (err) console.error('Error deleting uploaded file:', err);
      });
    }, 1000);
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'File upload failed' });
  }
});

// Mock analyze endpoint override when mock mode is enabled
app.post('/analyze', (req, res, next) => {
  if (!useMock) return next();
  const memo = req.body.memo || '';
  if (!memo) {
    return res.status(400).json({ error: 'No memo text provided.' });
  }
  return res.json({
    executive_summary: 'This is a mock executive summary for the investment opportunity.',
    financial_analysis: 'Mock financial analysis: Revenue of $10M, 25% growth rate, 15% profit margin.',
    risks_opportunities: '- Risk: Market volatility\n- Opportunity: Market expansion\n- Risk: Competition',
    audio_script: 'This investment presents a compelling opportunity with strong financials and manageable risks. The company shows consistent growth with a solid market position.'
  });
});

// Real analyze endpoint with robust fallback (Responses API -> Chat Completions)
app.post('/analyze', async (req, res) => {
  const memo = req.body.memo || '';
  if (!memo) {
    return res.status(400).json({ error: 'No memo text provided.' });
  }
  const systemPrompt = 'Act as an institutional-grade investment analyst and portfolio manager. Deliver rigorous, decision-ready research and portfolio guidance grounded in transparent assumptions, repeatable process, and quantitative rigor.';
  const userPrompt = `Analyze the following investment memo and provide the following fields in JSON: \n\n1) executive_summary (2-4 sentences)\n2) financial_analysis (key numbers, growth, profitability, risks)\n3) risks_opportunities (bullet points)\n4) audio_script (a 60-90 second spoken summary for a busy executive).\n\nMemo:\n${memo}`;

  const provider = (process.env.PROVIDER || '').toLowerCase();
  try {
    // If a provider is explicitly requested, ensure it is configured; otherwise surface a clear error
    if (provider) {
      if (provider === 'anthropic' && !anthropicClient) throw new Error('Requested provider anthropic not configured');
      if (provider === 'groq' && !groqClient) throw new Error('Requested provider groq not configured');
      if (provider === 'xai' && !xaiConfigured) throw new Error('Requested provider xai not configured');
    }
    // Anthropic first by default when available
    if ((provider === 'anthropic' || (!provider && anthropicClient)) && anthropicClient) {
      const model = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20240620';
      const msg = await anthropicClient.messages.create({
        model,
        max_tokens: 1200,
        system: systemPrompt,
        messages: [{ role: 'user', content: `${userPrompt}\n\nReturn only valid JSON with keys: executive_summary, financial_analysis, risks_opportunities, audio_script.` }]
      });
      const reply = msg?.content?.[0]?.text || '';
      let json;
      try { json = JSON.parse(reply); } catch { const m = reply.match(/\{[\s\S]*\}/); json = m ? JSON.parse(m[0]) : null; }
      if (!json) throw new Error('Anthropic did not return JSON');
      return res.json(json);
    }

    if ((provider === 'groq' || (!provider && groqClient)) && groqClient) {
      const model = process.env.GROQ_MODEL || 'llama-3.1-70b-versatile';
      const completion = await groqClient.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `${userPrompt}\n\nReturn JSON with keys: executive_summary, financial_analysis, risks_opportunities, audio_script.` }
        ],
        temperature: 0.7
      });
      const reply = completion.choices?.[0]?.message?.content || '';
      let json;
      try { json = JSON.parse(reply); } catch { const m = reply.match(/\{[\s\S]*\}/); json = m ? JSON.parse(m[0]) : null; }
      if (!json) throw new Error('Groq did not return JSON');
      return res.json(json);
    }

    // xAI Grok provider via REST API
    if ((provider === 'xai' || (!provider && xaiConfigured)) && xaiConfigured) {
      const model = process.env.XAI_MODEL || 'grok-2-latest';
      const resp = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `${userPrompt}\n\nReturn only valid JSON with keys: executive_summary, financial_analysis, risks_opportunities, audio_script.` }
          ],
          temperature: 0.7
        })
      });
      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`xAI HTTP ${resp.status}: ${txt}`);
      }
      const data = await resp.json();
      const reply = data?.choices?.[0]?.message?.content || '';
      let json;
      try { json = JSON.parse(reply); } catch { const m = reply.match(/\{[\s\S]*\}/); json = m ? JSON.parse(m[0]) : null; }
      if (!json) throw new Error('xAI did not return JSON');
      return res.json(json);
    }

    // No providers available
    throw new Error('No AI provider configured');
  } catch (err) {
    const status = err?.status || err?.statusCode || 500;
    const body = err?.response?.data || err?.message || 'Unknown error';
    console.error('Analyze error:', status, body);
    return res.status(500).json({ error: 'AI backend failure.', detail: body });
  }
});

app.post('/generate-audio', async (req, res) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'No text provided for audio generation' });
  }
  try {
    if (!ttsClient) {
      return res.json({
        audioUrl: 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmEaAzKH0O/JciYELYDI7tuNOQYdYrbn7qpbFgxXpuT3u2IcBzKM0fHQdCsELH/L7NmOOgcdY7Dn6KZTEgxPo+T1v2IgAjaJ0/LNeSUEL4DM69qOOQcdYbXn6qpZFgtTpOL0wWMgAzKL0O7OdCwEL4DN6tmPOwkpPo/Ry2w=',
        message: 'Mock audio generated (Text-to-Speech not configured)'
      });
    }

    const languageCode = process.env.GOOGLE_TTS_LANGUAGE || 'en-US';
    const voiceName = process.env.GOOGLE_TTS_VOICE;
    const voice = voiceName ? { languageCode, name: voiceName } : { languageCode, ssmlGender: 'NEUTRAL' };
    const request = { input: { text }, voice, audioConfig: { audioEncoding: 'MP3' } };

    const [response] = await ttsClient.synthesizeSpeech(request);
    const audioBase64 = Buffer.from(response.audioContent).toString('base64');
    const audioUrl = `data:audio/mp3;base64,${audioBase64}`;
    return res.json({ audioUrl });
  } catch (error) {
    console.error('Audio generation error:', error);
    return res.status(500).json({ error: 'Audio generation failed' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  // Derive active mode for logging similar to /status
  const p = (process.env.PROVIDER || '').toLowerCase();
  let mode = 'mock';
  if (!useMock) {
    if (p === 'anthropic' && anthropicClient) mode = 'anthropic';
    else if (p === 'groq' && groqClient) mode = 'groq';
    else if (p === 'xai' && xaiConfigured) mode = 'xai';
    else if (anthropicClient) mode = 'anthropic';
    else if (groqClient) mode = 'groq';
    else if (xaiConfigured) mode = 'xai';
  }
  const ttsConfigured = !!ttsClient;
  const ttsLang = process.env.GOOGLE_TTS_LANGUAGE || 'en-US';
  const ttsVoice = process.env.GOOGLE_TTS_VOICE || 'default(neutral)';
  console.log(`Server running on port ${PORT}`);
  console.log(`Mode: ${mode}`);
  console.log(`Provider keys present -> anthropic:${!!anthropicApiKey} groq:${!!groqApiKey} xai:${!!xaiApiKey} (mockForced:${useMockEnv})`);
  console.log(`TTS: ${ttsConfigured ? `enabled (lang: ${ttsLang}, voice: ${ttsVoice})` : 'disabled (mock audio)'}`);
});
