import 'dotenv/config';
import mysql from 'mysql2/promise';

// Credenciais só pelo ambiente (.env): nunca no código, que vai para o GitHub
for (const nome of ['MYSQL_HOST', 'MYSQL_USER', 'MYSQL_PASSWORD']) {
  if (!process.env[nome]) throw new Error(`${nome} não definido no .env.`);
}

const dbConfig: mysql.PoolOptions = {
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT) || 3306,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE || 'crmweb',
  waitForConnections: true,
  connectionLimit: 10,
  connectTimeout: 20000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  dateStrings: true,
};

export const pool = mysql.createPool(dbConfig);

// O sistema opera no horário de Brasília: NOW(), CURDATE() e os DEFAULT CURRENT_TIMESTAMP
// passam a sair em UTC-3, qualquer que seja o fuso do servidor MySQL.
pool.pool.on('connection', (conn: any) => {
  conn.query("SET time_zone = '-03:00'");
});

export const DB_TABLES = [
  'empresas',
  'pessoas',
  'funis',
  'etapas',
  'negocios',
  'atividades',
  'historico_interacoes',
  'produtos',
  'propostas',
  'proposta_itens',
  'pedidos',
  'pedido_itens',
  'usuarios',
];

export async function checkDbHealth() {
  const startTime = Date.now();
  try {
    const conn = await pool.getConnection();
    const [verResult] = await conn.query<any[]>('SELECT VERSION() as version, DATABASE() as db');
    const latency = Date.now() - startTime;

    const counts: Record<string, number> = {};
    for (const t of DB_TABLES) {
      try {
        const [res] = await conn.query<any[]>(`SELECT COUNT(*) as cnt FROM ${t}`);
        counts[t] = res[0]?.cnt ?? 0;
      } catch {
        counts[t] = 0;
      }
    }

    conn.release();

    return {
      connected: true,
      latencyMs: latency,
      version: verResult[0]?.version || 'MySQL 8.0',
      database: verResult[0]?.db || dbConfig.database,
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      tableCounts: counts,
    };
  } catch (err: any) {
    return {
      connected: false,
      latencyMs: Date.now() - startTime,
      error: err.message || 'Falha de conexão com MySQL',
      code: err.code || 'UNKNOWN',
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      database: dbConfig.database,
      tableCounts: {},
    };
  }
}
