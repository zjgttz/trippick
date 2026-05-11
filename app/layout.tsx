import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TripPick · 把你收藏的小红书攻略，拼成真正能出发的行程",
  description:
    "TripPick 不替你从零生成行程，而是从你已经喜欢的小红书攻略里，帮你做决定。",
  openGraph: {
    title: "TripPick",
    description: "把你收藏的小红书攻略，拼成真正能出发的行程",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#FF2442",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-white text-ink-900 font-sans">
        {children}
      </body>
    </html>
  );
}
