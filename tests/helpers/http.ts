import { EventEmitter } from 'node:events';
import type { Express, Request } from 'express';

type HeaderValues = Record<string, string | undefined>;
type RequestOptions = {
  method?: string;
  url: string;
  headers?: HeaderValues;
  body?: unknown;
};

const normalizeHeaders = (headers: HeaderValues = {}): Record<string, string> => {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    normalized[key.toLowerCase()] = value;
  }
  return normalized;
};

export type MockResponseWithHelpers = {
  statusCode: number;
  headersSent: boolean;
  finished: boolean;
  setHeader: (name: string, value: string) => void;
  getHeader: (name: string) => string | undefined;
  removeHeader: (name: string) => void;
  writeHead: (
    statusCode: number,
    headers?: Record<string, string | number>,
  ) => MockResponseWithHelpers;
  write: (chunk?: string | Buffer) => boolean;
  end: (chunk?: string | Buffer) => MockResponseWithHelpers;
  status: (code: number) => MockResponseWithHelpers;
  set: (field: string, value: string) => MockResponseWithHelpers;
  type: (contentType: string) => MockResponseWithHelpers;
  json: (payload: unknown) => MockResponseWithHelpers;
  send: (payload?: unknown) => MockResponseWithHelpers;
  redirect: (statusOrUrl: number | string, url?: string) => MockResponseWithHelpers;
  waitForFinish: () => Promise<void>;
  _getData: () => string;
  _getJSON: () => unknown;
  _getHeaders: () => Record<string, string>;
  on: EventEmitter['on'];
  once: EventEmitter['once'];
  emit: EventEmitter['emit'];
  removeListener: EventEmitter['removeListener'];
};

type MockRequestWithEmitter = Request & {
  on: EventEmitter['on'];
  once: EventEmitter['once'];
  emit: EventEmitter['emit'];
  removeListener: EventEmitter['removeListener'];
  pause: () => void;
  resume: () => void;
  unpipe: () => void;
};

export const createMockRequest = (options: RequestOptions): MockRequestWithEmitter => {
  const emitter = new EventEmitter();
  const headers = normalizeHeaders(options.headers);
  const parsedUrl = new URL(options.url, 'http://localhost');
  const query: Record<string, string> = {};
  for (const [key, value] of parsedUrl.searchParams.entries()) {
    query[key] = value;
  }

  let bodyPayload: string | Buffer | undefined;
  if (options.body !== undefined) {
    if (Buffer.isBuffer(options.body) || typeof options.body === 'string') {
      bodyPayload = options.body;
    } else {
      bodyPayload = JSON.stringify(options.body);
      if (!headers['content-type']) {
        headers['content-type'] = 'application/json';
      }
    }
  }

  if (bodyPayload !== undefined && !headers['content-length']) {
    headers['content-length'] = String(
      Buffer.isBuffer(bodyPayload) ? bodyPayload.length : Buffer.byteLength(bodyPayload),
    );
  }

  let bodyEmitted = false;
  let emitScheduled = false;
  const emitBody = () => {
    if (bodyEmitted) return;
    bodyEmitted = true;
    if (bodyPayload !== undefined) {
      emitter.emit('data', Buffer.isBuffer(bodyPayload) ? bodyPayload : Buffer.from(bodyPayload));
    }
    emitter.emit('end');
  };

  const scheduleEmitBody = () => {
    if (emitScheduled || bodyEmitted) return;
    emitScheduled = true;
    process.nextTick(() => {
      emitScheduled = false;
      emitBody();
    });
  };

  const req = {
    method: options.method ?? 'GET',
    url: `${parsedUrl.pathname}${parsedUrl.search}`,
    originalUrl: options.url,
    path: parsedUrl.pathname,
    query,
    headers,
    readable: true,
    on: (event: string, listener: (...args: unknown[]) => void) => {
      emitter.on(event, listener);
      if (event === 'data' || event === 'end') {
        scheduleEmitBody();
      }
      return req;
    },
    once: (event: string, listener: (...args: unknown[]) => void) => {
      emitter.once(event, listener);
      if (event === 'data' || event === 'end') {
        scheduleEmitBody();
      }
      return req;
    },
    emit: emitter.emit.bind(emitter),
    removeListener: emitter.removeListener.bind(emitter),
    pause: () => undefined,
    resume: () => undefined,
    unpipe: () => undefined,
  } as unknown as MockRequestWithEmitter;

  return req;
};

