import { Injectable, Logger, HttpException } from '@nestjs/common';
import { ConfigService }                      from '@nestjs/config';
import axios, { AxiosRequestConfig, Method }  from 'axios';
import type { Readable }                      from 'stream';

interface ServiceRoute {
  prefix: string;
  url:    string;
}

@Injectable()
export class ProxyService {
  private readonly logger = new Logger(ProxyService.name);

  // Routes ordered longest-prefix-first so more specific paths win
  private readonly routes: ServiceRoute[];

  constructor(private cfg: ConfigService) {
    const auth  = cfg.get('AUTH_SERVICE_URL',         'http://auth-service:3002');
    const doc   = cfg.get('DOCUMENT_SERVICE_URL',     'http://document-service:3003');
    const ev    = cfg.get('EVALUATION_SERVICE_URL',   'http://evaluation-service:3005');
    const notif = cfg.get('NOTIFICATION_SERVICE_URL', 'http://notification-service:3004');
    const rag   = cfg.get('RAG_SERVICE_URL',          'http://rag-service:8000');

    this.routes = [
      // Auth-service owns all three prefixes below
      { prefix: '/admin',         url: auth  },
      { prefix: '/company',       url: auth  },
      { prefix: '/auth',          url: auth  },
      /** Public "Book a demo" calendar + request submission. */
      { prefix: '/demo',          url: auth  },
      // Feature services
      { prefix: '/documents',     url: doc   },
      { prefix: '/evaluations',   url: ev    },
      { prefix: '/nc',            url: ev    },
      { prefix: '/audits',        url: ev    },
      { prefix: '/reports',       url: ev    },
      { prefix: '/notifications', url: notif },
      // RAG direct routes (chat + ingest)
      { prefix: '/chat',          url: rag   },
      { prefix: '/ingest',        url: rag   },
    ].sort((a, b) => b.prefix.length - a.prefix.length);
  }

  async forward(params: {
    method:  string;
    path:    string;
    body?:   any;
    headers: Record<string, string | string[] | undefined>;
    query?:  Record<string, any>;
  }) {
    const { method, path, body, headers, query } = params;

    const route = this.routes.find((r) => path.startsWith(r.prefix));
    if (!route) throw new HttpException(`No upstream for path: ${path}`, 404);

    // Append /api prefix that all NestJS services use
    const targetUrl = `${route.url}/api${path}`;
    this.logger.debug(`→ ${method} ${targetUrl}`);

    // Remove hop-by-hop headers that must not be forwarded
    const fwdHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      if (['host', 'content-length', 'connection', 'transfer-encoding'].includes(k.toLowerCase())) continue;
      if (typeof v === 'string') fwdHeaders[k] = v;
    }

    const cfg: AxiosRequestConfig = {
      method:  method as Method,
      url:     targetUrl,
      headers: fwdHeaders,
      params:  query,
      data:    body,
      timeout: 60_000,
      validateStatus: () => true, // handle all HTTP statuses ourselves
      maxContentLength: Infinity,
      maxBodyLength:    Infinity,
    };

