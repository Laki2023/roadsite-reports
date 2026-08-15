// Vercel Serverless Function — Proxy to Claude API for contract document extraction
// Environment variable ANTHROPIC_API_KEY must be set in Vercel project settings

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured. Add it in Vercel → Settings → Environment Variables.' });

  try {
    const { file_base64, file_type, section, file_name } = req.body;
    if (!file_base64) return res.status(400).json({ error: 'No file provided' });

    const mediaType = file_type || 'application/pdf';
    const isExcel = mediaType.includes('spreadsheet') || mediaType.includes('excel') || (file_name && /\.xlsx?$/i.test(file_name));

    // Build the extraction prompt based on the requested section
    const prompts = {
      all: `You are a construction contract data extractor for Kenya road projects (KeNHA/KURA/KeRRA).
Analyze this contract document and extract ALL of the following into a single JSON object.
Return ONLY valid JSON — no markdown, no backticks, no explanation.

{
  "contract_details": {
    "project_name": "full project title",
    "contract_no": "contract reference number",
    "employer": "employer name (e.g. KeNHA)",
    "contractor_name": "contractor company name",
    "consultant": "supervising consultant firm",
    "fidic_edition": "Red Book 1999 | Red Book 2017 | Yellow Book 1999 | Pink Book MDB",
    "contract_sum": null (number, KES, no commas),
    "commencement_date": "YYYY-MM-DD or null",
    "original_completion_date": "YYYY-MM-DD or null",
    "original_contract_period": null (number, days),
    "defects_liability_period": null (number, days, usually 365),
    "advance_payment_percent": null (number),
    "retention_percent": null (number),
    "start_chainage": null (number, km),
    "end_chainage": null (number, km),
    "road_class": "A|B|C|D|E|Special",
    "county": "county name",
    "region": "region name",
    "funding_source": "GoK | World Bank | AfDB | EU | JICA | other"
  },
  "boq_items": [
    {
      "item_no": "1/01/001",
      "description": "Site clearance",
      "unit": "Ha",
      "quantity": 5.0,
      "rate": 150000,
      "amount": 750000,
      "category": "Preliminary | Earthworks | Pavement | Drainage | Structures | Surfacing | Road Furniture | Dayworks"
    }
  ],
  "equipment": [
    {
      "equipment_name": "Motor Grader CAT 140H",
      "equipment_type": "Grader | Excavator | Roller | Loader | Dozer | Tipper | Bowser | Paver | Crusher | Compressor | Generator | Concrete Mixer | Bitumen Distributor | Other",
      "quantity": 1,
      "ownership": "Owned | Leased | Hired"
    }
  ],
  "key_personnel": [
    {
      "name": "person name or null if not specified",
      "position_title": "e.g. Project Manager",
      "party": "contractor | engineer | employer | subcontractor",
      "qualifications": "relevant qualifications if stated"
    }
  ]
}

RULES:
- For BoQ: extract EVERY priced item. Skip section headers and sub-totals. Include the item number exactly as printed.
- For amounts: numbers only, no currency symbols or commas.
- Categorize each BoQ item into the closest category from the list.
- If a section is not found in the document, return an empty array.
- For dates: use YYYY-MM-DD format. If only month/year given, use the 1st of that month.
- Return ONLY the JSON object, nothing else.`,

      contract_details: `Extract only contract details from this document. Return JSON with a single "contract_details" object. Same fields as above.`,

      boq: `Extract all BoQ/Bill of Quantities line items from this document. Return JSON: { "boq_items": [...] }. Extract every priced item with item_no, description, unit, quantity, rate, amount, category.`,

      equipment: `Extract the equipment/plant schedule from this document. Return JSON: { "equipment": [...] }. Include equipment_name, equipment_type, quantity, ownership.`,

      personnel: `Extract the key personnel schedule from this document. Return JSON: { "key_personnel": [...] }. Include name, position_title, party, qualifications.`,
    };

    const systemPrompt = prompts[section || 'all'];

    // Build content array — PDF as document, images as image
    const content = [];
    if (mediaType === 'application/pdf') {
      content.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: file_base64 },
      });
    } else if (mediaType.startsWith('image/')) {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: mediaType, data: file_base64 },
      });
    }
    content.push({ type: 'text', text: systemPrompt });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 8000,
        messages: [{ role: 'user', content }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      return res.status(response.status).json({ error: `Claude API error: ${errBody}` });
    }

    const data = await response.json();
    const text = data.content.map(c => c.text || '').join('');

    // Parse JSON from response (strip any markdown fences)
    const clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    let extracted;
    try {
      extracted = JSON.parse(clean);
    } catch (parseErr) {
      return res.status(200).json({ raw_text: text, parse_error: 'Could not parse JSON from AI response. Raw text returned.' });
    }

    return res.status(200).json(extracted);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
