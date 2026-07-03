# دمج جزء الذكاء الاصطناعي (Multi-Agent) في منصة مُعتمد

المنصة مبنية لتستهلك مخرجات سير العمل الحقيقي في n8n (وكلاء أربعة) كما هو في الملف
`assets/mutamad-n8n-workflow.json`، وليست محاكاة. عند ضبط رابط الـ Webhook تتحول
عملية الفحص بالكامل إلى الوكلاء الحقيقيين.

## تدفق الوكلاء (كما في الملف)
1. Webhook Trigger — المسار: `mutamad-analyze` (POST).
2. Input Parser — يلتقط `ad_text` / `image_url`.
3. Agent 1 (استخراج المحتوى) — يستخرج `detected_claims` و`extracted_figures` و`disclosures_present`.
4. Fetch SAMA Rules (Supabase: جدول `critical_regulations`) + Prepare Rules Context.
5. Agent 2 (الامتثال ومطابقة القواعد) — مطابقة نصية وكمّية وإنتاج `findings`.
6. Prepare Rewrite Context — إزالة المخالفات المكررة (حتمي).
7. Agent 3 (الصياغة البديلة) — `suggested_rewrite` + `changes_explained`.
8. Prepare Report Context — حساب حتمي للدرجة والحالة.
9. Agent 4 (الدرجة والتقرير) — `readiness_score`, `status`, `findings`, `recommendations`.
10. Build Report HTML + Generate Report File + Shape Final Output + Respond to Webhook.

## عقد الاستجابة الذي تستهلكه المنصة
```json
{
  "final_output": {
    "readiness_score": 0,
    "status": "منخفض | يحتاج مراجعة | عالي المخاطر",
    "violations_count": 0,
    "summary": "...",
    "findings": [{ "claim_text": "...", "risk_level": "عالي|متوسط|منخفض",
                   "violation_id": "...", "rule_reference": "...",
                   "rule_source": "SAMA", "score_impact": 0, "confidence": "..." }],
    "recommendations": ["..."],
    "suggested_rewrite": "..."
  },
  "report": { "report_html": "<!doctype html>...", "report_filename": "mutamad-report.html" }
}
```
المنصة تطابق هذا العقد حرفياً، وتطبّق نفس منطق الحساب الحتمي (الدرجة = 100 − مجموع
score_impact، والحالة حسب العتبات) في محرّكها المحلي حتى تكون النتائج متطابقة.

## ما يلزم لتشغيل الوكلاء فعلياً
1. استيراد `assets/mutamad-n8n-workflow.json` في n8n وتفعيله.
2. اعتماد OpenAI + قاعدة Supabase تحتوي جدول `critical_regulations` (قواعد SAMA).
3. نسخ رابط الـ Webhook ولصقه في: الإعدادات ← «n8n Webhook URL» ثم «حفظ الربط»،
   ويمكن التحقق عبر زر «اختبار الاتصال».
4. تفعيل CORS على n8n (أو تمرير الطلب عبر وكيل/Backend) لأن الاستدعاء من المتصفح.

> القيد الوحيد: تشغيل الوكلاء فعلياً يتطلب خادم n8n + مفتاح OpenAI + Supabase
> (لا يمكن لموقع HTML ثابت أن ينفّذ نماذج الذكاء الاصطناعي بنفسه)؛ لذلك يُربط عبر الـ Webhook.
