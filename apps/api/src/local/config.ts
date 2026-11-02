import type { LocalConfig } from '../config';

export const ministackUrl = 'http://localhost:4566';

export const localConfig: LocalConfig = {
  env: 'local',
  aws: { endpoint: ministackUrl, region: 'us-east-1', credentials: { accessKeyId: 'test', secretAccessKey: 'test' } },
  appOrigin: 'http://localhost:5173',
  sessionCookie: { name: 'miruca_session', secure: false },
};
