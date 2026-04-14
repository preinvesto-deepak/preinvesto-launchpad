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
      `SELECT * FROM properties
       WHERE review_status != 'rejected'
         AND status != 'expired'
         AND (
               status = 'available'
               OR (status IN ('sold','rented') AND sold_at IS NOT NULL AND sold_at >= DATE_SUB(NOW(), INTERVAL 90 DAY))
             )
       ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error('Failed to fetch properties:', err.code, err.message, err.sqlMessage);
    res.status(500).json({ error: 'Failed to fetch properties', detail: err.message });
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
        prefer_whatsapp,
        property_category, is_new_project,
        plot_length, plot_width, plot_area, ownership, facing_road_width,
        boundary_wall, electricity_connection, water_supply, sewage_connection, floors_allowed
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?,
        ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?
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
        b.property_category    ?? null,
        b.is_new_project       ?? false,
        b.plot_length          ?? null,
        b.plot_width           ?? null,
        b.plot_area            ?? null,
        b.ownership            ?? null,
        b.facing_road_width    ?? null,
        b.boundary_wall        ?? null,
        b.electricity_connection ?? false,
        b.water_supply         ?? false,
        b.sewage_connection    ?? false,
        b.floors_allowed       ?? null,
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

// ---------------------------------------------------------------------------
// POST /api/admin_login.php — verify admin PIN
// ---------------------------------------------------------------------------
app.post(['/api/admin_login', '/api/admin_login.php'], (req, res) => {
  const { pin } = req.body;
  if (!pin) return res.status(400).json({ success: false, error: 'Missing PIN' });
  if (!process.env.ADMIN_PIN) return res.status(500).json({ success: false, error: 'ADMIN_PIN not configured' });
  if (pin === process.env.ADMIN_PIN) {
    return res.json({ success: true });
  }
  res.status(401).json({ success: false, error: 'Incorrect PIN' });
});

// ---------------------------------------------------------------------------
// GET /api/sold_properties.php — latest 50 sold or rented
// ---------------------------------------------------------------------------
app.get(['/api/sold_properties', '/api/sold_properties.php'], async (_req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM properties WHERE status IN ('sold','rented') ORDER BY created_at DESC LIMIT 50"
    );
    res.json(rows);
  } catch (err) {
    console.error('Failed to fetch sold properties:', err.message);
    res.status(500).json({ error: 'Failed to fetch sold properties' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/update_status.php — update property listing status
// ---------------------------------------------------------------------------
app.post(['/api/update_status', '/api/update_status.php'], async (req, res) => {
  const { id, status } = req.body;
  if (!id || !status) return res.status(400).json({ error: 'Missing id or status' });
  const allowed = ['available', 'sold', 'rented'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  try {
    const isSoldRented = ['sold', 'rented'].includes(status);
    const [result] = await pool.query(
      isSoldRented
        ? 'UPDATE properties SET status = ?, sold_at = NOW() WHERE id = ?'
        : 'UPDATE properties SET status = ?, sold_at = NULL WHERE id = ?',
      [status, id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Property not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to update status:', err.message);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/admin_review_properties.php — all properties for admin review
// ---------------------------------------------------------------------------
app.get(['/api/admin_review_properties', '/api/admin_review_properties.php'], async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM properties ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    console.error('Failed to fetch admin properties:', err.message);
    res.status(500).json({ error: 'Failed to fetch properties' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/update_review.php — update review_status (approve/reject/flag)
// ---------------------------------------------------------------------------
app.post(['/api/update_review', '/api/update_review.php'], async (req, res) => {
  const { id, review_status } = req.body;
  if (!id || !review_status) return res.status(400).json({ error: 'Missing id or review_status' });
  const allowed = ['pending', 'approved', 'rejected', 'flagged'];
  if (!allowed.includes(review_status)) return res.status(400).json({ error: 'Invalid review_status' });
  try {
    const [result] = await pool.query('UPDATE properties SET review_status = ? WHERE id = ?', [review_status, id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Property not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to update review status:', err.message);
    res.status(500).json({ error: 'Failed to update review status' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/cron_expire_sold.php — expire sold/rented older than 90 days
// ---------------------------------------------------------------------------
app.get(['/api/cron_expire_sold', '/api/cron_expire_sold.php'], async (req, res) => {
  if (req.query.key !== process.env.CRON_SECRET) return res.status(403).json({ error: 'Forbidden' });
  try {
    const [result] = await pool.query(
      `UPDATE properties SET status = 'expired'
       WHERE status IN ('sold','rented')
         AND sold_at IS NOT NULL
         AND sold_at < DATE_SUB(NOW(), INTERVAL 90 DAY)`
    );
    res.json({ success: true, expired: result.affectedRows, ran_at: new Date().toISOString() });
  } catch (err) {
    console.error('Cron failed:', err.message);
    res.status(500).json({ error: 'Cron failed' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/delete_property.php — permanently delete a property
// ---------------------------------------------------------------------------
app.post(['/api/delete_property', '/api/delete_property.php'], async (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'Missing id' });
  try {
    const [result] = await pool.query('DELETE FROM properties WHERE id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Property not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete property:', err.message);
    res.status(500).json({ error: 'Failed to delete property' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/update_property.php — update all fields of an existing property
// ---------------------------------------------------------------------------
app.post(['/api/update_property', '/api/update_property.php'], async (req, res) => {
  const b = req.body;
  if (!b.id) return res.status(400).json({ error: 'Missing id' });
  try {
    const [result] = await pool.query(
      `UPDATE properties SET
        listing_type=?, property_type=?, listed_by=?, title=?, description=?,
        price=?, rent_per_month=?, security_deposit=?, maintenance_charges=?, negotiable=?,
        city=?, locality=?, project_name=?, full_address=?, landmark=?, pincode=?,
        lat=?, lng=?, built_up_area=?, carpet_area=?, bedrooms=?, bathrooms=?,
        balconies=?, floor=?, total_floors=?, facing=?, furnishing=?, parking=?,
        property_age=?, availability_date=?, possession_status=?, amenities=?,
        featured_image=?, gallery_images=?, video_url=?, contact_name=?,
        contact_phone=?, contact_email=?, prefer_whatsapp=?,
        property_category=?, is_new_project=?,
        plot_length=?, plot_width=?, plot_area=?, ownership=?, facing_road_width=?,
        boundary_wall=?, electricity_connection=?, water_supply=?, sewage_connection=?, floors_allowed=?
      WHERE id=?`,
      [
        b.listing_type,       b.property_type,      b.listed_by,
        b.title,              b.description,         b.price,
        b.rent_per_month      ?? null,
        b.security_deposit    ?? null,
        b.maintenance_charges ?? null,
        b.negotiable          ?? false,
        b.city,               b.locality,
        b.project_name        ?? null,
        b.full_address        ?? null,
        b.landmark            ?? null,
        b.pincode             ?? null,
        b.lat                 ?? null,
        b.lng                 ?? null,
        b.built_up_area,
        b.carpet_area         ?? null,
        b.bedrooms            ?? null,
        b.bathrooms           ?? null,
        b.balconies           ?? null,
        b.floor               ?? null,
        b.total_floors        ?? null,
        b.facing              ?? null,
        b.furnishing,         b.parking,
        b.property_age,
        b.availability_date   ?? null,
        b.possession_status,
        JSON.stringify(b.amenities      ?? []),
        b.featured_image,
        JSON.stringify(b.gallery_images ?? []),
        b.video_url           ?? null,
        b.contact_name,       b.contact_phone,
        b.contact_email       ?? null,
        b.prefer_whatsapp     ?? false,
        b.property_category   ?? null,
        b.is_new_project      ?? false,
        b.plot_length         ?? null,
        b.plot_width          ?? null,
        b.plot_area           ?? null,
        b.ownership           ?? null,
        b.facing_road_width   ?? null,
        b.boundary_wall       ?? null,
        b.electricity_connection ?? false,
        b.water_supply        ?? false,
        b.sewage_connection   ?? false,
        b.floors_allowed      ?? null,
        b.id,
      ]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Property not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to update property:', err.code, err.message, err.sqlMessage);
    res.status(500).json({ error: 'Failed to update property', detail: err.message });
  }
});

app.listen(port, () => {
  console.log(`API server running on http://localhost:${port}`);
});
