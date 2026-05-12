/**
 * Upstash Redis (Vercel KV) 客户端
 *
 * 用于 v2.0 跨设备协同：把 trip state 存到 Redis，让不同设备/手机/浏览器
 * 通过同一个 trip_id 实时同步选择。
 *
 * 环境变量在 Vercel 集成 Upstash for Redis 时自动注入：
 *   - KV_REST_API_URL
 *   - KV_REST_API_TOKEN
 */
import { Redis } from "@upstash/redis";

let _redis: Redis | null = null;

export function getRedis(): Redis | null {
  if (_redis) return _redis;
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    // 本地开发可能没配 KV，返回 null 让调用方降级
    return null;
  }
  _redis = new Redis({ url, token });
  return _redis;
}

/** trip state 的 Redis key */
export function tripKey(tripId: string): string {
  return `trip:${tripId}`;
}

/** 默认 TTL：30 天（够旅行规划周期） */
export const TRIP_TTL_SECONDS = 30 * 24 * 3600;
