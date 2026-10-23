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
  // Projects are not part of the PLPA requirements.
  projects: false,
  // Settings / Language / Help / Log out do nothing yet. Turn on with login.
  userMenu: false,
};

// General-purpose prompts that work without documents. Document questions
// (fees, leave policy, ...) are added once the Knowledge Base mode exists.
export const SUGGESTIONS = [
  "Draft a polite email asking my manager for two days of leave",
  "Give me 5 tips for running an effective meeting",
  "Explain the difference between a memo and an office order",
  "چھٹی کی درخواست کا ایک رسمی خط لکھیں",
  "دفتر میں وقت کی پابندی کیوں ضروری ہے؟",
  "ایک اچھی میٹنگ کے لیے پانچ مفید نکات بتائیں",
];
