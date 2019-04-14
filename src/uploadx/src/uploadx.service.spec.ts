import { UploadxService } from './uploadx.service';
import { UploadAction } from './interfaces';
const ENDPOINT = `http://localhost:3003/upload?user_id=test`;
const options = {
  concurrency: 3,
  allowedTypes: 'image/*,video/*',
  endpoint: ENDPOINT,
  token: '%token%',
  autoUpload: false,
  chunkSize: 4096
};
describe('UploadxService', () => {
  let service: UploadxService;
  beforeEach(() => {
    service = new UploadxService();
  });

  it('should set default options', () => {
    service.init({});
    expect(service.uploaderOptions.concurrency).toEqual(2);
    expect(service.uploaderOptions.autoUpload).toEqual(true);
  });
  it('should set endpoint', () => {
    service.init({ url: ENDPOINT });
    expect(service.uploaderOptions.concurrency).toEqual(2);
    expect(service.uploaderOptions.autoUpload).toEqual(true);
    expect(service.uploaderOptions.endpoint).toEqual(ENDPOINT);
  });
  it('should overwrite default options', () => {
    service.init(options);
    expect(service.uploaderOptions.endpoint).toEqual(ENDPOINT);
    expect(service.uploaderOptions.token).toEqual('%token%');
    expect(service.uploaderOptions.chunkSize).toEqual(4096);
  });
  it('should keep the settings', () => {
    service.init(options);
    service.init({});
    service.connect();
    expect(service.uploaderOptions.endpoint).toEqual(ENDPOINT);
    expect(service.uploaderOptions.token).toEqual('%token%');
    expect(service.uploaderOptions.chunkSize).toEqual(4096);
  });
  it('should overwrite default options', () => {
    service.connect(options);
    expect(service.uploaderOptions.endpoint).toEqual(ENDPOINT);
    expect(service.uploaderOptions.token).toEqual('%token%');
    expect(service.uploaderOptions.chunkSize).toEqual(4096);
  });
  it('should add 2 files to queue', () => {
    const file = getFile();
    const fileList = {
      0: file,
      1: file,
      length: 2,
      item: (index: number) => file
    };
    service.connect(options);
    service.handleFileList(fileList);
    expect(service.queue.length).toEqual(2);
    service.disconnect();
    expect(service.queue.length).toEqual(0);
  });

  it('should add file to queue with status `added`', () => {
    const file = getFile();
    service.connect(options);
    service.handleFile(file);
    expect(service.queue[0].status).toEqual('added');
    service.disconnect();
  });
  it('should set correct status on `control` method call', () => {
    const file = getFile();
    service.connect(options);
    service.handleFile(file);
    const upload = service.queue[0];
    service.control({ action: 'refreshToken' });
    service.control({ action: 'pauseAll' });
    expect(service.queue[0].status).toEqual('paused');
    service.control({ action: 'uploadAll' });
    expect(service.queue[0].status).toEqual('queue');
    service.control({ ...upload, action: 'pause' });
    expect(service.queue[0].status).toEqual('paused');
    service.control({ ...upload, action: 'upload' });
    service.control({ action: 'upload', itemOptions: upload });
    expect(service.queue[0].status).toEqual('queue');
    service.control({ ...upload, action: 'cancel' });
    service.control({ action: 'cancelAll' });
    service.control({ action: '???' as UploadAction });
    expect(service.queue[0].status).toEqual('cancelled');
    service.control({ action: 'uploadAll' });
    expect(service.queue[0].status).toEqual('cancelled');
  });

  it('should add file to queue with status `queue`', () => {
    const file = getFile();
    service.connect({ ...options, autoUpload: true });
    service.handleFile(file);
    expect(service.queue[0].status).toEqual('queue');
    service.disconnect();
  });
});

function getFile(): File {
  return new File([''], 'filename.mp4');
}
