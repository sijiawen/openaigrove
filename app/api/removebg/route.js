import { NextResponse } from 'next/server';

export async function POST(request) {
  const apiKey = process.env.REMOVE_BG_API_KEY;
  if (!apiKey) {
    // No key configured — return original image unchanged
    const { imageBase64 } = await request.json();
    return NextResponse.json({ result: imageBase64 });
  }

  try {
    const { imageBase64 } = await request.json();
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

    const formData = new FormData();
    formData.append('image_file_b64', base64Data);
    formData.append('size', 'auto');

    const res = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey },
      body: formData,
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('remove.bg error:', err);
      // Fall back to original image
      return NextResponse.json({ result: imageBase64 });
    }

    const buffer = await res.arrayBuffer();
    const b64 = Buffer.from(buffer).toString('base64');
    return NextResponse.json({ result: `data:image/png;base64,${b64}` });

  } catch (err) {
    console.error('removebg route error:', err);
    const { imageBase64 } = await request.json().catch(() => ({ imageBase64: '' }));
    return NextResponse.json({ result: imageBase64 });
  }
}
