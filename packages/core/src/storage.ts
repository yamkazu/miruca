import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { RepoSnapshot } from './types';

/** Where repository snapshots live: S3 in AWS, a local folder in development. */
export interface SnapshotStore {
  get(repo: string): Promise<RepoSnapshot | null>;
  put(snapshot: RepoSnapshot): Promise<void>;
  list(): Promise<RepoSnapshot[]>;
}

const PREFIX = 'snapshots/';
const keyFor = (repo: string) => `${PREFIX}${repo.replace('/', '__')}.json`;

export class S3SnapshotStore implements SnapshotStore {
  constructor(
    private readonly bucket: string,
    private readonly s3 = new S3Client({}),
  ) {}

  async get(repo: string): Promise<RepoSnapshot | null> {
    return this.read(keyFor(repo));
  }

  async put(snapshot: RepoSnapshot): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: keyFor(snapshot.repo),
        Body: JSON.stringify(snapshot),
        ContentType: 'application/json',
      }),
    );
  }

  async list(): Promise<RepoSnapshot[]> {
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const res = await this.s3.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: PREFIX, ContinuationToken: token }),
      );
      for (const o of res.Contents ?? []) if (o.Key?.endsWith('.json')) keys.push(o.Key);
      token = res.NextContinuationToken;
    } while (token);
    const snaps = await Promise.all(keys.map((k) => this.read(k)));
    return snaps.filter((s): s is RepoSnapshot => s !== null);
  }

  private async read(key: string): Promise<RepoSnapshot | null> {
    try {
      const res = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return JSON.parse(await res.Body!.transformToString()) as RepoSnapshot;
    } catch (e: any) {
      if (e?.name === 'NoSuchKey') return null;
      throw e;
    }
  }
}

export class FsSnapshotStore implements SnapshotStore {
  constructor(private readonly dir: string) {}

  async get(repo: string): Promise<RepoSnapshot | null> {
    try {
      return JSON.parse(await readFile(join(this.dir, keyFor(repo)), 'utf8'));
    } catch (e: any) {
      if (e?.code === 'ENOENT') return null;
      throw e;
    }
  }

  async put(snapshot: RepoSnapshot): Promise<void> {
    const file = join(this.dir, keyFor(snapshot.repo));
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(snapshot, null, 2));
  }

  async list(): Promise<RepoSnapshot[]> {
    let files: string[];
    try {
      files = await readdir(join(this.dir, PREFIX));
    } catch (e: any) {
      if (e?.code === 'ENOENT') return [];
      throw e;
    }
    return Promise.all(
      files.filter((f) => f.endsWith('.json')).map(async (f) => JSON.parse(await readFile(join(this.dir, PREFIX, f), 'utf8'))),
    );
  }
}

/** Picks S3 when MIRUCA_BUCKET is set, otherwise a local folder (default ./.data). */
export function storeFromEnv(env = process.env): SnapshotStore {
  if (env.MIRUCA_BUCKET) return new S3SnapshotStore(env.MIRUCA_BUCKET);
  return new FsSnapshotStore(env.MIRUCA_DATA_DIR ?? '.data');
}
