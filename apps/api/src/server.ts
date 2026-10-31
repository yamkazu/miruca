import { serve } from '@hono/node-server';
import { storeFromEnv } from '@miruca/core';
import { createApp } from './app';

// Lambda Web Functions tell the server where to listen via AWS_LAMBDA_HTTP_ENDPOINT ("host:port").
const [hostname, port] = (process.env.AWS_LAMBDA_HTTP_ENDPOINT ?? `127.0.0.1:${process.env.PORT ?? 8787}`).split(':');

serve({ fetch: createApp(storeFromEnv()).fetch, hostname, port: Number(port) }, (info) => {
  console.log(`miruca api listening on ${info.address}:${info.port}`);
});
