import { createClient } from 'redis';
import { logger } from '../utils/logger';

// REDIS_URL (Upstash-style hosted Redis, rediss:// = TLS) takes over when set
// — the discrete host/port fields below stay the default for docker-compose.
const redisClient = process.env.REDIS_URL
  ? createClient({ url: process.env.REDIS_URL })
  : createClient({
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
      password: process.env.REDIS_PASSWORD || undefined,
    });

redisClient.on('error', (err) => logger.error('Redis Client Error', err));
redisClient.on('connect', () => logger.info('✅ Redis connected successfully'));

export const connectRedis = async (): Promise<void> => {
  await redisClient.connect();
};

export const setCache = async (key: string, value: unknown, ttlSeconds = 3600): Promise<void> => {
  await redisClient.setEx(key, ttlSeconds, JSON.stringify(value));
};

export const getCache = async <T>(key: string): Promise<T | null> => {
  const data = await redisClient.get(key);
  return data ? (JSON.parse(data) as T) : null;
};

export const deleteCache = async (key: string): Promise<void> => {
  await redisClient.del(key);
};

export const deleteCacheByPattern = async (pattern: string): Promise<void> => {
  const keys = await redisClient.keys(pattern);
  if (keys.length > 0) {
    await redisClient.del(keys);
  }
};

export default redisClient;
