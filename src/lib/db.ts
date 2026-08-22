/* MySQL connection pool (lazy singleton). DATABASE_URL looks like
   mysql://user:pass@host:3306/kimi_builders. Referenced only by server
   modules; no connection at build time — the pool is created on first
   query. Timezone: every connection SETs time_zone='+00:00'
   (NOW()/CURRENT_TIMESTAMP land as UTC) and the pool parses DATETIME
   with timezone:'Z' — both ends agree, so relative time never computes
   wrong. */
import mysql from "mysql2/promise";

let pool: mysql.Pool | undefined;

export function getPool(): mysql.Pool {
  if (!pool) {
    const uri = process.env.DATABASE_URL;
    if (!uri) throw new Error("DATABASE_URL is not set");
    pool = mysql.createPool({
      uri,
      connectionLimit: 10,
      namedPlaceholders: true,
      supportBigNumbers: true,
      timezone: "Z",
    });
    pool.on("connection", (conn) => {
      conn.query("SET time_zone = '+00:00'");
    });
  }
  return pool;
}
