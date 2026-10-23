import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { themeInitScript } from "@/lib/theme-script";
import { TooltipProvider } from "@/components/ui/tooltip";

// Fonts are bundled locally (app/fonts) so the app works fully offline.
const geistSans = localFont({
  src: "./fonts/geist-latin.woff2",
  variable: "--font-geist-sans",
  weight: "100 900",
  // The auto-generated Arial fallback has Arabic glyphs and would swallow Urdu text
  // before it reaches the Urdu font.
  adjustFontFallback: false,
});

const geistMono = localFont({
  src: "./fonts/geist-mono-latin.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
});

// Urdu glyphs. Latin text falls through to Geist, Urdu text to this font.
const nastaliqUrdu = localFont({
  src: "./fonts/noto-nastaliq-urdu-arabic.woff2",
  variable: "--font-nastaliq-urdu",
  weight: "400 700",
});

export const metadata: Metadata = {
  title: "AI Chatbot",
  description: "AI chatbot built with assistant-ui",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${nastaliqUrdu.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col"><TooltipProvider>{children}</TooltipProvider></body>
    </html>
  );
}
