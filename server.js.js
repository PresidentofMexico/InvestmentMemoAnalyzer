const express = require('express');
const cors = require('cors');
const { OpenAI } = require('openai');
const app = express();
app.use(cors());
app.use(express.json());

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Store your OpenAI key in Render's environment variables!
});

app.post('/analyze', async (req, res) => {
  const memo = req.body.memo || '';
  if (!memo) {
    return res.status(400).json({ error: "No memo text provided." });
  }

  try {
    // Call OpenAI: You can improve this prompt as you wish!
    const prompt = `
You are an expert investment analyst. Given the following investment memo, generate:

1. Executive summary (2-4 sentences)
2. Financial analysis (key numbers, growth, profitability, risks)
3. Risks & opportunities (bullet points)
4. Audio script (a 30-60 second spoken summary for a busy executive)

Investment Memo:
${memo}

Format your response as JSON with fields: executive_summary, financial_analysis, risks_opportunities, audio_script.
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo", // or "gpt-4" if you have access
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    });

    // Extract JSON from the model's reply, safely
    const reply = completion.choices[0].message.content;
    let result;
    try {
      result = JSON.parse(reply);
    } catch {
      // If not pure JSON, try to extract JSON substring
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