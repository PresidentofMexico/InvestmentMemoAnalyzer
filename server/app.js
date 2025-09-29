// Minimal Express backend for analysis and TTS endpoints

const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get("/", (req, res) => res.send("Investment Memo Analyzer API running."));

// Analyze endpoint (stub)
app.post("/analyze", async (req, res) => {
  const { memoText, depth, industry, focusAreas } = req.body;
  // TODO: Integrate with Claude/OpenAI API
  res.json({
    executive_summary: "Stub summary...",
    financial_analysis: {
      narrative: "Stub financials...",
      key_metrics: [
        { metric: "Revenue", current: "$10M", projected: "$15M", benchmark: "$12M" }
      ]
    },
    market_analysis: "Stub market analysis...",
    risk_opportunities: "Stub risk section...",
    decision_factors: "Stub decision factors...",
    audio_script: "Stub narration script with all sections combined."
  });
});

// TTS endpoint (stub)
app.post("/tts", async (req, res) => {
  // TODO: Integrate with TTS API
  res.status(501).json({ error: "TTS not implemented yet." });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`API listening on port ${PORT}`));