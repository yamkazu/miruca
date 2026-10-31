import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { collect, splitList, storeFromEnv } from '@miruca/core';

const secrets = new SecretsManagerClient({});

/** Scheduled Lambda (EventBridge Scheduler): pulls GitHub data into S3. */
export async function handler() {
  const secretId = process.env.GITHUB_TOKEN_SECRET_ARN;
  if (!secretId) throw new Error('GITHUB_TOKEN_SECRET_ARN is not set');
  const secret = await secrets.send(new GetSecretValueCommand({ SecretId: secretId }));
  const token = secret.SecretString?.trim();
  if (!token) throw new Error('GitHub token secret is empty. Put a token into the secret first.');

  const results = await collect({
    token,
    store: storeFromEnv(),
    repos: splitList(process.env.MIRUCA_REPOS),
    owners: splitList(process.env.MIRUCA_OWNERS),
    lookbackDays: Number(process.env.MIRUCA_LOOKBACK_DAYS) || undefined,
  });
  const failed = results.filter((r) => r.error);
  if (failed.length === results.length) throw new Error(`All repositories failed: ${failed.map((f) => `${f.repo}: ${f.error}`).join('; ')}`);
  return { results };
}
