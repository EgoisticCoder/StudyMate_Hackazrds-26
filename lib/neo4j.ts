// Neo4j AuraDB client — all queries go through the HTTP proxy (server.js locally,
// api/neo4j.js on Vercel). Bolt is a binary protocol; browsers and React Native's
// WebSocket-based driver bundle can't reliably reach AuraDB directly over it (see
// api/neo4j.js), so every platform is proxied rather than just web.
import { Platform } from 'react-native';
import { getProxyBaseUrl } from './apiKeys';

// Shape returned by the proxy: plain objects, not driver Record instances.
// (Screens already defensively check `typeof r.get === 'function'` before
// falling back to direct property access — that fallback is what's exercised here.)
export type Neo4jRecord = Record<string, any>;

function getProxyUrl(): string {
  return `${getProxyBaseUrl()}/api/neo4j`;
}

// Storage: SecureStore (mobile) / localStorage (web)
export async function getStoredValue(key: string): Promise<string | null> {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn('localStorage getItem failed:', e);
      return null;
    }
  }
  try {
    const SecureStore = require('expo-secure-store');
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function setStoredValue(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.error('localStorage setItem failed:', e);
    }
    return;
  }
  try {
    const SecureStore = require('expo-secure-store');
    await SecureStore.setItemAsync(key, value);
  } catch {
    // Fallback — ignore
  }
}

export async function deleteStoredValue(key: string): Promise<void> {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.error('localStorage removeItem failed:', e);
    }
    return;
  }
  try {
    const SecureStore = require('expo-secure-store');
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Fallback
  }
}

// Production-grade timeout accounting for Render free-tier cold starts (can take 30-50s)
const RENDER_COLD_START_TIMEOUT_MS = 60000; // 60 seconds
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 2000;

// Mock mode - return empty results instantly when Neo4j is unreachable
const MOCK_MODE = process.env.EXPO_PUBLIC_NEO4J_MOCK_MODE === 'true';

/**
 * Resilient fetch with exponential backoff to handle Render cold starts and transient failures
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = MAX_RETRIES,
  delay = INITIAL_RETRY_DELAY_MS
): Promise<Response> {
  try {
    const response = await fetch(url, options);
    if (!response.ok && retries > 0 && (response.status === 502 || response.status === 503 || response.status === 504)) {
      // Retry on gateway errors (common during cold start)
      console.warn(`Backend returned ${response.status}. Retrying in ${delay}ms... (${retries} attempts left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchWithRetry(url, options, retries - 1, delay * 2);
    }
    return response;
  } catch (error: any) {
    if (retries > 0 && error.name !== 'AbortError') {
      console.warn(`Network error: ${error.message}. Retrying in ${delay}ms... (${retries} attempts left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchWithRetry(url, options, retries - 1, delay * 2);
    }
    throw error;
  }
}

async function proxyRun(
  cypher: string,
  params: Record<string, any>,
  signal?: AbortSignal
): Promise<Neo4jRecord[]> {
  // Mock mode bypass — instant empty response
  if (MOCK_MODE) {
    console.log('[Neo4j Mock] Query bypassed:', cypher.slice(0, 60));
    return [];
  }

  const proxyUrl = getProxyUrl();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RENDER_COLD_START_TIMEOUT_MS);

  if (signal) {
    signal.addEventListener('abort', () => controller.abort());
    if (signal.aborted) controller.abort();
  }

  try {
    const response = await fetchWithRetry(proxyUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
      },
      body: JSON.stringify({ cypher, params }),
      signal: controller.signal,
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}: ${response.statusText}`);
    }
    return data.records as Neo4jRecord[];
  } catch (error: any) {
    const isTimeout = error?.name === 'AbortError';
    console.error(`[Neo4j Error] Proxy: ${proxyUrl}`, {
      error: error.message,
      type: isTimeout ? 'timeout' : error.name || 'unknown',
      timestamp: new Date().toISOString(),
    });

    // Production-friendly error messages (no dev-only instructions)
    if (isTimeout) {
      throw new Error('Database connection timed out. The server may be waking up, please try again in a moment.');
    }
    throw new Error('Database temporarily unavailable. Please check your internet connection and try again.');
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Initialize the Neo4j connection. There's no persistent client-side driver anymore —
 * this just verifies the proxy is reachable, kept for backward-compat call sites.
 */
export async function initNeo4j(): Promise<boolean> {
  try {
    await proxyRun('RETURN 1 AS ok', {});
    return true;
  } catch (error) {
    console.error('Neo4j init (proxy check) failed:', error);
    return false;
  }
}

/**
 * Run a read query with parameters.
 */
export async function readQuery(
  cypher: string,
  params: Record<string, any> = {},
  signal?: AbortSignal
): Promise<Neo4jRecord[]> {
  return proxyRun(cypher, params, signal);
}

/**
 * Run a write query with parameters.
 */
export async function writeQuery(
  cypher: string,
  params: Record<string, any> = {},
  signal?: AbortSignal
): Promise<Neo4jRecord[]> {
  return proxyRun(cypher, params, signal);
}

/**
 * Run multiple queries in a single transaction.
 * (Proxy runs each statement sequentially over HTTP; not atomic across the batch —
 * same behavior as before this file was unified.)
 */
