import { serve } from '@hono/node-server';
import { createLocalApp } from './app';
import { localConfig } from './config';
import { seed } from './seed';

await seed(localConfig);
console.log('MiniStack にテーブル、サンプルのユーザー、秘密情報を入れました');

serve({ fetch: createLocalApp().fetch, hostname: '127.0.0.1', port: 8787 }, (info) => {
  console.log(`miruca api (local) listening on http://${info.address}:${info.port}`);
});
