-- Seed data: 3 realistic sample property records
-- Run after schema.sql: mysql -u your_user -p your_database < seed.sql

INSERT INTO properties (
  id, listing_type, property_type, listed_by, title, description, price,
  rent_per_month, security_deposit, maintenance_charges, negotiable,
  city, locality, project_name, full_address, landmark, pincode,
  lat, lng, built_up_area, carpet_area, bedrooms, bathrooms, balconies,
  floor, total_floors, facing, furnishing, parking, property_age,
  availability_date, possession_status, amenities, featured_image,
  gallery_images, video_url, contact_name, contact_phone, contact_email,
  prefer_whatsapp
) VALUES
-- 1. Luxury 3BHK Apartment for sale in Gachibowli
(
  UUID(), 'sale', 'Apartment', 'Builder',
  'Luxury 3BHK in Gachibowli',
  'Spacious 3BHK apartment with modern amenities, close to IT corridor. Premium fittings, vastu compliant, and ready to move in.',
  12500000.00, NULL, NULL, NULL, TRUE,
  'Hyderabad', 'Gachibowli', 'Prestige Heights',
  'Plot 42, Gachibowli Main Road, Near Wipro Circle', 'Near Wipro Circle', '500032',
  17.4401000, 78.3489000,
  1850, 1520, 3, 3, 2, 8, 14,
  'East', 'Semi-Furnished', '2+', '0-1 years',
  NULL, 'Ready to Move',
  JSON_ARRAY('Lift', 'Power Backup', 'Security', 'Gym', 'Swimming Pool', 'Clubhouse', 'CCTV', 'Gated Community'),
  'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800',
  JSON_ARRAY(
    'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=600',
    'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=600',
    'https://images.unsplash.com/photo-1484154218962-a197022b5858?w=600'
  ),
  NULL,
  'Rajesh Kumar', '9876543210', 'rajesh@example.com', TRUE
),
-- 2. Modern 2BHK Apartment for rent in Kondapur
(
  UUID(), 'rent', 'Apartment', 'Agent',
  'Modern 2BHK for Rent in Kondapur',
  'Well-maintained 2BHK apartment available for rent near Botanical Garden. Ideal for IT professionals. Recently painted with modular kitchen.',
  25000.00, 25000.00, 100000.00, 3000.00, TRUE,
  'Hyderabad', 'Kondapur', NULL,
  'Flat 501, Sri Sai Residency, Kondapur Main Road', 'Near Botanical Garden', '500084',
  17.4577000, 78.3556000,
  1200, 980, 2, 2, 1, 5, 12,
  'South', 'Semi-Furnished', '1', '1-5 years',
  '2026-05-01', 'Ready to Move',
  JSON_ARRAY('Lift', 'Power Backup', 'Security', 'Gym', 'CCTV', 'Gated Community', 'Visitor Parking'),
  'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800',
  JSON_ARRAY(
    'https://images.unsplash.com/photo-1560185893-a55cbc8c57e8?w=600',
    'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=600'
  ),
  NULL,
  'Priya Agents', '9876543212', NULL, TRUE
),
-- 3. Premium Villa for sale in Jubilee Hills
(
  UUID(), 'sale', 'Villa', 'Owner',
  'Premium Villa in Jubilee Hills',
  'Elegant 4BHK independent villa with private garden, modular kitchen, and premium interiors in the heart of Jubilee Hills. Teak wood flooring throughout.',
  45000000.00, NULL, NULL, NULL, FALSE,
  'Hyderabad', 'Jubilee Hills', NULL,
  'Road No. 36, Jubilee Hills', 'Near KBR Park', '500033',
  17.4319000, 78.4073000,
  4200, 3800, 4, 5, 3, NULL, 3,
  'North-East', 'Fully Furnished', '2+', '1-5 years',
  NULL, 'Ready to Move',
  JSON_ARRAY('Power Backup', 'Security', 'Gym', 'Swimming Pool', 'Park', 'CCTV', 'Gated Community', 'Servant Room'),
  'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800',
  JSON_ARRAY(
    'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=600',
    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=600'
  ),
  NULL,
  'Suresh Reddy', '9876543211', 'suresh.reddy@gmail.com', FALSE
);
