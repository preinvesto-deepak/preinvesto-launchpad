import propertySearchImg from "@/assets/property-search.jpg";
import constructionImg from "@/assets/construction.jpg";
import interiorDesignImg from "@/assets/interior-design.jpg";
import heroImg from "@/assets/hero-living-room.jpg";
import kitchenImg from "@/assets/portfolio-kitchen.jpg";
import bathroomImg from "@/assets/portfolio-bathroom.jpg";
import livingImg from "@/assets/portfolio-living.jpg";
import officeImg from "@/assets/portfolio-office.jpg";
import villaImg from "@/assets/portfolio-villa.jpg";
import bedroomImg from "@/assets/portfolio-bedroom.jpg";

export const BRAND = {
  name: "Preinvesto Interiors",
  shortName: "Preinvesto",
  phone: "+91 9030982932",
  phone2: "+91 8985897705",
  email: "info@preinvesto.com",
  url: "https://preinvesto.com",
  whatsappLink:
    "https://wa.me/919030982932?text=Hi%2C%20I'm%20interested%20to%20know%20more%20about%20it%20%3A%20https%3A%2F%2Fpreinvesto.com%2F",
  mapsLink: "https://maps.app.goo.gl/J1WbV1puYZsgPWMWA",
  address: "Hyderabad, Telangana, India",
  social: {
    instagram: "#",
    facebook: "#",
    youtube: "#",
    linkedin: "#",
  },
};

export const IMAGES = {
  hero: heroImg,
  propertySearch: propertySearchImg,
  construction: constructionImg,
  interiorDesign: interiorDesignImg,
  portfolioKitchen: kitchenImg,
  portfolioBathroom: bathroomImg,
  portfolioLiving: livingImg,
  portfolioOffice: officeImg,
  portfolioVilla: villaImg,
  portfolioBedroom: bedroomImg,
};

export const NAV_ITEMS = [
  { label: "Home", path: "/" },
  { label: "About Us", path: "/about" },
  {
    label: "Services",
    path: "/services",
    children: [
      { label: "Affordable Property Search", path: "/services/property-search" },
      { label: "Property Construction", path: "/services/construction" },
      { label: "Interior Design", path: "/services/interior-design" },
      { label: "Properties", path: "/properties" },
    ],
  },
  { label: "Portfolio", path: "/portfolio" },
  { label: "Blogs", path: "/blog" },
  { label: "Gallery", path: "/gallery" },
  
];

export const JOURNEY_STEPS = [
  {
    step: 1,
    title: "Property Search",
    description: "Find your dream home at an affordable price with our curated property listings and expert guidance.",
    icon: "Search",
    link: "/services/property-search",
  },
  {
    step: 2,
    title: "Construction",
    description: "Build your vision from the ground up with quality materials and experienced construction teams.",
    icon: "Building2",
    link: "/services/construction",
  },
  {
    step: 3,
    title: "Interior Design",
    description: "Transform your space with stunning interiors tailored to your lifestyle and preferences.",
    icon: "Palette",
    link: "/services/interior-design",
  },
  {
    step: 4,
    title: "Handover",
    description: "Move into your perfectly finished home—on time, on budget, and beyond expectations.",
    icon: "KeyRound",
    link: "/contact",
  },
];

export const SERVICES = [
  {
    title: "Affordable Property Search",
    slug: "property-search",
    description: "We help you discover the perfect property at a price that fits your budget. Our network of verified listings and expert agents ensures you find your dream home without the stress.",
    image: propertySearchImg,
    features: ["Verified property listings", "Budget-friendly options", "Location analysis", "Legal documentation support", "Negotiation assistance", "Virtual property tours"],
  },
  {
    title: "Property Construction",
    slug: "construction",
    description: "From foundation to finishing, we deliver superior construction quality with transparent costing and on-time delivery. Our experienced team handles residential and commercial projects.",
    image: constructionImg,
    features: ["Architectural planning", "Structural engineering", "Quality materials", "Project timeline management", "Regular progress updates", "Government approvals assistance"],
  },
  {
    title: "Interior Design",
    slug: "interior-design",
    description: "Create spaces that reflect your personality. Our interior design team blends aesthetics with functionality, delivering stunning interiors using premium materials and innovative designs.",
    image: interiorDesignImg,
    features: ["3D visualization", "Custom furniture design", "Material selection", "Modular kitchen design", "Lighting design", "Smart home integration"],
  },
];

export const PORTFOLIO_ITEMS = [
  { id: "1", title: "Modern Villa Interiors", category: "Interiors", image: livingImg, location: "Hyderabad", slug: "modern-villa-interiors" },
  { id: "2", title: "Luxury Kitchen Renovation", category: "Interiors", image: kitchenImg, location: "Secunderabad", slug: "luxury-kitchen-renovation" },
  { id: "3", title: "Contemporary Bathroom", category: "Interiors", image: bathroomImg, location: "Hyderabad", slug: "contemporary-bathroom" },
  { id: "4", title: "Corporate Office Design", category: "Commercial", image: officeImg, location: "Gachibowli", slug: "corporate-office-design" },
  { id: "5", title: "Premium Villa Construction", category: "Construction", image: villaImg, location: "Jubilee Hills", slug: "premium-villa-construction" },
  { id: "6", title: "Master Bedroom Suite", category: "Residential", image: bedroomImg, location: "Banjara Hills", slug: "master-bedroom-suite" },
];

