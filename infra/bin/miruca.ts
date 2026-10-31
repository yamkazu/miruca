import { App } from 'aws-cdk-lib';
import { MirucaStack } from '../lib/miruca-stack';

const app = new App();
new MirucaStack(app, 'Miruca', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    // Lambda Web Functions launched in a handful of regions, Tokyo included.
    region: process.env.CDK_DEFAULT_REGION ?? 'ap-northeast-1',
  },
});
