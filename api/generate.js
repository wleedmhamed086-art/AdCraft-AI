export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'لم يتم إدراج GEMINI_API_KEY في إعدادات Vercel.' });
  }

  try {
    const { promptText, imageData } = req.body;

    const parts = [{ text: promptText }];
    if (imageData) {
      parts.push({
        inlineData: {
          mimeType: imageData.mimeType,
          data: imageData.data
        }
      });
    }

    // استخدام النموذج الأساسي المجاني السريع مباشرة
    const model = 'gemini-1.5-flash';

    const googleResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts }] }),
      }
    );

    const data = await googleResponse.json();

    if (googleResponse.ok && !data.error) {
      return res.status(200).json(data);
    } else {
      const errorMsg = data.error?.message || 'حدث خطأ في استجابة جوجل.';
      return res.status(googleResponse.status).json({ error: errorMsg });
    }

  } catch (error) {
    console.error('Server Error:', error);
    return res.status(500).json({ error: 'حدث خطأ في الاتصال بالسيرفر.' });
  }
}
