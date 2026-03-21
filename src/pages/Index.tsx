import Header from "@/components/layout/Header";
import SEO, { localBusinessSchema } from "@/components/SEO";
import PropertyHero from "@/components/home/PropertyHero";
import WhatsAppButton from "@/components/layout/WhatsAppButton";

const Index = () => (
  <div className="min-h-screen flex flex-col bg-background">
    <SEO
      title="Property Search in Hyderabad | Buy, Rent & New Projects | Preinvesto"
      description="Search properties for sale and rent in Hyderabad. Find apartments, villas, plots and new projects across Gachibowli, Jubilee Hills, Kondapur and more."
      canonical="https://preinvesto.com"
      jsonLd={localBusinessSchema}
    />
    <Header />
    <PropertyHero />
    <WhatsAppButton />
  </div>
);

export default Index;