export const createMockResponse = (): MockResponseWithHelpers => {
  const emitter = new EventEmitter();
  const headers: Record<string, string> = {};
  const bodyChunks: string[] = [];

  const res = {
    statusCode: 200,
    headersSent: false,
    finished: false,
    on: emitter.on.bind(emitter),
    once: emitter.once.bind(emitter),
    emit: emitter.emit.bind(emitter),
    removeListener: emitter.removeListener.bind(emitter),
    setHeader: (name: string, value: string) => {
      headers[name.toLowerCase()] = value;
    },
    getHeader: (name: string) => headers[name.toLowerCase()],
    removeHeader: (name: string) => {
      delete headers[name.toLowerCase()];
    },
    writeHead: (statusCode: number, newHeaders?: Record<string, string | number>) => {
      res.statusCode = statusCode;
      if (newHeaders) {
        for (const [key, value] of Object.entries(newHeaders)) {
          headers[key.toLowerCase()] = String(value);
        }
      }
      res.headersSent = true;
      return res;
    },
    write: (chunk?: string | Buffer) => {
      if (chunk !== undefined) {
        bodyChunks.push(Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk));
      }
      res.headersSent = true;
      return true;
    },
    end: (chunk?: string | Buffer) => {
      if (chunk !== undefined) {
        res.write(chunk);
      }
      res.finished = true;
      res.headersSent = true;
      emitter.emit('finish');
      emitter.emit('end');
      return res;
    },
    status: (code: number) => {
      res.statusCode = code;
      return res;
    },
    set: (field: string, value: string) => {
      headers[field.toLowerCase()] = value;
      return res;
    },
    type: (contentType: string) => {
      headers['content-type'] = contentType;
      return res;
    },
    json: (payload: unknown) => {
      headers['content-type'] = 'application/json';
      res.end(JSON.stringify(payload));
      return res;
    },
    send: (payload?: unknown) => {
      if (payload !== undefined) {
        if (Buffer.isBuffer(payload)) {
          res.write(payload);
        } else if (typeof payload === 'object') {
          res.write(JSON.stringify(payload));
        } else {
          res.write(String(payload));
        }
      }
      res.end();
      return res;
    },
    redirect: (statusOrUrl: number | string, url?: string) => {
      let statusCode = 302;
      let location = url;
      if (typeof statusOrUrl === 'string') {
        location = statusOrUrl;
      } else {
        statusCode = statusOrUrl;
      }
      res.statusCode = statusCode;
      if (location) {
        headers.location = location;
      }
      res.end();
      return res;
    },
    waitForFinish: async () => {
      if (res.finished) return;
      await new Promise((resolve) => emitter.once('finish', resolve));
    },
    _getData: () => bodyChunks.join(''),
    _getJSON: () => {
      const data = bodyChunks.join('');
      return data ? JSON.parse(data) : {};
    },
    _getHeaders: () => ({ ...headers }),
  } satisfies MockResponseWithHelpers;

  return res;
};

export const invokeApp = async (
  app: Express,
  options: RequestOptions,
  config: { waitForEnd?: boolean } = {},
): Promise<{ req: Request; res: MockResponseWithHelpers }> => {
  const req = createMockRequest(options);
  const res = createMockResponse();
  app.handle(req, res);

  if (config.waitForEnd ?? true) {
    await res.waitForFinish();
  }

  return { req, res };
};

export const waitForNextTick = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));
