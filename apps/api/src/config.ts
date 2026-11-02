/** What the AWS SDK clients get: MiniStack's endpoint locally, the SDK defaults in production. */
export interface AwsClientConfig {
  endpoint?: string;
  region?: string;
  credentials?: { accessKeyId: string; secretAccessKey: string };
}

interface BaseConfig {
  aws: AwsClientConfig;
  /** The only Origin allowed on POST and DELETE. null rejects them all. */
  appOrigin: string | null;
  sessionCookie: { name: string; secure: boolean };
}

export interface LocalConfig extends BaseConfig {
  env: 'local';
  appOrigin: string;
}

export interface ProductionConfig extends BaseConfig {
  env: 'production';
}

/** Each entry point builds its own config; nothing reads environment variables to pick one. */
export type Config = LocalConfig | ProductionConfig;

export const productionConfig: ProductionConfig = {
  env: 'production',
  aws: {},
  // ponytail: no deployed origin yet, so production refuses POST/DELETE until #28 gives it its URL.
  appOrigin: null,
  sessionCookie: { name: '__Host-miruca_session', secure: true },
};
