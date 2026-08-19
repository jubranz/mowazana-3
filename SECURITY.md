# سياسة الأمان المختصرة

- لا تُرسل بيانات اعتماد WordPress أو n8n إلى المتصفح.
- لا تقبل واجهات `/api/me/*` معرّف مستخدم من العميل؛ يُشتق العضو من الجلسة الموقعة فقط.
- PIN محفوظ كـWordPress password hash، مع قفل 15 دقيقة بعد خمس محاولات فاشلة.
- جلسة العضو `HttpOnly` و`SameSite=Strict` ومدتها 30 يومًا.
- الردود المالية تحمل `Cache-Control: private, no-store`، وService Worker لا يخزن الصفحات أو استجابات API.
- حساب WordPress الخدمي يجب ألا يكون Administrator؛ استخدم دور `Muwazana API Service`.
- دوّر أي مفتاح ظهر سابقًا في ملف أو سجل، حتى لو أُزيل لاحقًا.
- لا تسجل PIN أو Application Password أو أجسام الطلبات المالية في سجلات الخادم.
