// Single place for PLPA branding and demo wording. Swap in the real logo/name here later.

export const BRAND = {
  name: "PLPA AI Assistant",
  nameUr: "پی ایل پی اے اے آئی اسسٹنٹ",
  description:
    "Offline AI assistant for Pakistan Land Port Authority employees",
};

export const WELCOME = {
  en: "How can I help you today?",
  ur: "میں آج آپ کی کیا مدد کر سکتا ہوں؟",
};

export const DISCLAIMER = {
  en: "AI can make mistakes. Please verify important information.",
  ur: "اے آئی سے غلطی ہو سکتی ہے۔ اہم معلومات کی تصدیق ضرور کریں۔",
};

// Screens that exist in the UI but are not ready for the demo.
export const FEATURES = {
  // Urdu text in the fixed UI (name, greeting, suggestions, disclaimer).
  // Chat answers in Urdu still work either way.
  urduInterface: false,
  // Projects are not part of the PLPA requirements.
  projects: false,
  // Settings / Language / Help / Log out do nothing yet. Turn on with login.
  userMenu: false,
};

// Shown in Knowledge Base mode. These match the SAMPLE documents (sample-docs/);
// replace them with questions about the real PLPA documents.
export const KB_SUGGESTIONS = [
  "What is the fee for a new CNIC under urgent service?",
  "How many days of annual leave does an employee get?",
  "What are the office timings on Saturday?",
  "How long does a complaint's Level 1 resolution take?",
];

// Office writing starting points (Templates button). The user fills the [brackets].
export const TEMPLATES = [
  {
    label: "Notice for all staff",
    prompt:
      "Draft a formal notice for all PLPA staff.\nSubject: [subject]\nDetails: [what, date, time, place]\nKeep it short and official, with [date] and [designation] at the end.",
  },
  {
    label: "Office order",
    prompt:
      "Draft an Office Order.\nSubject: [subject]\nOrder: [what is ordered and for whom]\nEffective from: [date]\nIssued by: [designation]\nUse a formal government style.",
  },
  {
    label: "Reply to a letter",
    prompt:
      "Write a polite, formal reply to the letter below. Say: [main points of the reply]\n\nLetter:\n[paste the letter here]",
  },
  {
    label: "Leave application",
    prompt:
      "Write a formal leave application.\nName and designation: [name, designation]\nLeave type: [casual / annual / sick]\nFrom [date] to [date]\nReason: [reason]\nAddressed to: [officer]",
  },
  {
    label: "Meeting minutes",
    prompt:
      "Write minutes of the meeting with action points (who, what, deadline) from these notes:\n[paste the notes here]",
  },
  {
    label: "Summary in 5 points",
    prompt: "Summarize the text below in 5 short bullet points:\n[paste the text here]",
  },
  {
    label: "Urdu notice (اردو نوٹس)",
    prompt:
      "تمام عملے کے لیے ایک رسمی نوٹس اردو میں لکھیں۔\nموضوع: [موضوع]\nتفصیل: [کیا، کب، کہاں]\nنوٹس مختصر اور سرکاری انداز میں ہو۔",
  },
];

// General-purpose prompts that work without documents.
const SUGGESTIONS_EN = [
  "Write minutes with action points from my meeting notes",
  "Draft a notice for all staff about an office closure",
  "Reply politely to a letter from a trader",
  "Make my draft more formal and fix the grammar",
];

const SUGGESTIONS_UR = [
  "چھٹی کی درخواست کا ایک رسمی خط لکھیں",
  "دفتر میں وقت کی پابندی کیوں ضروری ہے؟",
  "ایک اچھی میٹنگ کے لیے پانچ مفید نکات بتائیں",
];

export const SUGGESTIONS = FEATURES.urduInterface
  ? [...SUGGESTIONS_EN, ...SUGGESTIONS_UR]
  : SUGGESTIONS_EN;
