import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

// 1. تهيئة Supabase مع المفتاح السري (Service Role) للتحكم بأمان بالرصيد
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// 2. تهيئة Google Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export default async function handler(req, res) {
  // قبول طلبات POST فقط
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'طريقة الطلب غير مسموح بها (Method Not Allowed).' });
  }

  try {
    const { promptText, imageData, userId } = req.body;

    if (!userId || !promptText) {
      return res.status(400).json({ error: 'بيانات الطلب غير مكتملة.' });
    }

    // الخطوة أ: التحقق من رصيد المستخدم الحالي في Supabase
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('credits_left')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ error: 'لم يتم العثور على حساب المستخدم.' });
    }

    if (profile.credits_left < 1) {
      return res.status(403).json({ error: 'عذراً، لقد نفد رصيدك! يرجى التواصل لإعادة الشحن.' });
    }

    // الخطوة ب: إعداد نموذج Gemini
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    let contents = [promptText];

    // إضافة الصورة إن وجدت
    if (imageData && imageData.data && imageData.mimeType) {
      contents.push({
        inlineData: {
          data: imageData.data,
          mimeType: imageData.mimeType,
        },
      });
    }

    // الخطوة ج: توليد الإعلان عبر الذكاء الاصطناعي
    const result = await model.generateContent(contents);
    const generatedText = result.response.text();

    // الخطوة د: خصم نقطة واحدة من رصيد المستخدم
    await supabase
      .from('profiles')
      .update({ credits_left: profile.credits_left - 1 })
      .eq('id', userId);

    // إرجاع النتيجة بنجاح للـ Frontend
    return res.status(200).json({ text: generatedText });

  } catch (error) {
    console.error('Server API Error:', error);
    return res.status(500).json({ error: 'حدث خطأ داخلي في الخادم أثناء توليد النص.' });
  }
}
