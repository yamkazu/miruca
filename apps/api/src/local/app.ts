import { createApp } from '../app';
import { localConfig } from './config';
import { addDevLogin } from './dev-login';

/** The API as `npm run dev:api` and the tests run it: MiniStack, plus the local-only login. */
export function createLocalApp() {
  const app = createApp(localConfig);
  addDevLogin(app, localConfig);
  return app;
}
