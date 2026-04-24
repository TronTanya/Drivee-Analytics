import "@/app/globals.css";
import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import { Providers } from "@/app/providers";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap"
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap"
});

export const metadata: Metadata = {
  title: "Drivee Analytics Notebook",
  description: "AI-платформа аналитических сценариев"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans`}>
        {process.env.NODE_ENV === "development" &&
        process.env.NEXT_PUBLIC_ENABLE_FIGMA_HTML_CAPTURE === "1" ? (
          <Script src="https://mcp.figma.com/mcp/html-to-design/capture.js" strategy="afterInteractive" />
        ) : null}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
