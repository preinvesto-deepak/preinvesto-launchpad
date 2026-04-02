import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';

const app = express();
const port = process.env.API_PORT || 3001;

app.use(cors());
app.use(express.json());

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT) || 3306,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,
});

// GET /api/properties — return all properties ordered by newest first
app.get('/api/properties', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM properties ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (err) {
    console.error('Failed to fetch properties:', err.message);
    res.status(500).json({ error: 'Failed to fetch properties' });
  }
});

app.listen(port, () => {
  console.log(`API server running on http://localhost:${port}`);
});
