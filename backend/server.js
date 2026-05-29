const express = require('express');
const cors = require('cors');
const { Anthropic } = require('@anthropic-ai/sdk');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

app.post('/api/analyze', async (req, res) => {
  try {
    const { systemPrompt, userPrompt } = req.body;

    if (!userPrompt) {
      return res.status(400).json({ error: 'Missing engineering data payload.' });
    }

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      system: systemPrompt || 'You are an expert structural engineer analyzing finite element data.',
      messages: [{ role: 'user', content: userPrompt }],
    });

    res.json({ text: response.content[0].text });
  } catch (error) {
    console.error('Anthropic API Error:', error);
    res.status(500).json({ error: 'Failed to process AI engineering analysis.' });
  }
});

app.listen(PORT, () => {
  console.log(`Nexus FEA secure backend running on http://localhost:${PORT}`);
});
