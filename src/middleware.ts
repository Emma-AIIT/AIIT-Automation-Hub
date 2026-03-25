/**
 * Next.js middleware — runs on every request before the page renders.
 *
 * Auth flow:
 *   1. Refreshes the Supabase session cookie (keeps users logged in across tabs).
 *   2. Unauthenticated users visiting any non-/login, non-/api route → redirect to /login.
 *   3. Authenticated users visiting /login → redirect to /automations.
 *
 * API routes (/api/*) are excluded from auth checks — they handle their own
 * authentication via CRON_SECRET or WHATSAPP_IMPORT_SECRET bearer tokens.
 *
 * Static assets (_next/static, _next/image, favicon, og-image) are excluded
 * via the matcher config to avoid unnecessary middleware overhead.
 */
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If not logged in and trying to access protected routes, redirect to login
  if (!user && !request.nextUrl.pathname.startsWith('/login') && !request.nextUrl.pathname.startsWith('/api')) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // If logged in and on login page, redirect to dashboard
  if (user && request.nextUrl.pathname.startsWith('/login')) {
    const url = request.nextUrl.clone();
    url.pathname = '/automations';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.png|og-image.png).*)',
  ],
};
