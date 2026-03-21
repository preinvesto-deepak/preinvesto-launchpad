import Layout from "@/components/layout/Layout";
import SEO from "@/components/SEO";
import Hero from "@/components/home/Hero";
import JourneySteps from "@/components/home/JourneySteps";
import ServicesPreview from "@/components/home/ServicesPreview";
import VideoShowcase from "@/components/home/VideoShowcase";
import PortfolioPreview from "@/components/home/PortfolioPreview";
import Testimonials from "@/components/home/Testimonials";
import TrustSection from "@/components/home/TrustSection";
import ContactTeaser from "@/components/home/ContactTeaser";
import InteriorTagline from "@/components/home/InteriorTagline";

const InteriorDesignHome = () => (
  <Layout>
    <SEO
      title="Interior Design Services in Hyderabad | Preinvesto Interiors"
      description="Transform your home with Preinvesto's award-winning interior design services in Hyderabad. Modern, affordable, and delivered on time."
      canonical="https://preinvesto.com/interior-design"
    />
    <Hero />
    <InteriorTagline />
    <VideoShowcase />
    <PortfolioPreview />
    <JourneySteps />
    <Testimonials />
    <TrustSection />
    <ContactTeaser />
  </Layout>
);

export default InteriorDesignHome;