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

  it('keeps the API code in a versioned bucket only Lambda Web Function revisions can read', () => {
    t.hasResourceProperties('AWS::S3::Bucket', { VersioningConfiguration: { Status: 'Enabled' } });
    t.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Allow',
            Principal: { Service: 'lambda.amazonaws.com' },
            Action: ['s3:GetObject', 's3:GetObjectVersion'],
            Condition: { ArnLike: { 'aws:SourceArn': Match.anyValue() } },
          }),
        ]),
      },
    });
    const revision = Object.values(t.findResources('AWS::Lambda::WebFunctionRevision'))[0] as {
      Properties: { BuildConfig: { CodeConfig: { S3Object: { Bucket: unknown; VersionId?: unknown } } } };
      DependsOn: string[];
    };
    const s3Object = revision.Properties.BuildConfig.CodeConfig.S3Object;
    expect(JSON.stringify(s3Object.Bucket)).not.toContain('cdk-hnb659fds');
    expect(s3Object.VersionId).toBeDefined();
    expect(revision.DependsOn.some((d) => d.startsWith('ApiCodeBucketPolicy'))).toBe(true);
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
