import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Youtube InSigt - YouTube 영상 분석 도구",
  description: "YouTube 검색을 API 네이티브 수준에서 제어하고, 조회수/구독자수 기반의 Viral Score(떡상지수)를 분석하는 통합 분석 웹앱",
  keywords: ["YouTube", "영상 분석", "떡상지수", "Viral Score", "YouTube API", "콘텐츠 분석"],
  authors: [{ name: "lingger-lab" }],
  openGraph: {
    title: "Youtube InSigt - YouTube 영상 분석 도구",
    description: "YouTube 검색을 API 네이티브 수준에서 제어하고, 조회수/구독자수 기반의 Viral Score(떡상지수)를 분석하는 통합 분석 웹앱",
    type: "website",
    locale: "ko_KR",
    siteName: "Youtube InSigt",
  },
  twitter: {
    card: "summary_large_image",
    title: "Youtube InSigt - YouTube 영상 분석 도구",
    description: "YouTube 검색을 API 네이티브 수준에서 제어하고, 조회수/구독자수 기반의 Viral Score(떡상지수)를 분석하는 통합 분석 웹앱",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
