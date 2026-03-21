import Layout from "@/components/layout/Layout";
import SEO from "@/components/SEO";
import Hero from "@/components/home/Hero";
import JourneySteps from "@/components/home/JourneySteps";
import ServicesPreview from "@/components/home/ServicesPreview";
import PortfolioPreview from "@/components/home/PortfolioPreview";
import Testimonials from "@/components/home/Testimonials";
import TrustSection from "@/components/home/TrustSection";
import ContactTeaser from "@/components/home/ContactTeaser";

const ConstructionHome = () => (
  <Layout>
    <SEO
      title="Property Construction Services in Hyderabad | Preinvesto"
      description="Build your dream home with Preinvesto's quality construction services in Hyderabad. Transparent costing, on-time delivery, premium materials."
      canonical="https://preinvesto.com/construction-home"
    />
    <Hero />
    <PortfolioPreview />
    <JourneySteps />
    <Testimonials />
    <TrustSection />
    <ContactTeaser />
  </Layout>
);

export default ConstructionHome;