import { ImageResponse } from '@vercel/og';

// Open Graph 이미지 생성 (카카오톡 링크 미리보기용)
export const alt = 'Youtube InSigt - YouTube 영상 분석 도구';
export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

export default async function Image() {
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
            조회수·구독자수 기반 떡상지수 분석
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
      ...size,
    }
  );
}

