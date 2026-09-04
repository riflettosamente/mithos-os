import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Silkscreen, VT323 } from "next/font/google";
import "./globals.css";

const vt323 = VT323({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-vt",
  display: "swap",
});

const silkscreen = Silkscreen({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-silk",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ΜΥΘΟΣ·OS — Grande Atlante Interattivo della Mitologia Greca",
  description:
    "Terminale retro anni '90 per esplorare l'intera mitologia greca: testi epici ricorsivi generati da un Oracolo LLM con ricerca web multilingue, entità interattive e mappa investigativa con fili di relazione.",
};

export const viewport: Viewport = {
  themeColor: "#0b0d20",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="it" className={`${vt323.variable} ${silkscreen.variable}`}>
      <body>{children}</body>
    </html>
  );
}
