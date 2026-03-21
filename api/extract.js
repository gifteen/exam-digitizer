export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured. Please contact the site owner.' });
  }

  try {
    const { imageBase64, mimeType } = req.body;
    if (!imageBase64 || !mimeType) {
      return res.status(400).json({ error: 'Missing image data or mime type' });
    }

    const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '');

    const prompt = `You are a precise document digitization assistant. Extract ALL content from this document with maximum structure preservation.

TEXT EXTRACTION RULES:
- Copy every word, number, and symbol exactly as written. NEVER auto-correct or paraphrase.
- If a word is genuinely unclear, wrap it: [?word?]
- Preserve ALL capitalisation exactly as shown.

STRUCTURE RULES:
- Document title/heading: output on its own line in CAPS
- Company name, address, contact info: each on its own line, preserve exactly
- Section headers: own line, preserve case
- Numbered lists: preserve exactly — 1. 2. 3. / a) b) c) / i) ii) iii) — never renumber
- Bullet points: use - at start of line
- Blank lines between distinct sections
- Bold/important text: wrap in **text**
- Preserve ALL labels like "Our Ref:", "Date:", "To:", "Subject:" on their own lines

TABLE RULES (CRITICAL):
- ALWAYS output tables as markdown pipe tables — never flatten to plain text
- Include header separator row with dashes: |---|---|
- Example format:
  | QUANTITY | DESCRIPTION | RATE | AMOUNT |
  |----------|-------------|------|--------|
  | 20 pcs   | 13amp double | 1500 | 30,000 |
- Preserve ALL data rows, numbers, and totals exactly
- If a cell is empty, leave it blank between pipes: |  |
- Subtotals and totals rows must be included

OUTPUT: Only the document content. No preamble, no commentary, no explanation.`;

    const body = {
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      max_tokens: 8192,
      temperature: 0.05,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${cleanBase64}` } }
          ]
        }
      ]
    };

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message || 'Groq API error' });

    const text = data.choices?.[0]?.message?.content || '';
    return res.status(200).json({ text });

  } catch (err) {
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}
