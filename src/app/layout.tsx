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

// 카카오톡 링크 미리보기 캐시를 고려한 메타데이터 설정
const siteUrl = 'https://youtube-insigt.vercel.app';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Youtube InSigt - YouTube 영상 분석 도구",
  description: "YouTube 검색 결과를 채널 평소 성과 대비 얼마나 터졌는지(성과배수)로 정렬하고, 상위군·하위군 대조 프롬프트를 만들어 LLM에 붙여넣는 분석 도구",
  keywords: ["YouTube", "영상 분석", "성과배수", "YouTube API", "콘텐츠 분석", "LLM 프롬프트"],
  authors: [{ name: "lingger-lab" }],
  openGraph: {
    title: "Youtube InSigt - YouTube 영상 분석 도구",
    description: "YouTube 검색 결과를 채널 평소 성과 대비 얼마나 터졌는지(성과배수)로 정렬하고, 상위군·하위군 대조 프롬프트를 만들어 LLM에 붙여넣는 분석 도구",
    type: "website",
    locale: "ko_KR",
    siteName: "Youtube InSigt",
    url: siteUrl,
    images: [
      {
        url: new URL('/opengraph-image', siteUrl).toString(),
        width: 1200,
        height: 630,
        alt: "Youtube InSigt - YouTube 영상 분석 도구",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Youtube InSigt - YouTube 영상 분석 도구",
    description: "YouTube 검색 결과를 채널 평소 성과 대비 얼마나 터졌는지(성과배수)로 정렬하고, 상위군·하위군 대조 프롬프트를 만들어 LLM에 붙여넣는 분석 도구",
    images: [new URL('/opengraph-image', siteUrl).toString()],
  },
  alternates: {
    canonical: '/',
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
