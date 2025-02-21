import { Ajax, AjaxRequestConfig } from './ajax';
import { Canceler } from './canceler';
import { DynamicChunk } from './dynamic-chunk';
import {
  AuthorizeRequest,
  Metadata,
  PreRequest,
  RequestConfig,
  RequestHeaders,
  RequestOptions,
  ResponseBody,
  UploadAction,
  UploaderOptions,
  UploadState,
  UploadStatus,
  UploadxControlEvent
} from './interfaces';
import { ErrorType, RetryHandler } from './retry-handler';
import { store } from './store';
import { isNumber, unfunc } from './utils';

const actionToStatusMap: { [K in UploadAction]: UploadStatus } = {
  pause: 'paused',
  upload: 'queue',
  cancel: 'cancelled'
};

/**
 * Uploader Base Class
 */
export abstract class Uploader implements UploadState {
  name: string;
  readonly size: number;
  readonly uploadId!: string;
  response: ResponseBody = null;
  responseStatus = 0;
  responseHeaders: Record<string, string> = {};
  progress!: number;
  remaining!: number;
  speed = 0;
  /** Custom headers */
  headers: RequestHeaders = {};
  /** Metadata Object */
  metadata: Metadata;
  /** Upload endpoint */
  endpoint = '/upload';
  /** Chunk size in bytes */
  chunkSize?: number;
  /** Auth token/tokenGetter */
  token: UploadxControlEvent['token'];
  /** Byte offset within the whole file */
  offset?: number;
  /** Retries handler */
  retry: RetryHandler;
  canceler = new Canceler();
  /** Set HttpRequest responseType */
  responseType?: 'json' | 'text' | 'document';
  private _eventsCount = 0;
  private readonly _authorize: AuthorizeRequest;
  private readonly _prerequest: PreRequest;
  private _token!: string;

  constructor(
    readonly file: File,
    readonly options: Readonly<UploaderOptions>,
    readonly stateChange: (uploader: Uploader) => void,
    readonly ajax: Ajax
  ) {
    this.retry = new RetryHandler(options.retryConfig);
    this.name = file.name;
    this.size = file.size;
    this.metadata = {
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      lastModified: file.lastModified
    };
    options.maxChunkSize && (DynamicChunk.maxSize = options.maxChunkSize);
    this._prerequest = options.prerequest || (req => req);
    this._authorize = options.authorize || (req => req);
    this.configure(options);
  }

  private _url = '';

  get url(): string {
    return this._url || store.get(this.uploadId) || '';
  }

  set url(value: string) {
    this._url !== value && store.set(this.uploadId, value);
    this._url = value;
  }

  private _status!: UploadStatus;

  get status(): UploadStatus {
    return this._status;
  }

  set status(s: UploadStatus) {
    if (this._status === 'cancelled' || (this._status === 'complete' && s !== 'cancelled')) {
      return;
    }
    if (s !== this._status) {
      this.status === 'retry' && this.retry.cancel();
      this._status = s;
      s === 'paused' && this.abort();
      ['cancelled', 'complete', 'error'].includes(s) && this.cleanup();
      s === 'cancelled' ? this.cancel() : this.stateChange(this);
    }
  }

  /**
   * Configure uploader
   */
  configure({ metadata, headers, token, endpoint, action }: UploadxControlEvent): void {
    endpoint && (this.endpoint = endpoint);
    token && (this.token = token);
    metadata && Object.assign(this.metadata, unfunc(metadata, this.file));
    headers && Object.assign(this.headers, unfunc(headers, this.file));
    action && (this.status = actionToStatusMap[action]);
  }

