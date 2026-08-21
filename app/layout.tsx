import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const expoArabic = localFont({
  src: [
    { path: "../assets/fonts/ExpoArabic/WOFF2/ExpoArabic-Light.woff2", weight: "300", style: "normal" },
    { path: "../assets/fonts/ExpoArabic/WOFF2/ExpoArabic-Book.woff2", weight: "400", style: "normal" },
    { path: "../assets/fonts/ExpoArabic/WOFF2/ExpoArabic-Medium.woff2", weight: "500", style: "normal" },
    { path: "../assets/fonts/ExpoArabic/WOFF2/ExpoArabic-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "../assets/fonts/ExpoArabic/WOFF2/ExpoArabic-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-expo-arabic",
  display: "swap",
  preload: true,
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ??
      (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000"),
  ),
  title: "موازنة | حسابك العائلي ببساطة",
  description: "تسجيل السحوبات والسداد ومتابعة الرصيد والأقساط بسرعة وأمان.",
  applicationName: "موازنة",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "موازنة",
  },
  formatDetection: { telephone: false },
  openGraph: {
    title: "موازنة",
    description: "حسابك العائلي ببساطة",
    type: "website",
    locale: "ar_SA",
    images: [{ url: "/og.png", width: 1730, height: 909, alt: "موازنة — حسابك العائلي ببساطة" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "موازنة",
    description: "حسابك العائلي ببساطة",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6f2" },
    { media: "(prefers-color-scheme: dark)", color: "#101714" },
  ],
  colorScheme: "light dark",
};

const themeScript = `(() => { try { const saved = localStorage.getItem('muwazana-theme'); const theme = saved === 'light' || saved === 'dark' ? saved : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); document.documentElement.dataset.theme = theme; document.documentElement.style.colorScheme = theme; } catch (_) {} })();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body className={expoArabic.variable}>{children}</body>
    </html>
  );
}
