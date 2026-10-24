// English <-> Urdu helpers shared by the Knowledge Base and document summaries.
// A small model reads English far better than it writes Urdu, so Urdu requests over English
// text are answered in English first and only the finished answer is translated.
import { generateText, type LanguageModel } from "ai";

const SEED = 7;

/** Share (0 to 1) of the letters in the text that are Latin. */
export const latinShare = (text: string) => {
  const letters = text.match(/\p{L}/gu) ?? [];
  return letters.length ? letters.filter((c) => /[A-Za-z]/.test(c)).length / letters.length : 0;
};

export const translateSystem = (to: "English" | "Urdu") =>
  `Translate the user's text into ${to}. Reply with the translation only, nothing else. Keep line breaks and bullet markers as they are.` +
  (to === "Urdu"
    ? " Use only Urdu script and simple formal Urdu. Keep every number, time and amount as digits exactly as written (for example 8:00 am becomes 8:00 صبح), and translate each day of the week by its Urdu name."
    : "");

export async function translate(
  model: LanguageModel,
  text: string,
  to: "English" | "Urdu",
  maxOutputTokens = 200,
) {
  const { text: out } = await generateText({
    model,
    system: translateSystem(to),
    prompt: text,
    temperature: 0,
    seed: SEED,
    maxOutputTokens,
  });
  return out.trim();
}

// Hindi, Russian or Thai letters sometimes slip into a small model's Urdu.
const FOREIGN_SCRIPT = /[Ѐ-ӿऀ-ॿ฀-๿]/;

// A small model gets days of the week wrong when translating ("Monday to Friday" came out as
// "Sunday to Friday"), so these are swapped in before it translates.
const URDU_DAYS: [RegExp, string][] = [
  [/\bMondays?\b/gi, "پیر"],
  [/\bTuesdays?\b/gi, "منگل"],
  [/\bWednesdays?\b/gi, "بدھ"],
  [/\bThursdays?\b/gi, "جمعرات"],
  [/\bFridays?\b/gi, "جمعہ"],
  [/\bSaturdays?\b/gi, "ہفتہ"],
  [/\bSundays?\b/gi, "اتوار"],
  [/\bRamadan\b/gi, "رمضان"],
];
const withUrduDays = (text: string) => URDU_DAYS.reduce((t, [re, ur]) => t.replace(re, ur), text);

/** Translates into Urdu, asking again (up to 3 times) if foreign letters appear. */
export async function translateToUrdu(model: LanguageModel, text: string, maxOutputTokens = 200) {
  let out = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await generateText({
      model,
      system: translateSystem("Urdu"),
      prompt: withUrduDays(text),
      temperature: attempt === 0 ? 0 : 0.4,
      seed: SEED + attempt,
      maxOutputTokens,
    });
    out = result.text.trim();
    if (out && !FOREIGN_SCRIPT.test(out)) return out;
  }
  return out;
}
