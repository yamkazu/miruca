import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { MirucaStack } from '../lib/miruca-stack';

function synth() {
  const api = mkdtempSync(join(tmpdir(), 'api-'));
  const web = mkdtempSync(join(tmpdir(), 'web-'));
  writeFileSync(join(api, 'index.js'), '');
  writeFileSync(join(web, 'index.html'), '');
  const stack = new MirucaStack(new App(), 'Test', { apiCodeDir: api, webDir: web, env: { region: 'ap-northeast-1' } });
  return Template.fromStack(stack);
}

describe('MirucaStack', () => {
  const t = synth();

  it('runs the API as a Lambda Web Function behind IAM auth', () => {
    t.resourceCountIs('AWS::Lambda::WebFunction', 1);
    t.hasResourceProperties('AWS::Lambda::WebFunctionRevision', {
      BuildConfig: { RuntimeConfig: { Runtime: 'nodejs24.x' } },
    });
    t.hasResourceProperties('AWS::Lambda::WebFunctionEndpoint', { AuthType: 'IamAuth', EndpointType: 'HomeRegion' });
  });

  it('routes /api/* through CloudFront with a Lambda OAC', () => {
    t.hasResourceProperties('AWS::CloudFront::OriginAccessControl', {
      OriginAccessControlConfig: { OriginAccessControlOriginType: 'lambda', SigningBehavior: 'always-amz-auth' },
    });
    const dist = Object.values(t.findResources('AWS::CloudFront::Distribution'))[0] as any;
    const origins = dist.Properties.DistributionConfig.Origins;
    expect(origins).toHaveLength(2);
    expect(origins[0].S3OriginConfig).toBeDefined();
    expect(origins[1].CustomOriginConfig).toBeDefined();
    expect(origins[1].OriginAccessControlId).toBeDefined();
    expect(dist.Properties.DistributionConfig.CacheBehaviors[0].PathPattern).toBe('/api/*');
  });

  it('lets only CloudFront invoke the endpoint', () => {
    t.hasResourceProperties('AWS::Lambda::ResourcePolicy', {
      PolicyDocument: {
        Statement: [Match.objectLike({ Action: 'lambda:InvokeWebFunctionEndpoint', Principal: { Service: 'cloudfront.amazonaws.com' } })],
      },
    });
  });
});