  /**
   * Starts uploading
   */
  async upload(): Promise<void> {
    this._status = 'uploading';
    while (this.status === 'uploading' || this.status === 'retry') {
      this.status = 'uploading';
      try {
        this._token ||= await this.updateToken();
        this.url ||= await this.getFileUrl();
        if (this.offset !== this.size) {
          this.offset = isNumber(this.offset)
            ? await this.sendFileContent()
            : await this.getOffset();
        }
        this.retry.observe(this.offset);
        if (this.offset === this.size) {
          this.remaining = 0;
          this.progress = 100;
          this.status = 'complete';
        } else if (!this.offset) {
          this.stateChange(this);
          await this.retry.wait(this.getRetryAfterFromBackend() || this.retry.config.onBusyDelay);
        }
      } catch (e) {
        e instanceof Error && console.error(e);
        if (this.status !== 'uploading') {
          return;
        }
        switch (this.retry.kind(this.responseStatus)) {
          case ErrorType.Fatal:
            this.status = 'error';
            return;
          case ErrorType.NotFound:
            this.url = '';
            break;
          case ErrorType.Auth:
            this._token = '';
            break;
          default:
            if (this.responseStatus >= 400 || this.chunkSize! > DynamicChunk.size) {
              this.offset = undefined;
            }
            this.status = 'retry';
            await this.retry.wait(this.getRetryAfterFromBackend());
        }
      }
    }
  }

  /**
   * Performs http requests
   */
  async request(requestOptions: RequestOptions): Promise<void> {
    this.responseStatus = 0;
    this.response = null;
    this.responseHeaders = {};
    let req: RequestConfig = {
      body: requestOptions.body || null,
      canceler: this.canceler,
      headers: { ...this.headers, ...requestOptions.headers },
      method: requestOptions.method || 'GET',
      url: requestOptions.url || this.url
    };
    req = await this._authorize(req, this._token);
    const { body = null, headers, method, url = req.url } = (await this._prerequest(req)) || req;
    const ajaxRequestConfig: AjaxRequestConfig = {
      method,
      headers: { ...req.headers, ...headers },
      url,
      data: body,
      responseType: this.options.responseType ?? this.responseType,
      withCredentials: !!this.options.withCredentials,
      canceler: this.canceler,
      validateStatus: () => true,
      timeout: this.retry.config.timeout
    };
    if (body && typeof body !== 'string') {
      ajaxRequestConfig.onUploadProgress = this.onProgress();
    }
    const response = await this.ajax.request(ajaxRequestConfig);
    this.response = response.data;
    this.responseHeaders = response.headers;
    this.responseStatus = response.status;
    if (response.status >= 400) {
      return Promise.reject();
    }
  }

  /**
   * Set auth token string
   */
  updateToken = (): string | Promise<string> => {
    return unfunc(this.token || '', this.responseStatus);
  };

  /**
   * Get file URI
   */
  protected abstract getFileUrl(): Promise<string>;

  /**
   * Send file content and return an offset for the next request
   */
  protected abstract sendFileContent(): Promise<number | undefined>;

  /**
   * Get an offset for the next request
   */
  protected abstract getOffset(): Promise<number | undefined>;

  protected abort(): void {
    this.offset = undefined;
    this.canceler.cancel();
  }

  protected async cancel(): Promise<void> {
    this.abort();
    if (this.url) {
      await this.request({ method: 'DELETE' }).catch(() => {});
    }
    this.stateChange(this);
  }

  /**
   * Gets the value from the response
   */
  protected getValueFromResponse(key: string): string | null {
    return this.responseHeaders[key.toLowerCase()] || null;
  }

  protected getChunk(): { start: number; end: number; body: Blob } {
    this.chunkSize =
      this.options.chunkSize === 0 ? this.size : this.options.chunkSize || DynamicChunk.size;
    const start = this.offset || 0;
    const end = Math.min(start + this.chunkSize, this.size);
    const body = this.file.slice(this.offset, end);
    return { start, end, body };
  }

  private getRetryAfterFromBackend(): number {
    return Number(this.getValueFromResponse('retry-after')) * 1000;
  }

  private cleanup = () => store.delete(this.uploadId);

  private onProgress(): (evt: ProgressEvent) => void {
    let throttle: ReturnType<typeof setTimeout> | undefined;
    const startTime = Date.now();
    return ({ loaded }) => {
      const current = loaded / ((Date.now() - startTime) / 1000);
      this.speed = ~~((this.speed * this._eventsCount + current) / ++this._eventsCount);
      DynamicChunk.scale(this.speed);
      if (!throttle) {
        throttle = setTimeout(() => (throttle = undefined), 500);
        const uploaded = (this.offset as number) + loaded;
        this.progress = +((uploaded / this.size) * 100).toFixed(2);
        this.remaining = ~~((this.size - uploaded) / this.speed);
        this.stateChange(this);
      }
    };
  }
}
