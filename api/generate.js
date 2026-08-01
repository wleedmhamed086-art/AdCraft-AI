export default async function handler(req, res) {
  // قبول طلبات POST فقط
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // قراءة المفتاح المحمي من متغيرات البيئة في Vercel
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'لم يتم ضبط مفتاح GEMINI_API_KEY في السيرفر.' });
  }

  try {
    const { promptText, imageData } = req.body;
    const model = 'gemini-1.5-flash'; // النموذج المستقر

    const parts = [{ text: promptText }];
    if (imageData) {
      parts.push({ inlineData: imageData });
    }

    // إرسال الطلب إلى خوادم جوجل من السيرفر مباشرة
    const googleResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts }] }),
      }
    );

    const data = await googleResponse.json();
    return res.status(googleResponse.status).json(data);

  } catch (error) {
    console.error('Server Function Error:', error);
    return res.status(500).json({ error: 'حدث خطأ في الخادم الداخلي.' });
  }
}
