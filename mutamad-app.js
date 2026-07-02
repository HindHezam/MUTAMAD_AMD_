/* =====================================================================
   مُعتمد | Mu'tamad — طبقة التطبيق المشتركة
   - بدون بيانات وهمية
   - ربط مباشر مع n8n Webhook
   - تنظيف أي بيانات ديمو قديمة إن وجدت
   ===================================================================== */

(function (global) {
  "use strict";

  const KEYS = {
    campaigns: "mutamad_campaigns",
    reports: "mutamad_reports",
    currentReport: "mutamad_current_report_id",
    currentReportObj: "mutamad_current_report",
    currentReview: "mutamad_current_review_id",
    currentCampaign: "mutamad_current_campaign_id",
    marketingEdit: "mutamad_current_marketing_edit_id",
    settings: "mutamad_settings",
    users: "mutamad_users",
    role: "mutamad_demo_role"
  };

  /* ---------------------- الإعدادات ---------------------- */
  const DEFAULT_SETTINGS = {
    ai_webhook_url: "https://hind7777.app.n8n.cloud/webhook/mutamad-analyze",
    webhookSecret: "MUTAMAD_AMD_2026",
    readiness_pass: 70,
    readiness_review: 50,
    sources: ["SAMA"]
  };

  function getSettings() {
    try {
      const raw = localStorage.getItem(KEYS.settings);
      const parsed = raw ? JSON.parse(raw) : {};
      const settings = Object.assign({}, DEFAULT_SETTINGS, parsed || {});

      if (!settings.ai_webhook_url && settings.webhookUrl) {
        settings.ai_webhook_url = settings.webhookUrl;
      }

      if (!settings.ai_webhook_url) {
        settings.ai_webhook_url = DEFAULT_SETTINGS.ai_webhook_url;
      }

      if (!settings.webhookSecret) {
        settings.webhookSecret = DEFAULT_SETTINGS.webhookSecret;
      }

      return settings;
    } catch (_) {
      return Object.assign({}, DEFAULT_SETTINGS);
    }
  }

  function saveSettings(patch) {
    const next = Object.assign(getSettings(), patch || {});
    localStorage.setItem(KEYS.settings, JSON.stringify(next));
    return next;
  }

  /* ---------------------- التخزين ---------------------- */
  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function getCampaigns() {
    return read(KEYS.campaigns, []);
  }

  function saveCampaigns(list) {
    write(KEYS.campaigns, Array.isArray(list) ? list : []);
  }

  function getReports() {
    return read(KEYS.reports, []);
  }

  function saveReports(list) {
    write(KEYS.reports, Array.isArray(list) ? list : []);
  }

  /* ---------------------- أدوات عامة ---------------------- */
  function uid(prefix) {
    const p = prefix || "ID";
    const n = Math.floor(1000 + Math.random() * 9000);
    return p + "-" + n;
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function shortDate(value) {
    if (!value) return "—";

    const d = new Date(value);

    if (isNaN(d.getTime())) return String(value);

    try {
      return d.toLocaleDateString("ar-SA") + " " +
        d.toLocaleTimeString("ar-SA", {
          hour: "2-digit",
          minute: "2-digit"
        });
    } catch (_) {
      return d.toISOString().slice(0, 16).replace("T", " ");
    }
  }

  /* ---------------------- الأدوار ---------------------- */
  const ROLE_LABELS = {
    marketing: "مسؤول التسويق",
    compliance: "مسؤول الامتثال",
    manager: "مدير النظام",
    admin: "مدير النظام"
  };

  function getRole() {
    return localStorage.getItem(KEYS.role) || "marketing";
  }

  function setRole(r) {
    localStorage.setItem(KEYS.role, r);
  }

  function logout() {
    localStorage.removeItem(KEYS.role);
    location.href = "login.html";
  }

  /* ---------------------- التسميات ---------------------- */
  function statusLabel(status) {
    const labels = {
      draft: "مسودة",
      checking: "قيد الفحص",
      pending_compliance: "بانتظار الامتثال",
      revision_draft: "مسودة تعديل",
      revision_checked: "تمت إعادة الفحص",
      needs_revision: "راجعة للتعديل",
      approved: "معتمدة",
      rejected: "غير معتمدة"
    };

    return labels[status] || "غير محدد";
  }

  function riskLabel(risk) {
    const labels = {
      low: "منخفض",
      medium: "متوسط",
      high: "عالي",
      unknown: "غير محدد",
      "": "غير محدد",
      "منخفض": "منخفض",
      "متوسط": "متوسط",
      "عالي": "عالي"
    };

    return labels[risk] || "غير محدد";
  }

  function statusClass(status) {
    if (status === "منخفض" || status === "approved") return "low";
    if (status === "يحتاج مراجعة" || status === "pending_compliance") return "medium";
    return "high";
  }

  function riskClass(risk) {
    if (risk === "منخفض" || risk === "low") return "low";
    if (risk === "متوسط" || risk === "medium") return "medium";
    if (risk === "عالي" || risk === "high") return "high";
    return "unknown";
  }

  function statusToRisk(status) {
    if (status === "منخفض") return "low";
    if (status === "يحتاج مراجعة") return "medium";
    if (status === "عالي المخاطر") return "high";
    if (["low", "medium", "high"].includes(status)) return status;
    return "unknown";
  }

  /* ---------------------- سجل الإجراءات ---------------------- */
  function pushTimeline(campaign, action) {
    if (!campaign) return;

    if (!Array.isArray(campaign.timeline)) {
      campaign.timeline = [];
    }

    campaign.timeline.push({
      action: action,
      at: shortDate(nowISO())
    });
  }

  /* ---------------------- الإحصاءات ---------------------- */
  function collectStats(campaigns) {
    const list = Array.isArray(campaigns) ? campaigns : getCampaigns();
    const total = list.length;

    const by = function (fn) {
      return list.filter(fn).length;
    };

    const pending = by(c => c.status === "pending_compliance" || c.status === "checking");
    const revision = by(c => c.status === "needs_revision" || c.status === "revision_draft" || c.status === "revision_checked");
    const approved = by(c => c.status === "approved");
    const rejected = by(c => c.status === "rejected");
    const draft = by(c => c.status === "draft");

    const highRisk = by(c => riskClass(c.risk_level) === "high");
    const mediumRisk = by(c => riskClass(c.risk_level) === "medium");
    const lowRisk = by(c => riskClass(c.risk_level) === "low");

    const decided = approved + revision + rejected;
    const readinessSum = list.reduce((s, c) => s + Number(c.readiness_score || 0), 0);
    const averageReadiness = total ? Math.round(readinessSum / total) : 0;

    const pct = function (part, base) {
      return base ? Math.round((part / base) * 100) : 0;
    };

    return {
      total,
      pending,
      revision,
      approved,
      rejected,
      draft,
      highRisk,
      mediumRisk,
      lowRisk,
      decided,
      averageReadiness,
      approval_rate: pct(approved, decided),
      revision_rate: pct(revision, decided),
      risk_rate: pct(highRisk, total),
      pending_rate: pct(pending, total)
    };
  }

  /* ---------------------- التقارير ---------------------- */
  function buildGeneralReport(opts) {
    opts = opts || {};

    const campaigns = getCampaigns();
    const s = collectStats(campaigns);

    const summaryText =
      `يشمل التقرير ${s.total} حملة ضمن مسار الاعتماد، منها ${s.approved} حملة معتمدة، ` +
      `و${s.pending} بانتظار مراجعة الامتثال، و${s.revision} أُعيدت للتعديل، ` +
      `و${s.rejected} غير معتمدة. بلغ متوسط درجة الجاهزية ${s.averageReadiness}%، ` +
      `ونسبة الحملات عالية المخاطر ${s.risk_rate}%.`;

    let recommendation;

    if (s.highRisk > 0) {
      recommendation =
        `يوصى بمعالجة الحملات عالية المخاطر (${s.highRisk}) قبل النشر، ` +
        `ومراجعة متطلبات الإفصاح في الحملات بانتظار الامتثال (${s.pending}).`;
    } else if (s.pending > 0) {
      recommendation =
        `لا توجد حملات عالية المخاطر حاليًا. يوصى بإكمال مراجعة الحملات المعلّقة (${s.pending}) ` +
        `للحفاظ على انسياب مسار الاعتماد.`;
    } else {
      recommendation =
        `مؤشرات المنصة ضمن النطاق المقبول. يوصى بالاستمرار في توثيق القرارات ` +
        `وإصدار التقارير الدورية لدعم الحوكمة.`;
    }

    return {
      id: uid("REP"),
      type: "general",
      title: (opts.title && opts.title.trim()) || "التقرير التنفيذي العام — منصة مُعتمد",
      scope: "تقرير تنفيذي عام يوثّق حالة الحملات داخل مسار الاعتماد",
      created_at: shortDate(nowISO()),
      created_iso: nowISO(),
      stamp: "مُعتمد",
      stamp_text: "وثيقة تنفيذية موثّقة صادرة عن منصة مُعتمد لحوكمة الامتثال",
      status: "موثّق",
      summary_title: "ملخص حالة الامتثال على مستوى المنصة",
      summary_text: summaryText,
      summary: summaryText,
      recommendation: recommendation,
      manager_notes: (opts.manager_note && opts.manager_note.trim()) || "",
      counts: {
        total: s.total,
        pending: s.pending,
        revision: s.revision,
        approved: s.approved,
        rejected: s.rejected,
        highRisk: s.highRisk
      },
      average_readiness: s.averageReadiness,
      risk_rate: s.risk_rate,
      approval_rate: s.approval_rate,
      revision_rate: s.revision_rate
    };
  }

  function buildCampaignReport(campaign, opts) {
    opts = opts || {};

    if (!campaign) return null;

    const risk = riskClass(campaign.risk_level);
    const readiness = Number(campaign.readiness_score || 0);
    const findingsCount = (campaign.findings || []).length;

    const summaryText = campaign.analysis_summary ||
      `حملة "${campaign.title || campaign.id}" بلغت درجة جاهزية ${readiness}% ` +
      `بمستوى مخاطر ${riskLabel(campaign.risk_level)} وعدد ملاحظات ${findingsCount}.`;

    const recommendation = (campaign.recommendations && campaign.recommendations.length)
      ? campaign.recommendations.join(" • ")
      : "استوفت الحملة متطلبات الامتثال، ويوصى باعتمادها ومتابعة الأداء بعد النشر.";

    const counts = {
      total: 1,
      pending: campaign.status === "pending_compliance" ? 1 : 0,
      revision: campaign.status === "needs_revision" ? 1 : 0,
      approved: campaign.status === "approved" ? 1 : 0,
      rejected: campaign.status === "rejected" ? 1 : 0,
      highRisk: risk === "high" ? 1 : 0
    };

    return {
      id: uid("REP"),
      type: "campaign",
      campaign_id: campaign.id,
      campaign_snapshot: campaign,
      title: "تقرير اعتماد الحملة — " + (campaign.title || campaign.id),
      scope: `${campaign.product_type_label || "منتج مالي"} · ${campaign.channel || "قناة غير محددة"}`,
      created_at: shortDate(nowISO()),
      created_iso: nowISO(),
      stamp: "مُعتمد",
      stamp_text: "تم التحقق من امتثال الحملة للضوابط التنظيمية واعتمادها قبل النشر",
      status: "معتمد",
      summary_title: "ملخص نتيجة فحص الامتثال للحملة",
      summary_text: summaryText,
      summary: summaryText,
      recommendation: recommendation,
      manager_notes: (opts.manager_note && opts.manager_note.trim()) || "",
      readiness_score: readiness,
      risk_level: campaign.risk_level || "unknown",
      findings: campaign.findings || [],
      recommendations: campaign.recommendations || [],
      suggested_rewrite: campaign.suggested_rewrite || "",
      counts: counts,
      average_readiness: readiness,
      risk_rate: risk === "high" ? 100 : 0,
      approval_rate: campaign.status === "approved" ? 100 : 0,
      revision_rate: campaign.status === "needs_revision" ? 100 : 0
    };
  }

  function commitReport(report) {
    if (!report) return null;

    const reports = getReports();
    reports.unshift(report);
    saveReports(reports);
    setCurrentReport(report.id);

    return report;
  }

  function setCurrentReport(id) {
    localStorage.setItem(KEYS.currentReport, id);

    const r = getReports().find(x => x.id === id);

    if (r) {
      localStorage.setItem(KEYS.currentReportObj, JSON.stringify(r));
    }
  }

  function getCurrentReport() {
    const id = localStorage.getItem(KEYS.currentReport);
    const reports = getReports();

    if (id) {
      const found = reports.find(r => r.id === id);
      if (found) return found;
    }

    const obj = localStorage.getItem(KEYS.currentReportObj);

    if (obj) {
      try {
        return JSON.parse(obj);
      } catch (_) {}
    }

    return reports[0] || null;
  }

  function deleteReport(id) {
    const reports = getReports().filter(r => r.id !== id);
    saveReports(reports);

    if (localStorage.getItem(KEYS.currentReport) === id) {
      localStorage.removeItem(KEYS.currentReport);
      localStorage.removeItem(KEYS.currentReportObj);
    }

    return reports;
  }

  /* ---------------------- قواعد الفحص المحلي الاحتياطي ----------------------
     هذه ليست بيانات وهمية. هذه قواعد احتياطية فقط في حال تعطل n8n.
  --------------------------------------------------------------------- */
  const RULES = [
    {
      id: "SAMA_ADV_001",
      type: "guaranteed_approval",
      risk: "عالي",
      impact: 30,
      patterns: [
        "موافقة مضمونة",
        "قبول مضمون",
        "مضمون",
        "للجميع",
        "موافقة فورية للجميع",
        "100% موافقة",
        "بدون رفض"
      ],
      category: "وعد_مطلق",
      reason: "العبارة توحي بأن الموافقة مؤكدة رغم خضوعها للأهلية والتقييم الائتماني.",
      reference: "قواعد الإعلان عن المنتجات والخدمات المالية — مبدأ عدم التضليل (SAMA).",
      fix: "حسب أهليتك والشروط المعتمدة"
    },
    {
      id: "SAMA_ADV_014",
      type: "no_fees_claim",
      risk: "عالي",
      impact: 22,
      patterns: [
        "بدون رسوم",
        "بلا رسوم",
        "بدون أي رسوم",
        "مجاناً",
        "مجانا",
        "بدون فوائد"
      ],
      category: "ادعاء_رسوم",
      reason: "ادعاء انعدام الرسوم قد يكون مضللاً إذا وُجدت رسوم أو شروط غير موضحة.",
      reference: "مبدأ الإفصاح والشفافية — وضوح الرسوم والتكاليف (SAMA).",
      fix: "اطّلع على الرسوم والشروط قبل الموافقة النهائية"
    },
    {
      id: "SAMA_101",
      type: "missing_apr_disclosure",
      risk: "عالي",
      impact: 25,
      patterns: [],
      category: "إفصاح_ناقص",
      reason: "إعلان منتج تمويلي دون ذكر معدل النسبة السنوية APR يخالف متطلبات الإفصاح.",
      reference: "المادة 17 — الإعلان عن منتجات التمويل الاستهلاكي (SAMA).",
      fix: "أضف معدل النسبة السنوية APR أو رابط تفاصيل التكلفة"
    },
    {
      id: "SAMA_ADV_022",
      type: "time_promise",
      risk: "متوسط",
      impact: 12,
      patterns: [
        "فوري",
        "خلال دقيقة",
        "خلال دقائق",
        "في الحال",
        "لحظي",
        "تمويل فوري"
      ],
      category: "سرعة",
      reason: "وعد بالسرعة قد لا يكون دقيقاً إذا كانت الخدمة تتطلب تحققاً أو تقييماً.",
      reference: "قواعد الإعلان المالي — عدم تضمين ادعاءات مضللة (SAMA).",
      fix: "قدّم طلبك خلال دقائق دون الوعد بالموافقة"
    },
    {
      id: "SAMA_ADV_031",
      type: "missing_terms",
      risk: "متوسط",
      impact: 10,
      patterns: [],
      category: "إفصاح_ناقص",
      reason: "عرض مالي دون الإشارة إلى الشروط والأحكام قد يخلق توقعاً غير دقيق.",
      reference: "مبدأ الإفصاح والشفافية (SAMA).",
      fix: "أضف عبارة \"تطبق الشروط والأحكام\" مع رابط واضح"
    },
    {
      id: "SAMA_PAY_068",
      type: "unclear_payment_ad",
      risk: "متوسط",
      impact: 12,
      patterns: [
        "محفظة",
        "خدمة دفع",
        "دفع إلكتروني"
      ],
      category: "إفصاح_ناقص",
      reason: "مادة إعلانية لخدمة دفع دون وضوح اسم مقدم الخدمة أو ترخيصه.",
      reference: "المادة 68 — مواد الإعلان والتسويق لخدمات الدفع (SAMA).",
      fix: "أضف اسم مقدم الخدمة المرخّص ووضّح الشروط"
    }
  ];

  function localAnalyze(input) {
    const text = (input.content_text || "").trim();
    const product = input.product_type || "";
    const findings = [];
    const recommendations = [];

    RULES.forEach(rule => {
      const matched = rule.patterns.find(p => text.includes(p));

      if (matched) {
        findings.push({
          claim_text: matched,
          category: rule.category,
          risk_level: rule.risk,
          violation_id: rule.id,
          violation_type: rule.type,
          rule_reference: rule.reference,
          rule_source: "SAMA",
          score_impact: rule.impact,
          confidence: "مؤكد",
          reason: rule.reason
        });

        recommendations.push(rule.fix);
      }
    });

    const isFinancing =
      ["personal_finance", "credit_card", "bnpl", "installment"].includes(product) ||
      /تمويل|بطاقة|تقسيط/.test(text);

    const mentionsApr = /apr|نسبة سنوية|النسبة السنوية|معدل النسبة/i.test(text);

    if (isFinancing && !mentionsApr) {
      const r = RULES.find(x => x.id === "SAMA_101");

      findings.push({
        claim_text: "غياب معدل النسبة السنوية APR",
        category: "إفصاح_ناقص",
        risk_level: "عالي",
        violation_id: r.id,
        violation_type: r.type,
        rule_reference: r.reference,
        rule_source: "SAMA",
        score_impact: r.impact,
        confidence: "مؤكد",
        reason: r.reason
      });

      recommendations.push(r.fix);
    }

    const mentionsTerms = /شروط|الأحكام|تطبق الشروط/.test(text);

    if (!mentionsTerms && text.length > 0) {
      const r = RULES.find(x => x.id === "SAMA_ADV_031");

      findings.push({
        claim_text: "غياب الإشارة للشروط والأحكام",
        category: "إفصاح_ناقص",
        risk_level: "متوسط",
        violation_id: r.id,
        violation_type: r.type,
        rule_reference: r.reference,
        rule_source: "SAMA",
        score_impact: r.impact,
        confidence: "محتمل",
        reason: r.reason
      });

      recommendations.push(r.fix);
    }

    const seen = new Set();
    const deduped = [];

    findings.forEach(f => {
      const key = (f.violation_id || "").trim() + "|" + (f.claim_text || "").trim();

      if (seen.has(key)) return;

      seen.add(key);
      deduped.push(f);
    });

    const totalImpact = deduped.reduce((s, f) => s + (Number(f.score_impact) || 0), 0);
    const score = Math.max(0, Math.min(100, 100 - totalImpact));

    let status;

    if (deduped.length === 0) {
      status = "منخفض";
    } else if (score >= 70) {
      status = "يحتاج مراجعة";
    } else {
      status = "عالي المخاطر";
    }

    const rewrite = buildRewrite(text, deduped);

    const summary = deduped.length
      ? `تم رصد ${deduped.length} ملاحظة تنظيمية؛ أبرزها ${deduped[0].claim_text}. درجة الجاهزية ${score}%.`
      : `لم تُرصد مخالفات واضحة. المحتوى مهيأ للمراجعة النهائية بدرجة جاهزية ${score}%.`;

    return {
      readiness_score: score,
      status: status,
      risk_level: statusToRisk(status),
      status_label: status,
      violations_count: deduped.length,
      summary: summary,
      findings: deduped,
      recommendations: Array.from(new Set(recommendations)),
      suggested_rewrite: rewrite,
      total_score_impact: totalImpact,
      engine: "local"
    };
  }

  function buildRewrite(text, findings) {
    if (!text) return "";

    let out = text;

    findings.forEach(f => {
      const rule = RULES.find(r => r.id === f.violation_id);

      if (rule && rule.patterns.length) {
        if (out.includes(f.claim_text)) {
          out = out.replace(f.claim_text, rule.fix);
        }

        rule.patterns.forEach(p => {
          if (p !== f.claim_text && out.includes(p)) {
            out = out.replace(p, "");
          }
        });
      }
    });

    out = out
      .replace(/\s{2,}/g, " ")
      .replace(/\s+([،.])/g, "$1")
      .trim();

    if (!/شروط|الأحكام/.test(out)) {
      out += " — تطبق الشروط والأحكام.";
    }

    if (/تمويل|بطاقة|تقسيط/.test(text) && !/apr|النسبة السنوية/i.test(out)) {
      out += " معدل النسبة السنوية (APR) موضّح في تفاصيل المنتج.";
    }

    return out.trim();
  }

  /* ---------------------- الربط مع n8n ---------------------- */
  async function analyze(input) {
    const s = getSettings();

    if (s.ai_webhook_url) {
      const res = await fetch(s.ai_webhook_url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ad_text: input.content_text || "",
          content_text: input.content_text || "",
          product_type: input.product_type || "",
          channel: input.channel || "",
          image_url: input.image_url || "",
          internal_key: s.webhookSecret || "MUTAMAD_AMD_2026"
        })
      });

      if (!res.ok) {
        throw new Error("AI webhook returned " + res.status);
      }

      const data = await res.json();
      const out = data.final_output || data;

      if (!out || (out.readiness_score == null && !out.findings)) {
        throw new Error("AI webhook response did not match the expected contract");
      }

      out.engine = "n8n";
      out.status = out.status || "";
      out.status_label = out.status_label || out.status;
      out.risk_level = statusToRisk(out.risk_level || out.status);

      out.violations_count = out.violations_count != null
        ? out.violations_count
        : (out.findings ? out.findings.length : 0);

      if (data.report && data.report.report_html) {
        out.report_html = data.report.report_html;
        out.report_filename = data.report.report_filename || "mutamad-report.html";
      }

      return out;
    }

    await new Promise(r => setTimeout(r, 450));
    return localAnalyze(input);
  }

  /* ---------------------- أدوات العرض ---------------------- */
  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ---------------------- منع البيانات الوهمية ---------------------- */
  function seedDemoData(force) {
    return;
  }

  function removeDemoDataOnce() {
    try {
      const demoIds = new Set([
        "CMP-2041",
        "CMP-2040",
        "CMP-2039",
        "CMP-2038",
        "CMP-2037"
      ]);

      const campaigns = getCampaigns();
      const cleanedCampaigns = campaigns.filter(c => !demoIds.has(c.id));

      if (cleanedCampaigns.length !== campaigns.length) {
        saveCampaigns(cleanedCampaigns);
      }

      const reports = getReports();
      const cleanedReports = reports.filter(r => {
        if (r && r.campaign_id && demoIds.has(r.campaign_id)) return false;
        if (r && r.campaign_snapshot && demoIds.has(r.campaign_snapshot.id)) return false;
        return true;
      });

      if (cleanedReports.length !== reports.length) {
        saveReports(cleanedReports);
      }
    } catch (e) {
      console.warn("demo cleanup skipped", e);
    }
  }

  function ensureSeed() {
    removeDemoDataOnce();
  }

  /* ---------------------- التصدير العام ---------------------- */
  global.Mutamad = {
    KEYS,
    ROLE_LABELS,
    RULES,
    getSettings,
    saveSettings,
    read,
    write,
    getCampaigns,
    saveCampaigns,
    getReports,
    saveReports,
    uid,
    nowISO,
    shortDate,
    getRole,
    setRole,
    logout,
    statusLabel,
    riskLabel,
    statusClass,
    riskClass,
    pushTimeline,
    collectStats,
    buildGeneralReport,
    buildCampaignReport,
    commitReport,
    setCurrentReport,
    getCurrentReport,
    deleteReport,
    analyze,
    localAnalyze,
    statusToRisk,
    escapeHtml,
    seedDemoData,
    ensureSeed
  };

  ensureSeed();
})(window);