export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'لم يتم العثور على مفتاح GEMINI_API_KEY في إعدادات Vercel.' });
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

    // قائمة النماذج التي سيجربها السيرفر تلقائياً بالترتيب
    const candidateModels = [
      'gemini-1.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-flash-latest',
      'gemini-1.5-pro'
    ];

    let lastError = null;

    for (const model of candidateModels) {
      const googleResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts }] }),
        }
      );

      const data = await googleResponse.json();

      // إذا نجح التوليد مع النموذج، أرجع النتيجة فوراً
      if (googleResponse.ok && !data.error) {
        return res.status(200).json(data);
      }

      lastError = data.error;
    }

    // إذا لم يعمل أي نموذج من القائمة، قم بإرجاع الخطأ
    return res.status(400).json({ error: lastError });

  } catch (error) {
    console.error('Server Error:', error);
    return res.status(500).json({ error: 'حدث خطأ في معالجة الطلب داخل الخادم.' });
  }
}
