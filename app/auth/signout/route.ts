import { createServerClient } from '@supabase/ssr'
import { cookies }            from 'next/headers'
import { NextResponse }       from 'next/server'
import type { NextRequest }   from 'next/server'

type CookieToSet = { name: string; value: string; options?: Record<string, unknown> }

/**
 * Server-side sign-out — multi-layer cleanup so the session truly dies.
 *
 * 1. Snapshot every sb-* cookie name from the request
 * 2. Best-effort: invalidate the refresh token globally via Supabase
 * 3. Build an HTML response that:
 *    - sets Set-Cookie headers to expire every sb-* cookie across all
 *      domain/path variants we can think of
 *    - serves a <script> that nukes ALL sb-* cookies via document.cookie,
 *      clears localStorage + sessionStorage, then hard-redirects to /
 *
 * The HTML approach is needed because Set-Cookie alone doesn't always win
 * across different domain/path combos, and localStorage isn't reachable
 * from server code at all.
 */
async function handleSignOut(request: NextRequest) {
  const sbCookieNames = request.cookies.getAll()
    .map((c) => c.name)
    .filter((n) => n.startsWith('sb-'))

  // Best-effort server-side signOut (revokes refresh token)
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setAll(cs: CookieToSet[]) {
            cs.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options as any)
            )
          },
        },
      }
    )
    await supabase.auth.signOut({ scope: 'global' })
  } catch (e) {
    console.error('[signout] supabase.signOut error:', e)
  }

  // HTML body that nukes everything client-side then redirects
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Signing out…</title>
  <meta http-equiv="refresh" content="2;url=/">
  <style>
    body{margin:0;background:#09090b;color:#a1a1aa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;font-size:14px}
    .spinner{width:24px;height:24px;border:2px solid #27272a;border-top-color:#7c3aed;border-radius:50%;animation:s 0.8s linear infinite;margin-right:10px}
    @keyframes s{to{transform:rotate(360deg)}}
    .row{display:flex;align-items:center}
  </style>
</head>
<body>
  <div class="row"><div class="spinner"></div>Signing you out…</div>
  <script>
    (function(){
      try {
        // Clear every sb-* cookie across every plausible domain/path combo
        var host = location.hostname;
        var apex = host.replace(/^www\\./, '');
        var domains = ['', host, '.' + host, apex, '.' + apex];
        var paths   = ['/', '/auth', '/dashboard', '/login'];
        var cookies = document.cookie.split(';');
        for (var i = 0; i < cookies.length; i++) {
          var name = cookies[i].split('=')[0].trim();
          if (!name) continue;
          if (name.indexOf('sb-') !== 0) continue;
          for (var d = 0; d < domains.length; d++) {
            for (var p = 0; p < paths.length; p++) {
              document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=' + paths[p] + (domains[d] ? '; domain=' + domains[d] : '');
            }
          }
        }
      } catch(e) { console.error('cookie nuke', e); }

      try {
        // Wipe storage too
        var keys = Object.keys(localStorage);
        for (var i = 0; i < keys.length; i++) {
          if (keys[i].indexOf('sb-') === 0 || keys[i].indexOf('supabase') === 0) {
            localStorage.removeItem(keys[i]);
          }
        }
        var skeys = Object.keys(sessionStorage);
        for (var i = 0; i < skeys.length; i++) {
          if (skeys[i].indexOf('sb-') === 0 || skeys[i].indexOf('supabase') === 0) {
            sessionStorage.removeItem(skeys[i]);
          }
        }
      } catch(e) { console.error('storage nuke', e); }

      // Hard redirect (replace so back button doesn't return here)
      setTimeout(function(){ location.replace('/'); }, 50);
    })();
  </script>
</body>
</html>`

  const response = new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type':  'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  })

  // Also fire Set-Cookie headers from the server side as a backup layer
  const host = request.nextUrl.hostname
  const apex = host.replace(/^www\./, '')
  const domains: (string | undefined)[] = [undefined, host, `.${host}`, apex, `.${apex}`]
  const paths = ['/', '/auth']

  for (const name of sbCookieNames) {
    for (const domain of domains) {
      for (const path of paths) {
        response.cookies.set({
          name,
          value:   '',
          path,
          maxAge:  0,
          expires: new Date(0),
          ...(domain ? { domain } : {}),
        })
      }
    }
  }

  return response
}

export async function GET(request: NextRequest)  { return handleSignOut(request) }
export async function POST(request: NextRequest) { return handleSignOut(request) }
