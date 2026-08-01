export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ 
      error: 'لم يتم العثور على مفتاح GEMINI_API_KEY في Vercel. يرجى إضافته في Environment Variables.' 
    });
  }

  try {
    const { promptText, imageData } = req.body;

    if (!promptText) {
      return res.status(400).json({ error: 'يرجى تزويد تفاصيل الإعلان.' });
    }

    const parts = [{ text: promptText }];
    if (imageData && imageData.data) {
      parts.push({
        inlineData: {
          mimeType: imageData.mimeType || 'image/jpeg',
          data: imageData.data
        }
      });
    }

    // قائمة نماذج Gemini مرتبة حسب الأفضلية والأحدث
    const candidateModels = [
      'gemini-2.0-flash',
      'gemini-1.5-flash',
      'gemini-1.5-pro',
      'gemini-1.5-flash-latest'
    ];

    let lastError = null;

    // الدوران الذكي لاستخدام أول نموذج متاح ومجاني
    for (const model of candidateModels) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts }] }),
          }
        );

        const data = await response.json();

        if (response.ok && data.candidates && data.candidates[0]?.content) {
          return res.status(200).json(data);
        }

        if (data.error) {
          lastError = data.error.message || JSON.stringify(data.error);
        }
      } catch (err) {
        lastError = err.message;
      }
    }

    return res.status(400).json({ 
      error: `تعذر الاتصال بالنماذج. التفاصيل: ${lastError}` 
    });

  } catch (error) {
    console.error('SaaS Backend Error:', error);
    return res.status(500).json({ error: 'حدث خطأ غير متوقع داخل السيرفر.' });
  }
}
