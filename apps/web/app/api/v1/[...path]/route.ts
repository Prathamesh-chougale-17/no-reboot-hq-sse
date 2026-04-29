import { NextResponse } from 'next/server';
import { failure } from '@acme/shared';

const DEFAULT_API_UPSTREAM_URL = 'http://localhost:3001';
const HOP_BY_HOP_HEADERS = [
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
] as const;

const hasRequestBody = (method: string) => !['GET', 'HEAD'].includes(method.toUpperCase());

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, '');

const getApiUpstreamUrl = () =>
  normalizeBaseUrl(
    process.env.API_UPSTREAM_URL?.trim() ||
      process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
      DEFAULT_API_UPSTREAM_URL,
  );

const forwardRequest = async (
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) => {
  const { path } = await context.params;
  const requestUrl = new URL(request.url);
  const upstreamUrl = `${getApiUpstreamUrl()}/api/v1/${path.join('/')}${requestUrl.search}`;

  const headers = new Headers(request.headers);

  for (const header of HOP_BY_HOP_HEADERS) {
    headers.delete(header);
  }

  headers.set('x-forwarded-host', requestUrl.host);
  headers.set('x-forwarded-proto', requestUrl.protocol.replace(':', ''));

  const body = hasRequestBody(request.method) ? await request.arrayBuffer() : undefined;

  try {
    const upstreamRequest: RequestInit = {
      method: request.method,
      headers,
      cache: 'no-store',
      redirect: 'manual',
    };

    if (body && body.byteLength > 0) {
      upstreamRequest.body = body;
    }

    const upstreamResponse = await fetch(upstreamUrl, upstreamRequest);

    const responseHeaders = new Headers(upstreamResponse.headers);

    for (const header of HOP_BY_HOP_HEADERS) {
      responseHeaders.delete(header);
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    return NextResponse.json(
      failure({
        code: 'UPSTREAM_UNAVAILABLE',
        message:
          error instanceof Error
            ? error.message
            : 'The API upstream could not be reached from the web server.',
      }),
      {
        status: 502,
      },
    );
  }
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = forwardRequest;
export const POST = forwardRequest;
export const PUT = forwardRequest;
export const PATCH = forwardRequest;
export const DELETE = forwardRequest;
export const OPTIONS = forwardRequest;
export const HEAD = forwardRequest;
