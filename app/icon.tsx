import { ImageResponse } from 'next/og'

export const size        = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width:          32,
          height:         32,
          borderRadius:   7,
          background:     'linear-gradient(135deg, #2dd4bf 0%, #0d9488 50%, #0f766e 100%)',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            color:      'white',
            fontSize:   22,
            fontWeight: 900,
            fontFamily: 'system-ui, -apple-system, sans-serif',
            lineHeight: 1,
            letterSpacing: '-1px',
            marginTop:  1,
          }}
        >
          K
        </span>
      </div>
    ),
    { ...size },
  )
}
