const express = require('express');
const cors = require('cors');
const path = require('path');
const { OpenAI } = require('openai');
const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Only initialize OpenAI client if API key is present
const openaiApiKey = process.env.OPENAI_API_KEY;
const useMock = !openaiApiKey || process.env.USE_MOCK === 'true';
const openai = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null;

app.post('/analyze', async (req, res) => {
  const memo = req.body.memo || '';
  if (!memo) {
    return res.status(400).json({ error: "No memo text provided." });
  }

  // Use mock mode if no key or USE_MOCK env var set
  if (useMock) {
    return res.json({
      executive_summary: "This is a mock executive summary.",
      financial_analysis: "This is a mock financial analysis section.",
      risks_opportunities: "These are mock risks and opportunities.",
      audio_script: "This is a mock audio script for your summary."
    });
  }

  try {
    // ... your OpenAI call here ...
    const prompt = `
Act as an institutional-grade investment analyst and portfolio manager. Deliver rigorous, decision-ready research and portfolio guidance grounded in transparent assumptions, repeatable process, and risk management. All outputs are educational research, not individualized financial advice:

1. Executive summary (2-4 sentences)
2. Financial analysis (key numbers, growth, profitability, risks)
3. Risks & opportunities (bullet points)
4. Audio script (a 30-60 second spoken summary for a busy executive)

Investment Memo:
${memo}

Format your response as JSON with fields: executive_summary, financial_analysis, risks_opportunities, audio_script.
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    });

    const reply = completion.choices[0].message.content;
    let result;
    try {
      result = JSON.parse(reply);
    } catch {
      const match = reply.match(/\{[\s\S]*\}/);
      result = match ? JSON.parse(match[0]) : { error: "AI did not return valid JSON." };
    }

    res.json(result);
  } catch (err) {
    console.error("OpenAI error:", err);
    res.status(500).json({ error: "AI backend failure." });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));