import { NextResponse } from 'next/server';

function dataUrlToBuffer(dataUrl) {
  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
  return Buffer.from(base64, 'base64');
}

// Shared photorealism suffix appended to every prompt
const PHOTO_SUFFIX = [
  'Ultra-photorealistic real photograph.',
  'Shot on a professional camera.',
  'Natural lighting.',
  'No AI-generated aesthetic.',
  'No illustration, no painting, no rendering.',
  'Indistinguishable from a real unedited photo.',
].join(' ');

export async function POST(request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'No OPENAI_API_KEY in environment' }, { status: 500 });
  }

  let body;
  try { body = await request.json(); }
  catch (e) { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }); }

  const { mode, compositeImage, actorImage, wardrobeImage, userPrompt, previousGen, sceneImage, actorGenImage } = body;

  try {
    const fd = new FormData();
    fd.append('model', 'gpt-image-1');
    fd.append('n', '1');
    fd.append('size', '1536x1024');

    let prompt;

    if (mode === 'wardrobe') {
      // ── WARDROBE MODE ──────────────────────────────────────────────────────
      prompt = [
        'You are a photo editor. Your task is to dress a person in a specific garment.',
        'IMAGE 1: Reference photo of a person. Preserve their exact face, hair, skin tone, body proportions, pose, and expression.',
        'IMAGE 2: Reference photo of a garment. Copy this garment EXACTLY as shown - same exact color, fabric texture, buttons, collar shape, pocket placement, stitching, and silhouette.',
        'Output: The same person wearing the exact garment from Image 2.',
        'CRITICAL: The garment must be a pixel-accurate copy of Image 2. Do not modify, stylize, or reinterpret the garment in any way.',
        'Keep the person at the same scale and framing as the original photo.',
        'Match lighting on the garment to the ambient light in the original scene.',
        'Keep the original background visible behind the person.',
        userPrompt ? `Additional direction: ${userPrompt}` : '',
        PHOTO_SUFFIX,
      ].filter(Boolean).join(' ');

      fd.append('prompt', prompt);

      if (actorImage) {
        fd.append('image[]', new Blob([dataUrlToBuffer(actorImage)], { type: 'image/png' }), 'actor.png');
      }
      if (wardrobeImage) {
        fd.append('image[]', new Blob([dataUrlToBuffer(wardrobeImage)], { type: 'image/png' }), 'wardrobe.png');
      }

    } else if (mode === 'composite_actor') {
      // ── COMPOSITE ACTOR INTO SCENE ─────────────────────────────────────────
      prompt = [
        'You are compositing a person into a scene photograph.',
        'IMAGE 1: The background scene - use this as the FULL background. Do not crop, zoom, or modify the scene in any way.',
        'IMAGE 2: A person to place into the scene.',
        'Task: Place the person naturally into the scene at a realistic scale.',
        'The scene/background from Image 1 must fill the ENTIRE output image exactly as shown.',
        'Do not zoom in on the person. The person should be at a natural scale within the full scene.',
        'Do not crop or reframe the background scene.',
        'Match the lighting and color grading of the person to the scene.',
        userPrompt || 'Place the person naturally in the scene.',
        PHOTO_SUFFIX,
      ].filter(Boolean).join(' ');

      fd.append('prompt', prompt);

      if (sceneImage) {
        fd.append('image[]', new Blob([dataUrlToBuffer(sceneImage)], { type: 'image/png' }), 'scene.png');
      }
      if (actorGenImage) {
        fd.append('image[]', new Blob([dataUrlToBuffer(actorGenImage)], { type: 'image/png' }), 'actor.png');
      }

    } else {
      // ── PROPS / SETS MODE ──────────────────────────────────────────────────
      prompt = [
        'You are making a minimal, surgical edit to a real photograph. Your job is to change as little as possible.',
        'The background, walls, floors, ceiling, furniture, lighting, color grading, and all architectural details must remain pixel-perfect identical to the input image.',
        'Do not redecorate, restyle, relight, recolor, or reimagine the space in any way.',
        'Do not move, resize, replace, or remove any existing furniture or objects.',
        'Do not change the camera angle, focal length, or perspective.',
        'The only change allowed is: ' + (userPrompt || 'blend the composited elements naturally into the scene') + '.',
        'Treat the input image as ground truth. Any pixel you do not need to change, do not change.',
        PHOTO_SUFFIX,
      ].filter(Boolean).join(' ');

      fd.append('prompt', prompt);

      const base = previousGen || compositeImage;
      if (base) {
        fd.append('image[]', new Blob([dataUrlToBuffer(base)], { type: 'image/png' }), 'composite.png');
      }
    }

    const openaiRes = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: fd,
    });

    console.log('OpenAI status:', openaiRes.status);
    const rawText = await openaiRes.text();
    console.log('OpenAI response (first 300):', rawText.slice(0, 300));

    let data;
    try { data = JSON.parse(rawText); }
    catch (e) { return NextResponse.json({ error: `OpenAI non-JSON: ${rawText.slice(0, 200)}` }, { status: 500 }); }

    if (data.error) return NextResponse.json({ error: data.error.message }, { status: 400 });
    if (!data.data?.[0]?.b64_json) return NextResponse.json({ error: `No image in response: ${JSON.stringify(data).slice(0, 200)}` }, { status: 500 });

    return NextResponse.json({ b64: data.data[0].b64_json });

  } catch (err) {
    console.error('Route error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
