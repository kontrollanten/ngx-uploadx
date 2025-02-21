import { Inject, Injectable, NgZone, OnDestroy, Optional } from '@angular/core';
import { fromEvent, Observable, Subject, Subscription } from 'rxjs';
import { debounceTime, map } from 'rxjs/operators';
import { Ajax, AjaxRequestConfig, AjaxResponse, UPLOADX_AJAX } from './ajax';
import { IdService } from './id.service';
import { UploadState, UploadxControlEvent } from './interfaces';
import {
  iOSPatch,
  UploadxFactoryOptions,
  UploadxOptions,
  UPLOADX_FACTORY_OPTIONS,
  UPLOADX_OPTIONS
} from './options';
import { store } from './store';
import { Uploader } from './uploader';
import { isBrowser, isIOS, onLine, pick } from './utils';

export const UPLOAD_STATE_KEYS: (keyof UploadState)[] = [
  'file',
  'name',
  'progress',
  'remaining',
  'response',
  'responseHeaders',
  'responseStatus',
  'size',
  'speed',
  'status',
  'uploadId',
  'url'
];

const DUE_TIME = 5;

@Injectable({ providedIn: 'root' })
export class UploadxService implements OnDestroy {
  /** Upload Queue */
  queue: Uploader[] = [];
  options: UploadxFactoryOptions;
  private readonly eventsStream: Subject<UploadState> = new Subject();
  private subs: Subscription[] = [];

  constructor(
    @Optional() @Inject(UPLOADX_OPTIONS) options: UploadxOptions | null,
    @Inject(UPLOADX_FACTORY_OPTIONS) defaults: UploadxFactoryOptions,
    @Inject(UPLOADX_AJAX) readonly ajax: Ajax,
    private ngZone: NgZone,
    private idService: IdService
  ) {
    this.options = Object.assign({}, defaults, options);
    if (isBrowser()) {
      this.subs.push(
        fromEvent(window, 'online').subscribe(() => this.control({ action: 'upload' })),
        fromEvent(window, 'offline').subscribe(() => this.control({ action: 'pause' }))
      );
    }
  }

  /** Upload status events */
  get events(): Observable<UploadState> {
    return this.eventsStream.asObservable();
  }

  /**
   * Initializes service
   * @param options global module options
   * @returns Observable that emits a new value on progress or status changes
   */
  init(options: UploadxOptions = {}): Observable<UploadState> {
    Object.assign(this.options, options);
    return this.events;
  }

  /**
   * Initializes service
   * @param options global module options
   * @returns Observable that emits the current array of uploaders
   */
  connect(options?: UploadxOptions): Observable<Uploader[]> {
    return this.init(options).pipe(
      map(() => this.queue),
      debounceTime(DUE_TIME)
    );
  }

  /**
   * Terminates all uploads and clears the queue
   */
  disconnect(): void {
    this.queue.forEach(uploader => (uploader.status = 'paused'));
    this.queue = [];
  }

  /**
   * Returns current uploads state
   * @example
   * // restore background uploads
   * this.uploads = this.uploadService.state();
   */
  state(): UploadState[] {
    return this.queue.map(uploader => pick(uploader, UPLOAD_STATE_KEYS));
  }

  ngOnDestroy(): void {
    this.disconnect();
    this.subs.forEach(sub => sub.unsubscribe());
  }

  /**
   * Creates uploaders for files and adds them to the upload queue
   */
  handleFiles(files: FileList | File | File[], options = {} as UploadxOptions): void {
    isIOS() && iOSPatch(options);
    const instanceOptions: UploadxFactoryOptions = { ...this.options, ...options };
    store.clear(instanceOptions.storeIncompleteHours);
    this.options.concurrency = instanceOptions.concurrency;
    ('name' in files ? [files] : Array.from(files)).forEach(file =>
      this.addUploaderInstance(file, instanceOptions)
    );
  }

  /**
   * Upload control
   * @example
   * // pause all
   * this.uploadService.control({ action: 'pause' });
   * // pause upload with uploadId
   * this.uploadService.control({ action: 'pause', uploadId});
   * // set token
   * this.uploadService.control({ token: `TOKEN` });
   */
  control(evt: UploadxControlEvent): void {
    const target = evt.uploadId
      ? this.queue.filter(({ uploadId }) => uploadId === evt.uploadId)
      : this.queue;
    target.forEach(uploader => uploader.configure(evt));
  }

  /**
   * Number of active uploads
   */
  get activeUploadsCount(): number {
    return this.queue.filter(({ status }) => status === 'uploading' || status === 'retry').length;
  }

  /**
   * Performs http requests
   */
  async request<T = string>(config: AjaxRequestConfig): Promise<AjaxResponse<T>> {
    config.data ||= config.body;
    return this.ajax.request(config);
  }

  private stateChange = (uploader: Uploader) => {
    this.ngZone.run(() => this.eventsStream.next(pick(uploader, UPLOAD_STATE_KEYS)));
    if (uploader.status !== 'uploading' && uploader.status !== 'added') {
      this.ngZone.runOutsideAngular(() => setTimeout(() => this.processQueue()));
    }
  };

  private async addUploaderInstance(file: File, options: UploadxFactoryOptions): Promise<void> {
    const uploader = new options.uploaderClass(file, options, this.stateChange, this.ajax);
    (uploader as { uploadId: string }).uploadId = await this.idService.generateId(uploader);
    // Object.defineProperty(uploader, 'uploadId', { configurable: false, writable: false });
    this.queue.push(uploader);
    uploader.status = options.autoUpload && onLine() ? 'queue' : 'added';
  }

  private processQueue(): void {
    this.queue = this.queue.filter(({ status }) => status !== 'cancelled');
    this.queue
      .filter(({ status }) => status === 'queue')
      .slice(0, Math.max(this.options.concurrency - this.activeUploadsCount, 0))
      .forEach(uploader => uploader.upload());
  }
}
