export const config = { api: { bodyParser: { sizeLimit: '20mb' } } };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { image, mimeType = 'image/jpeg', filename = '' } = req.body;

  if (!image) {
    return res.status(400).json({ error: 'No image data provided' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  // ── The prompt ──────────────────────────────────────────────────────────────
  // Strict extraction: copy only what is visibly written.
  // No guessing, no filling, no completing, no inferring.
  // ────────────────────────────────────────────────────────────────────────────
  const SYSTEM_PROMPT = `You are a precise document transcription assistant. Your only job is to copy exactly what is written in the document — nothing more, nothing less.

STRICT RULES:
1. Copy only text that is visibly written. Do not guess, infer, complete, or fill in anything.
2. If a line has a blank space for an answer (e.g. "Name: ___________"), keep it exactly as a blank line. Do not fill it in.
3. If a word is unclear or illegible, write [?] in its place. Do not guess what it might say.
4. If a section is completely unreadable, write [UNREADABLE SECTION] and move on.
5. Preserve the document structure: headings, numbered lists, bullet points, tables, question numbers.
6. Tables: reproduce them as plain text with | separators.
7. Do not add commentary, explanations, or any words not in the original document.
8. Do not correct spelling or grammar — copy errors exactly as written.

After transcribing, provide a JSON block at the very end in this exact format:
<confidence>
{
  "score": 85,
  "quality": "high",
  "issues": [
    { "type": "unclear_word", "detail": "Word after 'the' on line 3 was illegible — marked as [?]" },
    { "type": "low_image_quality", "detail": "Bottom quarter of image is blurry" }
  ]
}
</confidence>

Quality levels: "high" = 85-100, "medium" = 60-84, "low" = below 60.
Issue types: "unclear_word", "low_image_quality", "partial_content", "table_complex", "handwriting_difficult", "blank_preserved".

If the image has no readable text at all, respond with:
NO_TEXT_FOUND
<confidence>{"score": 0, "quality": "low", "issues": [{"type": "no_text", "detail": "No readable text found in image"}]}</confidence>`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        max_tokens: 8000,
        temperature: 0.1, // low temperature = less creative guessing
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${image}`,
                  detail: 'high'
                }
              },
              {
                type: 'text',
                text: SYSTEM_PROMPT
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Groq API error:', response.status, errText);
      return res.status(502).json({
        error: 'Extraction service error',
        detail: `API returned ${response.status}`
      });
    }

    const data = await response.json();
    const raw = data?.choices?.[0]?.message?.content || '';

    // ── Parse out the confidence block ────────────────────────────────────────
    let confidence = { score: 75, quality: 'medium', issues: [] };
    let text = raw;

    const confMatch = raw.match(/<confidence>([\s\S]*?)<\/confidence>/);
    if (confMatch) {
      try {
        confidence = JSON.parse(confMatch[1].trim());
      } catch (e) {
        // confidence parse failed — keep defaults
      }
      // Remove the confidence block from the text
      text = raw.replace(/<confidence>[\s\S]*?<\/confidence>/g, '').trim();
    }

    // ── Handle no-text case ────────────────────────────────────────────────────
    if (text.startsWith('NO_TEXT_FOUND') || text.trim() === '') {
      return res.json({
        text: '',
        confidence,
        empty: true,
        message: 'No readable text found in this image.'
      });
    }

    // ── Catch runaway / junk output ───────────────────────────────────────────
    // If the same line repeats more than 5 times, something went wrong
    const lines = text.split('\n').filter(l => l.trim());
    const lineCounts = {};
    for (const line of lines) {
      const key = line.trim().toLowerCase();
      lineCounts[key] = (lineCounts[key] || 0) + 1;
    }
    const maxRepeat = Math.max(...Object.values(lineCounts));
    if (maxRepeat > 5 && lines.length > 10) {
      return res.json({
        text: '',
        confidence: { score: 0, quality: 'low', issues: [{ type: 'extraction_error', detail: 'Model produced repeated output — image may be too blurry or low resolution.' }] },
        empty: true,
        message: 'Extraction failed: image quality too low or document unreadable. Try a clearer scan.'
      });
    }

    // ── Convert plain text to basic HTML ──────────────────────────────────────
    const html = textToHtml(text);

    return res.json({ text: html, confidence, empty: false });

  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({
      error: 'Extraction failed',
      detail: err.message
    });
  }
}

// ── Convert extracted plain text to clean HTML ────────────────────────────────
function textToHtml(text) {
  const lines = text.split('\n');
  const html = [];
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      if (inTable) { html.push('</table></div>'); inTable = false; }
      html.push('<p><br></p>');
      continue;
    }

    // Table row (contains | separators)
    if (trimmed.includes('|') && trimmed.split('|').length >= 3) {
      if (!inTable) {
        html.push('<div class="tbl-wrap"><table>');
        inTable = true;
      }
      const cells = trimmed.split('|').map(c => c.trim()).filter(c => c !== '');
      const isHeader = i === 0 || lines[i - 1]?.trim() === '' || trimmed.includes('---');
      const tag = isHeader ? 'th' : 'td';
      const row = cells.map(c => `<${tag} contenteditable="true">${escHtml(c)}</${tag}>`).join('');
      html.push(`<tr>${row}</tr>`);
      continue;
    }

    if (inTable) { html.push('</table></div>'); inTable = false; }

    // Headings (all caps lines, or lines ending with :)
    if (trimmed === trimmed.toUpperCase() && trimmed.length > 3 && trimmed.length < 80 && /[A-Z]/.test(trimmed)) {
      html.push(`<h2>${escHtml(trimmed)}</h2>`);
      continue;
    }

    // Numbered items
    if (/^(\d+[\.\)]\s)/.test(trimmed)) {
      html.push(`<p>${escHtml(trimmed)}</p>`);
      continue;
    }

    // Bullet items
    if (/^[•\-\*]\s/.test(trimmed)) {
      html.push(`<p>${escHtml(trimmed)}</p>`);
      continue;
    }

    // Highlight uncertain words [?]
    const withHighlights = escHtml(trimmed).replace(
      /\[\?\]/g,
      '<mark class="uncertain" title="Unclear in original">[?]</mark>'
    );

    html.push(`<p>${withHighlights}</p>`);
  }

  if (inTable) html.push('</table></div>');

  return html.join('\n');
}

function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
