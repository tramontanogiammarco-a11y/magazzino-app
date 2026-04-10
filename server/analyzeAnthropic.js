/**
 * Logica condivisa tra Express (server.js) e Vercel (api/analyze.js).
 */
export async function analyzeAnthropic(body) {
  const { imageBase64, mimeType } = body || {}
  if (!imageBase64) {
    return { status: 400, body: { error: 'imageBase64 mancante' } }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { status: 500, body: { error: 'ANTHROPIC_API_KEY mancante in .env' } }
  }

  const prompt =
    'Analizza la foto di un capo usato con foglio etichetta. Estrai solo JSON valido senza testo extra con queste chiavi: description, sku, client_name, slot. Regole: description 6-7 parole, sku esattamente 4 cifre, mantieni nome cliente e slot come letti.'

  const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 300,
      temperature: 0.2,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType || 'image/jpeg',
                data: imageBase64,
              },
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
    }),
  })

  const payload = await anthropicResponse.json()
  if (!anthropicResponse.ok) {
    return { status: anthropicResponse.status, body: payload }
  }

  const raw = payload?.content?.find((item) => item.type === 'text')?.text?.trim()
  if (!raw) {
    return {
      status: 502,
      body: { error: 'Risposta Anthropic senza testo valido', payload },
    }
  }

  try {
    const clean = raw.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean)
    return { status: 200, body: { data: parsed, raw } }
  } catch (error) {
    return {
      status: 500,
      body: { error: error.message || 'JSON non valido dalla risposta', raw },
    }
  }
}
