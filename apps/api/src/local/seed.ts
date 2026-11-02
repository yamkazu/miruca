import { CreateTableCommand, DescribeTimeToLiveCommand, DynamoDBClient, UpdateTimeToLiveCommand } from '@aws-sdk/client-dynamodb';
import { CreateSecretCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import type { LocalConfig } from '../config';
import { githubAppSecretName } from '../secrets';
import { createStore, sampleEmail, tableName, ttlAttribute } from '../store';

/** Fills MiniStack with what local miruca needs. Safe to run any number of times. */
export async function seed(config: LocalConfig): Promise<void> {
  const dynamodb = new DynamoDBClient(config.aws);
  try {
    await dynamodb.send(
      new CreateTableCommand({
        TableName: tableName,
        BillingMode: 'PAY_PER_REQUEST',
        AttributeDefinitions: [
          { AttributeName: 'pk', AttributeType: 'S' },
          { AttributeName: 'sk', AttributeType: 'S' },
        ],
        KeySchema: [
          { AttributeName: 'pk', KeyType: 'HASH' },
          { AttributeName: 'sk', KeyType: 'RANGE' },
        ],
      }),
    );
  } catch (e) {
    if ((e as Error).name !== 'ResourceInUseException') throw e;
  }
  const { TimeToLiveDescription } = await dynamodb.send(new DescribeTimeToLiveCommand({ TableName: tableName }));
  if (TimeToLiveDescription?.TimeToLiveStatus !== 'ENABLED') {
    await dynamodb.send(
      new UpdateTimeToLiveCommand({ TableName: tableName, TimeToLiveSpecification: { AttributeName: ttlAttribute, Enabled: true } }),
    );
  }

  await createStore(config.aws).findOrCreateUserByEmail(sampleEmail);

  try {
    await new SecretsManagerClient(config.aws).send(
      new CreateSecretCommand({ Name: githubAppSecretName, SecretString: JSON.stringify({ dummy: 'GitHub App の値は #29 で入れる' }) }),
    );
  } catch (e) {
    if ((e as Error).name !== 'ResourceExistsException') throw e;
  }
}
