import { useEffect, useState } from 'react';
import type { Property } from '@/data/propertiesSeed';

const API_URL = import.meta.env.VITE_API_URL || '';

function mapRow(row: any): Property {
  return {
    id: row.id,
    listingType: row.listing_type,
    propertyType: row.property_type,
    listedBy: row.listed_by,
    title: row.title,
    description: row.description,
    price: row.price,
    rentPerMonth: row.rent_per_month,
    securityDeposit: row.security_deposit,
    maintenanceCharges: row.maintenance_charges,
    negotiable: row.negotiable,
    city: row.city,
    locality: row.locality,
    projectName: row.project_name,
    fullAddress: row.full_address,
    landmark: row.landmark,
    pincode: row.pincode,
    lat: row.lat,
    lng: row.lng,
    builtUpArea: row.built_up_area,
    carpetArea: row.carpet_area,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    balconies: row.balconies,
    floor: row.floor,
    totalFloors: row.total_floors,
    facing: row.facing,
    furnishing: row.furnishing,
    parking: row.parking,
    propertyAge: row.property_age,
    availabilityDate: row.availability_date,
    possessionStatus: row.possession_status,
    amenities: row.amenities ?? [],
    featuredImage: row.featured_image,
    galleryImages: row.gallery_images ?? [],
    videoUrl: row.video_url,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email,
    preferWhatsApp: row.prefer_whatsapp,
    createdAt: row.created_at,
  };
}

export function useProperties() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProperties() {
      setLoading(true);
      try {
        const res = await fetch(`${API_URL}/api/properties.php`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setProperties((data ?? []).map(mapRow));
      } catch (err: any) {
        setError(err.message);
      }
      setLoading(false);
    }

    fetchProperties();
  }, []);

  return { properties, loading, error };
}