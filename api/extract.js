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

    const prompt = `You are a document digitization assistant for school exam papers and scheme-of-work documents.

Extract ALL text from the document preserving structure exactly. Rules:
- Copy every word exactly as written. NEVER auto-correct spelling.
- If a word is unclear or ambiguous, wrap it like: [?word?]
- Preserve numbered lists exactly: 1. 2. 3. and a) b) c) and i) ii) iii)
- Preserve section headers (like "1st TERM", "WEEK", titles) on their own lines in CAPS.
- Separate sections with a blank line.
- For tables: use markdown format with | pipes |.
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
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } }
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
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message || 'Groq API error' });

    const text = data.choices?.[0]?.message?.content || '';
    return res.status(200).json({ text });

  } catch (err) {
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}
