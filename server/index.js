import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.API_PORT || 3001;

app.use(cors());
app.use(express.json());

// Serve uploaded images as static files in dev
const uploadsDir = path.join(__dirname, '../public/uploads/properties');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// Multer: save uploads to public/uploads/properties/
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const name = `${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 15)}_${crypto.randomBytes(4).toString('hex')}${ext}`;
    cb(null, name);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  },
});

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

// ---------------------------------------------------------------------------
// GET /api/properties — list all properties (newest first)
// Also handles /api/properties.php (proxied by Vite in dev)
// ---------------------------------------------------------------------------
app.get(['/api/properties', '/api/properties.php'], async (_req, res) => {
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

// ---------------------------------------------------------------------------
// GET /api/properties/:id — get a single property by id
// ---------------------------------------------------------------------------
app.get('/api/properties/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM properties WHERE id = ?',
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Property not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('Failed to fetch property:', err.message);
    res.status(500).json({ error: 'Failed to fetch property' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/upload_image.php — upload a property image (dev mirror of PHP)
// ---------------------------------------------------------------------------
app.post('/api/upload_image.php', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image uploaded or invalid file type' });
  }
  res.json({ url: `/uploads/properties/${req.file.filename}` });
});

// ---------------------------------------------------------------------------
// POST /api/add_property.php — insert property (dev mirror of PHP)
// Also handles /api/properties for backward compatibility
// ---------------------------------------------------------------------------
async function insertProperty(b, res) {
  const id = crypto.randomUUID();
  try {
    await pool.query(
      `INSERT INTO properties (
        id, listing_type, property_type, listed_by, title, description, price,
        rent_per_month, security_deposit, maintenance_charges, negotiable,
        city, locality, project_name, full_address, landmark, pincode,
        lat, lng, built_up_area, carpet_area, bedrooms, bathrooms, balconies,
        floor, total_floors, facing, furnishing, parking, property_age,
        availability_date, possession_status, amenities, featured_image,
        gallery_images, video_url, contact_name, contact_phone, contact_email,
        prefer_whatsapp
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?
      )`,
      [
        id,
        b.listing_type,        b.property_type,
        b.listed_by,           b.title,
        b.description,         b.price,
        b.rent_per_month       ?? null,
        b.security_deposit     ?? null,
        b.maintenance_charges  ?? null,
        b.negotiable           ?? false,
        b.city,                b.locality,
        b.project_name         ?? null,
        b.full_address         ?? null,
        b.landmark             ?? null,
        b.pincode              ?? null,
        b.lat                  ?? null,
        b.lng                  ?? null,
        b.built_up_area,
        b.carpet_area          ?? null,
        b.bedrooms             ?? null,
        b.bathrooms            ?? null,
        b.balconies            ?? null,
        b.floor                ?? null,
        b.total_floors         ?? null,
        b.facing               ?? null,
        b.furnishing,          b.parking,
        b.property_age,
        b.availability_date    ?? null,
        b.possession_status,
        JSON.stringify(b.amenities      ?? []),
        b.featured_image,
        JSON.stringify(b.gallery_images ?? []),
        b.video_url            ?? null,
        b.contact_name,        b.contact_phone,
        b.contact_email        ?? null,
        b.prefer_whatsapp      ?? false,
      ]
    );
    res.status(201).json({ success: true, id });
  } catch (err) {
    console.error('Failed to create property:', err.message);
    res.status(500).json({ error: 'Failed to create property' });
  }
}

app.post(['/api/add_property.php', '/api/properties'], (req, res) => {
  insertProperty(req.body, res);
});

app.listen(port, () => {
  console.log(`API server running on http://localhost:${port}`);
});
