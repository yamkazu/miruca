import { randomBytes, randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { AwsClientConfig } from './config';

export interface User {
  userId: string;
  email: string;
}

export interface Session {
  sessionId: string;
  userId: string;
  expiresAt: string;
}

/** Every kind of item lives in this one table, told apart by its keys (pk, sk). */
export const tableName = 'miruca';
/** Epoch seconds. DynamoDB deletes the item some time after this passes. */
export const ttlAttribute = 'ttl';

/** The user the local-only login and the seed use by default. */
export const sampleEmail = 'sample@miruca.local';

const sessionLifetimeMs = 14 * 24 * 60 * 60 * 1000;

const userKey = (userId: string) => ({ pk: `USER#${userId}`, sk: 'USER' });
const emailKey = (email: string) => ({ pk: `EMAIL#${email}`, sk: 'EMAIL' });
const sessionKey = (sessionId: string) => ({ pk: `SESSION#${sessionId}`, sk: 'SESSION' });

export function createStore(aws: AwsClientConfig) {
  const db = DynamoDBDocumentClient.from(new DynamoDBClient(aws));

  async function userIdByEmail(email: string): Promise<string | undefined> {
    const { Item } = await db.send(new GetCommand({ TableName: tableName, Key: emailKey(email) }));
    return Item?.userId;
  }

  return {
    async findOrCreateUserByEmail(email: string): Promise<User> {
      const existing = await userIdByEmail(email);
      if (existing) return { userId: existing, email };
      const user: User = { userId: randomUUID(), email };
      try {
        await db.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Put: {
                  TableName: tableName,
                  Item: { ...emailKey(email), userId: user.userId },
                  ConditionExpression: 'attribute_not_exists(pk)',
                },
              },
              { Put: { TableName: tableName, Item: { ...userKey(user.userId), ...user } } },
            ],
          }),
        );
        return user;
      } catch (e) {
        if ((e as Error).name !== 'TransactionCanceledException') throw e;
        // Someone else created this email's user between our read and write.
        const winner = await userIdByEmail(email);
        if (!winner) throw e;
        return { userId: winner, email };
      }
    },

    async createSession(userId: string, now: Date): Promise<Session> {
      const expires = new Date(now.getTime() + sessionLifetimeMs);
      const session: Session = { sessionId: randomBytes(32).toString('base64url'), userId, expiresAt: expires.toISOString() };
      await db.send(
        new PutCommand({
          TableName: tableName,
          Item: { ...sessionKey(session.sessionId), ...session, [ttlAttribute]: Math.floor(expires.getTime() / 1000) },
          ConditionExpression: 'attribute_not_exists(pk)',
        }),
      );
      return session;
    },

    /** TTL deletes lazily, so an expired session can still be read: the expiresAt check is what ends it. */
    async userBySession(sessionId: string, now: Date): Promise<User | null> {
      const { Item: session } = await db.send(new GetCommand({ TableName: tableName, Key: sessionKey(sessionId) }));
      if (!session || new Date(session.expiresAt) <= now) return null;
      const { Item: user } = await db.send(new GetCommand({ TableName: tableName, Key: userKey(session.userId) }));
      return user ? { userId: user.userId, email: user.email } : null;
    },

    async deleteSession(sessionId: string): Promise<void> {
      await db.send(new DeleteCommand({ TableName: tableName, Key: sessionKey(sessionId) }));
    },
  };
}
