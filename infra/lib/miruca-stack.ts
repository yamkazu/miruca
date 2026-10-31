import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CfnOutput, Duration, Fn, RemovalPolicy, Stack, type StackProps, Validations } from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Asset } from 'aws-cdk-lib/aws-s3-assets';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import type { Construct } from 'constructs';

const root = (p: string) => fileURLToPath(new URL(`../../${p}`, import.meta.url));

export interface MirucaStackProps extends StackProps {
  /** Folder holding the bundled API (index.js). Default: dist/api from `npm run build`. */
  apiCodeDir?: string;
  /** Folder holding the built web app. Default: apps/web/dist from `npm run build`. */
  webDir?: string;
}

/**
 * miruca on AWS:
 *   CloudFront ─┬─ /*      → S3 (React + Vite static files, OAC)
 *               └─ /api/*  → Lambda Web Function (Hono, OAC with IamAuth)
 */
export class MirucaStack extends Stack {
  constructor(scope: Construct, id: string, props: MirucaStackProps = {}) {
    super(scope, id, props);

    const apiCodeDir = props.apiCodeDir ?? root('dist/api');
    const webDir = props.webDir ?? root('apps/web/dist');
    for (const dir of [apiCodeDir, webDir]) {
      if (!existsSync(dir)) throw new Error(`${dir} not found. Run \`npm run build\` at the repository root first.`);
    }

    // ---------- API: Lambda Web Function ----------
    const functionName = `${this.stackName}-api`;

    const role = new iam.Role(this, 'ApiRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')],
    });

    const logGroup = new logs.LogGroup(this, 'ApiLogs', {
      logGroupName: `/aws/lambda-web/${functionName}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const code = new Asset(this, 'ApiCode', { path: apiCodeDir });

    const webFunction = new lambda.CfnWebFunction(this, 'ApiFunction', { functionName });

    // A revision is immutable: a code change creates a new one, and the endpoint moves all traffic to it.
    const revision = new lambda.CfnWebFunctionRevision(this, 'ApiRevision', {
      functionName,
      description: `miruca api ${code.assetHash.slice(0, 12)}`,
      buildConfig: {
        codeConfig: { s3Object: { bucket: code.s3BucketName, key: code.s3ObjectKey } },
        runtimeConfig: { runtime: 'nodejs24.x' },
      },
      serviceConfig: {
        executionRoleArn: role.roleArn,
        timeoutSeconds: 30,
        environmentVariables: { NODE_ENV: 'production' },
        telemetryConfig: { loggingConfig: { logGroup: logGroup.logGroupName } },
      },
    });
    revision.node.addDependency(webFunction);
    revision.node.addDependency(role);
    code.grantRead(role);

    const endpoint = new lambda.CfnWebFunctionEndpoint(this, 'ApiEndpoint', {
      functionName,
      endpointName: 'prod',
      endpointType: 'HomeRegion',
      // Only requests signed by CloudFront (OAC) get through; the endpoint URL can't bypass the distribution.
      authType: 'IamAuth',
      revisionWeights: [{ revisionId: revision.attrRevisionId, weight: 100 }],
      scalingConfig: { maxEnvironments: 10 },
    });
    endpoint.node.addDependency(webFunction);

    // CloudFormation Validate in the CDK CLI doesn't know the Web Function types yet
    // (aws-cloudformation/cloudformation-validate#479); CloudFormation itself does.
    for (const c of [webFunction, revision, endpoint]) {
      Validations.of(c).acknowledge({ id: 'CloudFormation-Validate::F3006', reason: 'Lambda Web Functions types are new' });
    }

    // ---------- Web: S3 + CloudFront ----------
    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const apiOac = new cloudfront.CfnOriginAccessControl(this, 'ApiOac', {
      originAccessControlConfig: {
        name: `${this.stackName}-api-oac`,
        description: 'CloudFront → Lambda Web Function',
        originAccessControlOriginType: 'lambda',
        signingBehavior: 'always-amz-auth', // the only behavior Web Function origins support
        signingProtocol: 'sigv4', // HomeRegion endpoint; a global endpoint would need sigv4a
      },
    });

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: 'miruca',
      defaultRootObject: 'index.html',
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new origins.HttpOrigin(endpoint.attrDomainName, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
            readTimeout: Duration.seconds(30),
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
      // SPA: let the client router handle unknown paths.
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html', ttl: Duration.seconds(0) },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html', ttl: Duration.seconds(0) },
      ],
    });

    // The CDK L2 HttpOrigin has no OAC option yet, so attach it on the API origin directly.
    const cfnDistribution = distribution.node.defaultChild as cloudfront.CfnDistribution;
    const apiOriginIndex = 1; // origin 0 = S3 (default behavior), origin 1 = API
    cfnDistribution.addPropertyOverride(`DistributionConfig.Origins.${apiOriginIndex}.OriginAccessControlId`, apiOac.attrId);

    // Let only this distribution invoke the endpoint.
    new lambda.CfnResourcePolicy(this, 'ApiResourcePolicy', {
      resourceArn: endpoint.attrFunctionArn,
      policyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Sid: 'AllowCloudFrontOAC',
            Effect: 'Allow',
            Principal: { Service: 'cloudfront.amazonaws.com' },
            Action: 'lambda:InvokeWebFunctionEndpoint',
            Resource: endpoint.attrEndpointArn,
            Condition: {
              StringEquals: {
                'aws:SourceArn': Fn.sub('arn:${AWS::Partition}:cloudfront::${AWS::AccountId}:distribution/${Id}', {
                  Id: distribution.distributionId,
                }),
              },
            },
          },
        ],
      },
    });

    new s3deploy.BucketDeployment(this, 'DeploySite', {
      sources: [s3deploy.Source.asset(webDir)],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ['/*'],
    });

    new CfnOutput(this, 'Url', { value: `https://${distribution.distributionDomainName}` });
    new CfnOutput(this, 'ApiEndpointDomain', { value: endpoint.attrDomainName });
  }
}
