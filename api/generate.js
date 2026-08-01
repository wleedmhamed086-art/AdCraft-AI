export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'لم يتم العثور على GEMINI_API_KEY. تأكد من إضافته في Vercel وتحديث التعيين (Redeploy).' });
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

    // أحدث أسماء النماذج المتاحة في API
    const candidateModels = [
      'gemini-2.5-flash',
      'gemini-1.5-flash',
      'gemini-2.0-flash'
    ];

    let lastErrorDetails = '';

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

      if (googleResponse.ok && !data.error) {
        return res.status(200).json(data);
      }

      if (data.error) {
        lastErrorDetails = data.error.message || JSON.stringify(data.error);
      }
    }

    return res.status(400).json({ 
      error: `فشل الاتصال بالنماذج. السبب: ${lastErrorDetails}` 
    });

  } catch (error) {
    console.error('Server Error:', error);
    return res.status(500).json({ error: 'حدث خطأ في معالجة الطلب داخل الخادم.' });
  }
}
