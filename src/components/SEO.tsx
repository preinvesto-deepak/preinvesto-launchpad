import { Helmet } from "react-helmet-async";

interface SEOProps {
  title?: string;
  description?: string;
  canonical?: string;
  ogImage?: string;
  type?: string;
  jsonLd?: object | object[];
}

const SITE_NAME = "Preinvesto Interiors";
const DEFAULT_DESCRIPTION = "Preinvesto Interiors – Your trusted partner for affordable property search, quality construction, and stunning interior design in Hyderabad.";

const SEO = ({ title, description, canonical, ogImage, type = "website", jsonLd }: SEOProps) => {
  const fullTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} – Property Search, Construction & Interior Design in Hyderabad`;
  const desc = description || DEFAULT_DESCRIPTION;
  const url = canonical || "https://preinvesto.com";

  const schemas = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={desc} />
      <link rel="canonical" href={url} />

      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={desc} />
      <meta property="og:type" content={type} />
      <meta property="og:url" content={url} />
      {ogImage && <meta property="og:image" content={ogImage} />}
      <meta property="og:site_name" content={SITE_NAME} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={desc} />

      {schemas.map((schema, i) => (
        <script key={i} type="application/ld+json">
          {JSON.stringify(schema)}
        </script>
      ))}
    </Helmet>
  );
};

export default SEO;

export const localBusinessSchema = {
  "@context": "https://schema.org",
  "@type": "HomeAndConstructionBusiness",
  name: "Preinvesto Interiors",
  url: "https://preinvesto.com",
  telephone: "+919030982932",
  email: "info@preinvesto.com",
  hasMap: "https://maps.app.goo.gl/J1WbV1puYZsgPWMWA",
  address: {
    "@type": "PostalAddress",
    addressLocality: "Hyderabad",
    addressRegion: "Telangana",
    addressCountry: "IN",
  },
  sameAs: ["#", "#", "#", "#"],
  areaServed: {
    "@type": "City",
    name: "Hyderabad",
  },
};

export const breadcrumbSchema = (items: { name: string; url: string }[]) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map((item, i) => ({
    "@type": "ListItem",
    position: i + 1,
    name: item.name,
    item: item.url,
  })),
});
