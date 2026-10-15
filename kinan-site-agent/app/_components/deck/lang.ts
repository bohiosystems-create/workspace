"use client";
// The player's own words in the brief's language. The player shows the deck in its language (EN or AR), whatever
// the app is set to; Arabic strings are the marketing agent's (lib/i18n-ui.ts), so both apps read the same.
let current: "en" | "ar" = "en";
/** Set by the player wrapper before it renders a deck. */
export function setDeckLang(l: "en" | "ar") { current = l; }
const AR_UI: Record<string, string> = {
  "vs": "مقابل",
  "Actual": "الفعلي",
  "Latest month": "آخر شهر",
  "Target": "المستهدف",
  "Of target": "من المستهدف",
  "of the 2023–2025 average": "من متوسط 2023–2025",
  "best": "الأفضل",
  "findings": "ملاحظات",
  "Answers": "يستجيب لـ",
  "Contracts (range)": "العقود (نطاق)",
  "Sales (range)": "المبيعات (نطاق)",
  "Cost to sales": "التكلفة إلى المبيعات",
  "Spend": "الإنفاق",
  "min": "دقيقة",
  "your time this week": "وقتك هذا الأسبوع",
  "The microphone is not available — allow it in the browser, or type the question.": "الميكروفون غير متاح — اسمحوا به في المتصفح، أو اكتبوا السؤال.",
  "I didn't catch that — try again, or type the question.": "لم ألتقط ذلك — حاولوا مجدداً، أو اكتبوا السؤال.",
  "Close": "إغلاق",
  "Back": "السابق",
  "Next": "التالي",
  "Question": "سؤال",
  "Any other question? Type it or tap the microphone.": "سؤال آخر؟ اكتبوه أو اضغطوا على الميكروفون.",
  "Any question? Type it or tap the microphone.": "سؤال؟ اكتبوه أو اضغطوا على الميكروفون.",
  "Carrying on in": "نتابع بعد",
  "s": "ث",
  "or press Next.": "أو اضغطوا التالي.",
  "Paused for your question — send it, or press ▶ / Next to carry on.": "متوقف لسؤالكم — أرسلوه، أو اضغطوا ▶ / التالي للمتابعة.",
  "Time for questions after each slide": "وقت للأسئلة بعد كل شريحة",
  "Hold": "انتظار",
  "No pause": "بلا توقف",
  "Paused for your question — send it, or close the box to carry on.": "متوقف لسؤالكم — أرسلوه، أو أغلقوا المربع للمتابعة.",
  "thinking…": "أفكّر…",
  "Stop and send": "إيقاف وإرسال",
  "Ask by voice": "اسألوا بالصوت",
  "Listening… tap ■ when you have finished": "أستمع… اضغطوا ■ عند الانتهاء",
  "Writing it down…": "أدوّنه…",
  "Ask the presenter a question, or tap the microphone…": "اسألوا المقدّم سؤالاً، أو اضغطوا على الميكروفون…",
  "Ask the presenter a question…": "اسألوا المقدّم سؤالاً…",
  "Ask": "اسأل",
  "Pause": "إيقاف",
  "Play": "تشغيل",
  "Voice on": "الصوت مفعّل",
  "Voice off": "الصوت متوقف",
  "The PowerPoint file could not be created.": "تعذّر إنشاء ملف PowerPoint.",
  "Download as PowerPoint": "تنزيل كملف PowerPoint",
  "Preparing…": "جارٍ التحضير…",
  "PowerPoint": "PowerPoint",
};
export function useI18n() {
  const lang = current;
  return { lang, t: (s: string) => (lang === "ar" ? AR_UI[s] ?? s : s) };
}
