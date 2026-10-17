import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "ものさき。Monosaki | モノの次を、見つけよう。", template: "%s | ものさき。Monosaki" },
  applicationName: "Monosaki",
  description: "モノの次を、見つけよう。AIと一緒に持ち物を確認し、整理方法から次の行動まで。引っ越し前の片づけをお手伝いします。",
  openGraph: { title: "ものさき。Monosaki", description: "モノの次を、見つけよう。", locale: "ja_JP", type: "website", siteName: "Monosaki" },
  appleWebApp: { title: "Monosaki" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f8f7f4",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
