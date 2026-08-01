import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function getPayPalAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await fetch('https://api-m.sandbox.paypal.com/v1/oauth2/token', {
    method: 'POST',
    body: 'grant_type=client_credentials',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  const data = await response.json();
  return data.access_token;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { orderID, userId, creditsToAdd } = req.body;

    if (!orderID || !userId || !creditsToAdd) {
      return res.status(400).json({ error: 'بيانات الطلب غير مكتملة.' });
    }

    const accessToken = await getPayPalAccessToken();

    const captureResponse = await fetch(
      `https://api-m.sandbox.paypal.com/v2/checkout/orders/${orderID}/capture`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const captureData = await captureResponse.json();

    if (captureData.status === 'COMPLETED') {
      const { data: profile } = await supabase
        .from('profiles')
        .select('credits_left')
        .eq('id', userId)
        .single();

      const currentCredits = profile ? profile.credits_left : 0;

      await supabase
        .from('profiles')
        .update({ credits_left: currentCredits + Number(creditsToAdd) })
        .eq('id', userId);

      return res.status(200).json({ success: true, message: 'تم شحن الرصيد بنجاح!' });
    } else {
      return res.status(400).json({ error: 'فشلت عملية التحقق من دفع PayPal.' });
    }
  } catch (error) {
    console.error('PayPal Capture Error:', error);
    return res.status(500).json({ error: 'حدث خطأ أثناء تأكيد العملية.' });
  }
}