export async function writeTransaction(
  queries: Array<{ cypher: string; params: Record<string, any> }>
): Promise<void> {
  for (const q of queries) {
    await proxyRun(q.cypher, q.params);
  }
}

/**
 * Test connection — returns true if the proxy + Neo4j are reachable.
 */
export async function testConnection(): Promise<boolean> {
  return initNeo4j();
}

/**
 * No-op: kept for backward-compat call sites. There's no persistent client-side
 * driver/connection to close anymore — every query is a discrete HTTP call.
 */
export async function closeNeo4j(): Promise<void> {
  // Intentionally empty.
}

/**
 * Remove a student and owned learning subgraph (best-effort per known labels).
 */
export async function deleteStudentCascade(studentId: string): Promise<void> {
  const steps = [
    `MATCH (:Student {id:$studentId})-[:ATTEMPTED]->(n:Quiz) DETACH DELETE n`,
    `MATCH (:Student {id:$studentId})-[:HAS_RELATIONSHIP]->(n:SubjectRelationship) DETACH DELETE n`,
    `MATCH (:Student {id:$studentId})-[:HAS_EXAM]->(n:Exam) DETACH DELETE n`,
    `MATCH (:Student {id:$studentId})-[:STUDIED]->(n:StudySession) DETACH DELETE n`,
    `MATCH (:Student {id:$studentId})-[:LOGGED_MOOD]->(n:MoodLog) DETACH DELETE n`,
    `MATCH (:Student {id:$studentId})-[:SUBMITTED]->(n:AnswerSubmission) DETACH DELETE n`,
    `MATCH (:Student {id:$studentId})-[:TOOK_DIAGNOSTIC]->(:DiagnosticRun)-[:HAS_ATTEMPT]->(a:DiagnosticAttempt) DETACH DELETE a`,
    `MATCH (:Student {id:$studentId})-[:TOOK_DIAGNOSTIC]->(r:DiagnosticRun) DETACH DELETE r`,
    `MATCH (:Student {id:$studentId})-[:HAS_STUDY_PLAN]->(n:StudyPlan) DETACH DELETE n`,
    `MATCH (:Student {id:$studentId})-[:LOGGED_DOUBT]->(n:DoubtSession) DETACH DELETE n`,
    `MATCH (:Student {id:$studentId})-[:HAS_TIMETABLE_SLOT]->(n:TimetableSlot) DETACH DELETE n`,
    `MATCH (:Student {id:$studentId})-[:COMPLETED_REVIEW]->(n:ReviewSession) DETACH DELETE n`,
    `MATCH (:Student {id:$studentId})-[:TOOK_BASELINE]->(n:BaselineTest) DETACH DELETE n`,
    `MATCH (s:Student {id:$studentId}) DETACH DELETE s`,
  ];
  for (const cypher of steps) {
    await writeQuery(cypher, { studentId });
  }
}

/**
 * Reset all student progress while keeping their profile (Student node, board/class, etc.) intact.
 */
export async function resetStudentProgress(studentId: string): Promise<void> {
  const steps = [
    `MATCH (:Student {id:$studentId})-[:ATTEMPTED]->(n:Quiz) DETACH DELETE n`,
    `MATCH (:Student {id:$studentId})-[:HAS_RELATIONSHIP]->(n:SubjectRelationship) DETACH DELETE n`,
    `MATCH (:Student {id:$studentId})-[:HAS_EXAM]->(n:Exam) DETACH DELETE n`,
    `MATCH (:Student {id:$studentId})-[:STUDIED]->(n:StudySession) DETACH DELETE n`,
    `MATCH (:Student {id:$studentId})-[:LOGGED_MOOD]->(n:MoodLog) DETACH DELETE n`,
    `MATCH (:Student {id:$studentId})-[:SUBMITTED]->(n:AnswerSubmission) DETACH DELETE n`,
    `MATCH (:Student {id:$studentId})-[:TOOK_DIAGNOSTIC]->(:DiagnosticRun)-[:HAS_ATTEMPT]->(a:DiagnosticAttempt) DETACH DELETE a`,
    `MATCH (:Student {id:$studentId})-[:TOOK_DIAGNOSTIC]->(r:DiagnosticRun) DETACH DELETE r`,
    `MATCH (:Student {id:$studentId})-[:HAS_STUDY_PLAN]->(n:StudyPlan) DETACH DELETE n`,
    `MATCH (:Student {id:$studentId})-[:LOGGED_DOUBT]->(n:DoubtSession) DETACH DELETE n`,
    `MATCH (:Student {id:$studentId})-[:HAS_TIMETABLE_SLOT]->(n:TimetableSlot) DETACH DELETE n`,
    `MATCH (:Student {id:$studentId})-[:COMPLETED_REVIEW]->(n:ReviewSession) DETACH DELETE n`,
    `MATCH (:Student {id:$studentId})-[:TOOK_BASELINE]->(n:BaselineTest) DETACH DELETE n`,
  ];
  for (const cypher of steps) {
    await writeQuery(cypher, { studentId });
  }
}

/**
 * Helper to safely extract a property from a Neo4j node or record.
 * Handles both plain objects (proxy/web) and driver Node/Record objects.
 */
export function getRecordField<T = any>(record: any, key: string): T {
  if (!record) return undefined as any;
  if (typeof record.get === 'function') {
    try {
      return record.get(key);
    } catch {
      // Fall through to object property access
    }
  }
  return record[key];
}