export const TESTIMONIALS = [
  {
    name: "Rajesh Kumar",
    role: "Homeowner",
    text: "Preinvesto made our dream home a reality. From property search to interior design, everything was handled seamlessly. The team's attention to detail is remarkable.",
    rating: 5,
  },
  {
    name: "Priya Sharma",
    role: "Business Owner",
    text: "We hired Preinvesto for our office interiors and the result exceeded our expectations. Professional team, transparent pricing, and delivered on time.",
    rating: 5,
  },
  {
    name: "Anil Reddy",
    role: "Homeowner",
    text: "The construction quality and interior design by Preinvesto is top-notch. They understood our requirements perfectly and delivered a home we're proud of.",
    rating: 5,
  },
];

export const TRUST_ITEMS = [
  { icon: "IndianRupee", title: "Transparent Costing", description: "No hidden charges. Get detailed cost breakdowns before we begin." },
  { icon: "Award", title: "Branded Materials", description: "We use only premium, branded materials for lasting quality." },
  { icon: "Clock", title: "On-Time Delivery", description: "We commit to timelines and deliver your project on schedule." },
  { icon: "ShieldCheck", title: "Quality Assurance", description: "Rigorous quality checks at every stage of your project." },
];

export const BLOG_POSTS = [
  {
    slug: "how-to-find-affordable-property-hyderabad",
    title: "How to Find Affordable Property in Hyderabad",
    excerpt: "Discover the best strategies for finding budget-friendly properties in Hyderabad's booming real estate market.",
    category: "Property Search",
    date: "2025-01-15",
    readTime: "5 min read",
    image: propertySearchImg,
    content: `Finding an affordable property in Hyderabad doesn't have to be overwhelming. With the right approach and expert guidance, you can secure your dream home within your budget.\n\n## Research the Market\nStart by understanding current market trends in different localities. Areas like Kompally, Patancheru, and Shamshabad offer excellent value for money.\n\n## Work with Experts\nPartnering with a trusted property consultant like Preinvesto can save you time and money. Our network of verified listings ensures you only see properties that match your criteria.\n\n## Verify Documentation\nAlways verify property documents, RERA registration, and clearances before making a commitment. Our team assists with complete legal due diligence.`,
  },
  {
    slug: "interior-design-trends-2025",
    title: "Interior Design Trends to Watch in 2025",
    excerpt: "From biophilic design to smart homes, explore the interior design trends shaping modern Indian homes.",
    category: "Interior Design",
    date: "2025-02-01",
    readTime: "4 min read",
    image: interiorDesignImg,
    content: `The world of interior design is evolving rapidly. Here are the top trends we're seeing in 2025.\n\n## Biophilic Design\nBringing nature indoors with living walls, natural materials, and abundant greenery continues to gain popularity.\n\n## Smart Home Integration\nFrom automated lighting to voice-controlled appliances, smart home features are becoming standard in modern interiors.\n\n## Warm Minimalism\nClean lines meet warm textures—think natural wood, soft fabrics, and earthy color palettes that create inviting spaces.`,
  },
  {
    slug: "construction-quality-checklist",
    title: "Essential Construction Quality Checklist for Your Home",
    excerpt: "Ensure your new home is built to last with this comprehensive construction quality checklist.",
    category: "Construction",
    date: "2025-02-10",
    readTime: "6 min read",
    image: constructionImg,
    content: `Building a home is one of the biggest investments you'll make. Here's how to ensure top-notch construction quality.\n\n## Foundation & Structure\nCheck the quality of concrete mix, rebar placement, and waterproofing. These form the backbone of your home.\n\n## Electrical & Plumbing\nInsist on branded wiring and fixtures. Proper planning prevents costly repairs later.\n\n## Finishing\nPay attention to plastering quality, tile alignment, and paint finish. These details make the difference between good and great.`,
  },
];

export const FAQ_ITEMS = [
  { question: "How long does a typical interior design project take?", answer: "A standard residential interior project takes 45-60 days from design approval to handover, depending on the scope and complexity." },
  { question: "Do you offer free design consultations?", answer: "Yes! We offer a complimentary initial consultation to understand your requirements, budget, and design preferences." },
  { question: "What areas in Hyderabad do you serve?", answer: "We serve all areas in and around Hyderabad including Jubilee Hills, Banjara Hills, Gachibowli, Kondapur, Kukatpally, Kompally, and surrounding regions." },
  { question: "Can I choose my own materials?", answer: "Absolutely. We provide material recommendations but the final choice is always yours. We also accompany you to showrooms for selection." },
  { question: "Do you handle government approvals for construction?", answer: "Yes, our team assists with all necessary government approvals, permits, and RERA compliance for construction projects." },
  { question: "What is your pricing model?", answer: "We offer transparent, itemized pricing with no hidden costs. You receive a detailed quotation before any work begins, and we stick to the agreed budget." },
];

export const AREAS_SERVED = [
  "Jubilee Hills", "Banjara Hills", "Gachibowli", "Kondapur",
  "Kukatpally", "Kompally", "Manikonda", "Narsingi",
  "Miyapur", "Madhapur", "Hitech City", "Secunderabad",
];
