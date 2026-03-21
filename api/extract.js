export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
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
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mimeType, data: imageBase64 } }
        ]
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 4096 }
    };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message || 'Gemini API error' });

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return res.status(200).json({ text });

  } catch (err) {
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}
