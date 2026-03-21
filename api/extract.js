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

    // Ensure we have clean base64 without data URL prefix
    const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '');

    const prompt = `You are a document digitization assistant for school documents, exam papers, and quotations.

Extract ALL text from the document preserving structure exactly. Rules:
- Copy every word and number exactly as written. NEVER auto-correct spelling or change values.
- If a word is unclear or ambiguous, wrap it like: [?word?]
- Preserve numbered lists exactly: 1. 2. 3. and a) b) c) and i) ii) iii)
- Preserve section headers and titles on their own lines in CAPS.
- Separate sections with a blank line.
- TABLES ARE CRITICAL: Always output tables in proper markdown format like this:
  | QUANTITY | DESCRIPTION | RATE | AMOUNT |
  |----------|-------------|------|--------|
  | 20 pcs   | 13amp double | 1500 | 30,000 |
  Every table row must use | pipe | separators. Never flatten tables into plain text.
- For company headers and address blocks, preserve each line separately.
- Output ONLY the document text. No commentary, no explanation, no intro.`;

    const body = {
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      max_tokens: 4096,
      temperature: 0.1,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${cleanBase64}`
              }
            }
          ]
        }
      ]
    };

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'Groq API error' });
    }

    const text = data.choices?.[0]?.message?.content || '';
    return res.status(200).json({ text });

  } catch (err) {
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}
