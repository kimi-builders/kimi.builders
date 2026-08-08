/* MySQL 连接池(惰性单例)。
   DATABASE_URL 形如 mysql://user:pass@host:3306/kimi_builders。
   只在服务端模块引用;构建期不连接,首次查询时才建池。
   时区:每条连接 SET time_zone='+00:00'(NOW()/CURRENT_TIMESTAMP 落库即 UTC),
   池端 timezone:'Z' 让 DATETIME 按 UTC 解析 —— 两端一致,relTime 才不算错。 */
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