    try {
      const res = await axios(cfg);
      return { status: res.status, data: res.data };
    } catch (err: any) {
      this.logger.error(`Proxy error → ${targetUrl}: ${err.message}`);
      throw new HttpException(err.response?.data ?? 'Upstream service unavailable', err.response?.status ?? 503);
    }
  }

  /** Forward GET and return raw bytes (e.g. profile avatar image). */
  async forwardBinary(params: {
    method: string;
    path: string;
    headers: Record<string, string | string[] | undefined>;
    query?: Record<string, any>;
  }) {
    const { method, path, headers, query } = params;

    const route = this.routes.find((r) => path.startsWith(r.prefix));
    if (!route) throw new HttpException(`No upstream for path: ${path}`, 404);

    const targetUrl = `${route.url}/api${path}`;
    this.logger.debug(`→ BINARY ${method} ${targetUrl}`);

    const fwdHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      if (['host', 'content-length', 'connection', 'transfer-encoding'].includes(k.toLowerCase())) continue;
      if (typeof v === 'string') fwdHeaders[k] = v;
    }

    try {
      const res = await axios({
        method: method as Method,
        url: targetUrl,
        headers: fwdHeaders,
        params: query,
        timeout: 60_000,
        responseType: 'arraybuffer',
        validateStatus: () => true,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });
      const contentType = res.headers['content-type'] as string | undefined;
      const contentDisposition = res.headers['content-disposition'] as string | undefined;
      return {
        status: res.status,
        data: res.data as ArrayBuffer,
        contentType,
        contentDisposition,
      };
    } catch (err: any) {
      this.logger.error(`Binary proxy error → ${targetUrl}: ${err.message}`);
      throw new HttpException(err.response?.data ?? 'Upstream service unavailable', err.response?.status ?? 503);
    }
  }

  /**
   * Forward a GET as Server-Sent Events: keeps the upstream connection open and
   * returns a Readable for the controller to pipe directly to the client.
   * Compression / response buffering must be off in the calling controller.
   */
  async forwardSse(params: {
    path: string;
    headers: Record<string, string | string[] | undefined>;
    query?: Record<string, any>;
  }): Promise<{ status: number; stream: Readable; contentType?: string }> {
    const { path, headers, query } = params;

    const route = this.routes.find((r) => path.startsWith(r.prefix));
    if (!route) throw new HttpException(`No upstream for path: ${path}`, 404);

    const targetUrl = `${route.url}/api${path}`;
    this.logger.debug(`→ SSE GET ${targetUrl}`);

    const fwdHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      if (['host', 'content-length', 'connection', 'transfer-encoding', 'accept-encoding'].includes(k.toLowerCase())) continue;
      if (typeof v === 'string') fwdHeaders[k] = v;
    }
    fwdHeaders['accept'] = 'text/event-stream';

    try {
      const res = await axios({
        method: 'GET' as Method,
        url: targetUrl,
        headers: fwdHeaders,
        params: query,
        responseType: 'stream',
        timeout: 0,
        validateStatus: () => true,
        decompress: false,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });
      return {
        status: res.status,
        stream: res.data as Readable,
        contentType: res.headers['content-type'] as string | undefined,
      };
    } catch (err: any) {
      this.logger.error(`SSE proxy error → ${targetUrl}: ${err.message}`);
      throw new HttpException('Upstream stream unavailable', err.response?.status ?? 503);
    }
  }

  /**
   * Forward a multipart/form-data (file upload) request by piping the raw
   * Express Request stream directly to the upstream service.
   * The body parsers don't touch multipart, so the stream is still intact.
   *
   * Uses a longer timeout (15 min) to cover the raw multipart transfer of a
   * large file (up to 50 MB) over a slow connection. document-service itself
   * now responds as soon as the file is received — the MinIO write and
   * extraction enqueue happen after the response — so this timeout is a
   * network-transfer safety margin, not a wait for backend processing.
   */
  async forwardStream(params: {
    method:  string;
    path:    string;
    stream:  any;
    headers: Record<string, string | string[] | undefined>;
    query?:  Record<string, any>;
  }) {
    const { method, path, stream, headers, query } = params;

    const route = this.routes.find((r) => path.startsWith(r.prefix));
    if (!route) throw new HttpException(`No upstream for path: ${path}`, 404);

    const targetUrl = `${route.url}/api${path}`;
    this.logger.debug(`→ STREAM ${method} ${targetUrl}`);

    const fwdHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      // Keep content-type (includes multipart boundary), drop hop-by-hop headers
      if (['host', 'connection', 'transfer-encoding'].includes(k.toLowerCase())) continue;
      if (typeof v === 'string') fwdHeaders[k] = v;
    }

    try {
      const res = await axios({
        method:  method as Method,
        url:     targetUrl,
        headers: fwdHeaders,
        params:  query,
        data:    stream,          // pipe the raw Readable stream
        timeout: 900_000,         // 15 min: safety margin for the raw transfer of a large file over a slow link
        validateStatus: () => true,
        maxContentLength: Infinity,
        maxBodyLength:    Infinity,
      });
      return { status: res.status, data: res.data };
    } catch (err: any) {
      this.logger.error(`Stream proxy error → ${targetUrl}: ${err.message}`);
      throw new HttpException(err.response?.data ?? 'Upstream service unavailable', err.response?.status ?? 503);
    }
  }
}
