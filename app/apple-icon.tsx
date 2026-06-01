import { ImageResponse } from 'next/og'

export const size        = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width:          180,
          height:         180,
          borderRadius:   40,
          background:     'linear-gradient(135deg, #2dd4bf 0%, #0d9488 50%, #0f766e 100%)',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            color:         'white',
            fontSize:      128,
            fontWeight:    900,
            fontFamily:    'system-ui, -apple-system, sans-serif',
            lineHeight:    1,
            letterSpacing: '-5px',
            marginTop:     4,
          }}
        >
          K
        </span>
      </div>
    ),
    { ...size },
  )
}
