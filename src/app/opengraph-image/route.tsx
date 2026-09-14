// Next 16이 ImageResponse를 자체 번들해 next/og로 재수출한다.
// 직접 의존하던 @vercel/og는 중복이었고, prod 의존성 트리의 유일한 취약점
// (satori -> opentype.js -> fflate) 출처이기도 했다.
import { ImageResponse } from 'next/og';

// Open Graph 이미지 생성 (카카오톡 링크 미리보기용)
export const runtime = 'edge';

export async function GET() {
  try {
    return new ImageResponse(
      (
        <div
          style={{
            background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)',
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'system-ui',
          }}
        >
          {/* 메인 타이틀 */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '20px',
            }}
          >
            <div
              style={{
                fontSize: '80px',
                fontWeight: 'bold',
                background: 'linear-gradient(90deg, #FF0000 0%, #FF6B00 100%)',
                backgroundClip: 'text',
                color: 'transparent',
                marginBottom: '20px',
              }}
            >
              YouTube InSigt
            </div>
            
            <div
              style={{
                fontSize: '36px',
                color: '#ffffff',
                textAlign: 'center',
                marginTop: '20px',
              }}
            >
              YouTube 영상 분석 도구
            </div>
            
            <div
              style={{
                fontSize: '24px',
                color: '#a0a0a0',
                textAlign: 'center',
                marginTop: '40px',
                maxWidth: '800px',
              }}
            >
              채널 평소 성과 대비 얼마나 터졌는지로 영상 발굴
            </div>
          </div>
          
          {/* 하단 장식 요소 */}
          <div
            style={{
              position: 'absolute',
              bottom: '40px',
              display: 'flex',
              gap: '20px',
              fontSize: '20px',
              color: '#666666',
            }}
          >
            <span>🔍</span>
            <span>📊</span>
            <span>🔥</span>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (error) {
    console.error('[opengraph-image] 생성 실패', error);
    return new Response('Failed to generate the image', {
      status: 500,
    });
  }
}

