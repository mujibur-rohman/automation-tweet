// Koneksi Postgres tunggal via Bun.sql (driver bawaan Bun, tanpa pg/postgres.js).
import { SQL } from "bun";
import { config } from "../config";

export const sql = new SQL(config.databaseUrl);
