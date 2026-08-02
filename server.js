require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenAI } = require('@google/genai');

const app = express();

// -------------------------------------------------------------
// 1. الإعدادات والوسائط (Middlewares)
// -------------------------------------------------------------
app.use(cors());
app.use(express.json());

// التحقق من وجود جميع متغيرات البيئة المطلوبة
const requiredEnv = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'GEMINI_API_KEY'];
for (const envVar of requiredEnv) {
  if (!process.env[envVar]) {
    console.error(`❌ خطأ: متغير البيئة ${envVar} مفقود!`);
    process.exit(1);
  }
}

// تهيئة عميل Supabase الإداري
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// تهيئة مكتبة Gemini AI
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// -------------------------------------------------------------
// 2. الوسيط المخصص للتحقق من هوية المستخدم (Auth Middleware)
// -------------------------------------------------------------
async function authenticateUser(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      success: false, 
      error: 'غير مصرح: يلزم إرسال توكن الوصول (Authorization Token)' 
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    // التحقق من صحة توكن المستخدم عبر Supabase Auth
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ 
        success: false, 
        error: 'جلسة تسجيل الدخول غير صالحة أو منتهية' 
      });
    }

    // إرفاق كائن المستخدم في الطلب لاستخدامه في المسارات التالية
    req.user = user;
    next();
  } catch (err) {
    console.error('خطأ في التحقق من التوكن:', err.message);
    return res.status(500).json({ success: false, error: 'حدث خطأ في السيرفر أثناء التحقق من الهوية' });
  }
}

// -------------------------------------------------------------
// 3. مسار اختبار عمل الخادم (Health Check)
// -------------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// -------------------------------------------------------------
// 4. مسار توليد النصوص الإعلانية (Protected Route)
// -------------------------------------------------------------
app.post('/api/generate', authenticateUser, async (req, res) => {
  const { productName, productDesc, tone, platform } = req.body;
  const userId = req.user.id;

  // التحقق من إدخالات المستخدم الأساسية
  if (!productName || !productDesc) {
    return res.status(400).json({ 
      success: false, 
      error: 'اسم المنتج والتفاصيل حقول إجبارية' 
    });
  }

  try {
    // أ) خصم نقطة واحدة عبر الدالة الذرية في Supabase (RPC)
    const { data: isDeducted, error: rpcError } = await supabaseAdmin.rpc('deduct_credit', {
      user_id: userId
    });

    if (rpcError) {
      console.error('RPC Error:', rpcError.message);
      return res.status(500).json({ success: false, error: 'خطأ في معالجة رصيد النقاط' });
    }

    if (!isDeducted) {
      return res.status(400).json({ 
        success: false, 
        error: 'رصيدك الحالي غير كافٍ لتوليد الإعلان. يرجى شحن النقاط.' 
      });
    }

    // ب) تجهيز Prompt الاستدعاء لنموذج Gemini AI
    const prompt = `أنت خبير تسويق وكتابة إعلانات احترافي. اكتب نصاً إعلانياً مخصصاً للمواصفات التالية:
- المنتج/الخدمة: ${productName}
- التفاصيل والمميزات: ${productDesc}
- نغمة الخطاب: ${tone || 'جذابة وحماسية'}
- المنصة الإعلانية: ${platform || 'Facebook'}

المطلوب:
1. عنوان رئيسي يخطف الانتباه.
2. نص إعلاني قوي يركز على الفوائد والحلول.
3. دعوة واضحة لاتخاذ إجراء (Call to Action).`;

    // جـ) استدعاء موديل Gemini
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const generatedAdText = response.text;

    // د) جلب الرصيد المتبقي لتحديث الواجهة
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('credits_left')
      .eq('id', userId)
      .single();

    return res.json({ 
      success: true, 
      result: generatedAdText, 
      creditsLeft: profile ? profile.credits_left : 0 
    });

  } catch (err) {
    console.error('⚠️ خطأ أثناء التوليد:', err);

    // هـ) إعادة النقطة المخصومة تلقائياً للمستخدم عند وجود خلل في التوليد
    await supabaseAdmin.rpc('add_credits', { 
      user_id: userId, 
      amount: 1 
    });

    return res.status(500).json({ 
      success: false, 
      error: 'فشل التوليد بواسطة الذكاء الاصطناعي، تم استرجاع النقطة لرصيدك.' 
    });
  }
});

// -------------------------------------------------------------
// 5. مسار شحن النقاط (PayPal Capture)
// -------------------------------------------------------------
app.post('/api/paypal-capture', authenticateUser, async (req, res) => {
  const { orderID, creditsToAdd } = req.body;
  const userId = req.user.id;

  if (!orderID || !creditsToAdd || parseInt(creditsToAdd, 10) <= 0) {
    return res.status(400).json({ success: false, error: 'بيانات العملية غير صحيحة' });
  }

  try {
    // إدخال النقاط عبر RPC
    await supabaseAdmin.rpc('add_credits', { 
      user_id: userId, 
      amount: parseInt(creditsToAdd, 10) 
    });

    // جلب الرصيد الجديد
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('credits_left')
      .eq('id', userId)
      .single();

    return res.json({ 
      success: true, 
      newCredits: profile ? profile.credits_left : 0 
    });

  } catch (err) {
    console.error('خطأ الدفع:', err);
    return res.status(500).json({ success: false, error: 'حدث خطأ أثناء تحديث الرصيد' });
  }
});

// -------------------------------------------------------------
// 6. تشغيل السيرفر
// -------------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 السيرفر يعمل بنجاح على المنفذ: http://localhost:${PORT}`);
});
