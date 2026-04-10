async function prepareImageForUpload(file) {
  const imageUrl = URL.createObjectURL(file)

  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = reject
      el.src = imageUrl
    })

    const maxSize = 800
    const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
    const width = Math.max(1, Math.round(img.width * scale))
    const height = Math.max(1, Math.round(img.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas non disponibile')

    ctx.drawImage(img, 0, 0, width, height)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.7)
    return {
      base64: dataUrl.split(',')[1],
      mimeType: 'image/jpeg',
    }
  } finally {
    URL.revokeObjectURL(imageUrl)
  }
}

export async function extractProductDataFromPhoto(file) {
  const { base64, mimeType } = await prepareImageForUpload(file)

  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      imageBase64: base64,
      mimeType,
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Proxy analyze error ${response.status}: ${errorBody}`)
  }

  const payload = await response.json()
  if (!payload?.data) {
    throw new Error('Proxy response senza campo data')
  }
  return payload.data
}
