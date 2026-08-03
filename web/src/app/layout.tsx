import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-plus-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "RAIS — Real-Time Audio Intelligence System",
  description:
    "Upload audio or start live listening — uncover every voice, classify sounds, and analyze spatial context with AI-powered speaker diarization.",
  keywords: [
    "audio intelligence",
    "speaker diarization",
    "transcription",
    "sound classification",
    "AI",
    "real-time",
  ],
  authors: [{ name: "Nura AI Labs" }],
  openGraph: {
    title: "RAIS — Real-Time Audio Intelligence System",
    description:
      "AI-powered speaker diarization, transcription, sound classification, and spatial analysis.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={plusJakarta.variable}>
      <body className={plusJakarta.className}>
        <div className="gradient-glow fixed inset-x-0 top-0 h-[600px] pointer-events-none z-0" />
        {children}
      </body>
    </html>
  );
}
