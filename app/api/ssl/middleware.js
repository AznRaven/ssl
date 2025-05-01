import { NextResponse } from 'next/server';

// In-memory challenge store (same as in route.js; ideally, use a shared module or DB)
const challengeStore = {};

// Export for use in route.js
export { challengeStore };

export async function middleware(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path.startsWith('/.well-known/acme-challenge/')) {
    const token = path.split('/').pop();
    const keyAuthorization = challengeStore[token];

    if (keyAuthorization) {
      return new NextResponse(keyAuthorization, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    return new NextResponse('Not Found', { status: 404 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/.well-known/acme-challenge/:path*',
};