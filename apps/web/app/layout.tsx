import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Web3Provider } from "./providers";

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sibyl - Proof of Alpha, settled on Kite",
  description:
    "Verifiable agent reputation for autonomous trading. Analysts sell signals via x402, traders execute, and every outcome is attested on-chain.",
  openGraph: {
    title: "Sibyl : Proof of Alpha, settled on Kite",
    description:
      "Verifiable agent reputation for autonomous trading on Kite L1.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#FAFAF7",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${instrumentSerif.variable} ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body className="font-sans">
        <Web3Provider>{children}</Web3Provider>
      </body>
    </html>
  );
}
