// A small model sometimes drops letters of another script into an Urdu answer (Telugu, Hindi,
// Russian, Thai, Chinese...). They are never meant, so they are removed from Urdu answers.
// It works one character at a time, so it is safe on a stream cut at any point.

const FOREIGN_SCRIPTS = new RegExp(
  [
    "\\u0400-\\u052F", // Cyrillic
    "\\u0900-\\u0DFF", // Devanagari, Bengali, Gurmukhi, Gujarati, Odia, Tamil, Telugu, Kannada, Malayalam, Sinhala
    "\\u0E00-\\u0EFF", // Thai, Lao
    "\\u1000-\\u109F", // Burmese
    "\\u3040-\\u30FF", // Hiragana, Katakana
    "\\u3400-\\u4DBF\\u4E00-\\u9FFF", // Chinese characters
    "\\uAC00-\\uD7AF", // Hangul
  ].map((range) => `[${range}]`).join("|"),
  "g",
);

export const stripForeignScripts = (text: string) => text.replace(FOREIGN_SCRIPTS, "");
