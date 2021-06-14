import { createWriteStream } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import '../server';

export function getTestFile(): string {
  const filename = join(tmpdir(), 'testfile.mp4');
  const fileSize = 5 * 1024 * 1024;
  const file = createWriteStream(filename, { flags: 'w' });
  file.write(Buffer.alloc(fileSize));
  file.end();

  return filename;
}
