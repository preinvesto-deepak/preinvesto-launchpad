import Layout from "@/components/layout/Layout";
import SEO, { localBusinessSchema } from "@/components/SEO";
import Hero from "@/components/home/Hero";
import JourneySteps from "@/components/home/JourneySteps";
import ServicesPreview from "@/components/home/ServicesPreview";
import VideoShowcase from "@/components/home/VideoShowcase";
import PortfolioPreview from "@/components/home/PortfolioPreview";
import Testimonials from "@/components/home/Testimonials";
import TrustSection from "@/components/home/TrustSection";
import ContactTeaser from "@/components/home/ContactTeaser";

const Index = () => (
  <Layout>
    <SEO
      title="Property Search, Construction & Interior Design in Hyderabad"
      description="Preinvesto Interiors – Your trusted partner for affordable property search, quality construction, and stunning interior design in Hyderabad, Telangana."
      canonical="https://preinvesto.com"
      jsonLd={localBusinessSchema}
    />
    <Hero />
    <ServicesPreview />
    <VideoShowcase />
    <PortfolioPreview />
    <JourneySteps />
    <Testimonials />
    <TrustSection />
    <ContactTeaser />
  </Layout>
);

export default Index;
