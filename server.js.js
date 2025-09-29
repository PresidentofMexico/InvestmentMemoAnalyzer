const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());

app.post('/analyze', (req, res) => {
  const memo = req.body.memo || '';
  res.json({
    executive_summary: "AI-generated executive summary goes here.",
    financial_analysis: "AI-generated financial analysis goes here.",
    risks_opportunities: "AI-generated risks & opportunities go here.",
    audio_script: "AI-generated audio script goes here."
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));