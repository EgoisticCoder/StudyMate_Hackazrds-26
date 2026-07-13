/**
 * Vercel serverless proxy for Neo4j queries
 * Browsers cannot connect directly to Neo4j AuraDB via WebSocket due to security restrictions.
 * This proxy handles Neo4j queries server-side and returns results via HTTP.
 */

const neo4j = require('neo4j-driver');

/** Convert Neo4j driver values (DateTime, Integer, etc.) to JSON-safe primitives. */
function serializeValue(value) {
  if (value === null || value === undefined) return value;
  if (neo4j.isInt(value)) return value.toNumber();
  if (typeof value === 'object') {
    if (typeof value.toString === 'function' && value.year !== undefined && value.month !== undefined) {
      const str = value.toString();
      if (str && str !== '[object Object]') return str;
    }
    if (Array.isArray(value)) return value.map(serializeValue);
    const result = {};
    for (const [key, nested] of Object.entries(value)) {
      result[key] = serializeValue(nested);
    }
    return result;
  }
  return value;
}

function resolveConfig() {
  return {
    uri: process.env.NEO4J_URI || process.env.EXPO_PUBLIC_NEO4J_URI,
    username: process.env.NEO4J_USERNAME || process.env.EXPO_PUBLIC_NEO4J_USERNAME,
    password: process.env.NEO4J_PASSWORD || process.env.EXPO_PUBLIC_NEO4J_PASSWORD,
  };
}

let driver = null;

function getDriver() {
  if (!driver) {
    const config = resolveConfig();
    if (!config.uri || !config.username || !config.password) {
      throw new Error('Neo4j credentials not configured');
    }
    driver = neo4j.driver(config.uri, neo4j.auth.basic(config.username, config.password), {
      maxConnectionLifetime: 3 * 60 * 1000,
      maxConnectionPoolSize: 10,
      connectionAcquisitionTimeout: 10 * 1000,
      disableLosslessIntegers: true,
    });
  }
  return driver;
}

async function handleQuery(cypher, params) {
  const drv = getDriver();
  
  const session = drv.session();
  try {
    // Use direct run() for both read and write to avoid access mode conflicts
    const result = await session.run(cypher, params);
    
    const records = result.records.map(record => {
      const obj = {};
      record.keys.forEach(key => {
        obj[key] = serializeValue(record.get(key));
      });
      return obj;
    });
    
    return { success: true, records, summary: result.summary };
  } finally {
    await session.close();
  }
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' && req.body ? JSON.parse(req.body) : req.body || {};
    const { cypher, params = {} } = body;

    if (!cypher) {
      return res.status(400).json({ error: 'Missing cypher query' });
    }

    const result = await handleQuery(cypher, params);
    return res.status(200).json(result);
  } catch (err) {
    console.error('Neo4j proxy error:', err);
    return res.status(500).json({ 
      error: err.message || 'Neo4j query failed',
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
};
