import { serve } from '@hono/node-server';
import { createApp } from './app';

// Lambda Web Functions pass the address to listen on as AWS_LAMBDA_HTTP_ENDPOINT ("host:port").
const [hostname, port] = (process.env.AWS_LAMBDA_HTTP_ENDPOINT ?? `127.0.0.1:${process.env.PORT ?? 8787}`).split(':');

serve({ fetch: createApp().fetch, hostname, port: Number(port) }, (info) => {
  console.log(`miruca api listening on ${info.address}:${info.port}`);
});
