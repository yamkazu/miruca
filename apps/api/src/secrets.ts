import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import type { AwsClientConfig } from './config';

/** The GitHub App's values. Locally the seed puts a dummy here; #29 starts using it. */
export const githubAppSecretName = 'miruca/github-app';

export async function readSecret(aws: AwsClientConfig, name: string): Promise<string> {
  const { SecretString } = await new SecretsManagerClient(aws).send(new GetSecretValueCommand({ SecretId: name }));
  if (SecretString === undefined) throw new Error(`Secrets Manager の ${name} に文字列の値がありません`);
  return SecretString;
}
