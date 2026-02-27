import { useParams, Link } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import SEO, { breadcrumbSchema } from "@/components/SEO";
import { motion } from "framer-motion";
import { SERVICES, FAQ_ITEMS, BRAND } from "@/data/content";
import { MessageCircle, ArrowRight } from "lucide-react";

const POWERBI_URL = "https://app.powerbi.com/view?r=eyJrIjoiOTUwOGQxZjEtMmMyZC00MmRmLWJjZDItMjhhN2ZhNzY3OGY2IiwidCI6ImZlZTgxZTUyLTNlOGUtNDExNi05NDQwLTNjYmZjNTk4OTBhZSJ9";

const ServiceDetail = () => {
  const { slug } = useParams<{ slug: string }>();
  const service = SERVICES.find((s) => s.slug === slug);

  if (!service) {
    return (
      <Layout>
        <div className="pt-32 pb-20 container text-center">
          <h1 className="font-display text-3xl font-bold text-foreground">Service not found</h1>
          <Link to="/services" className="text-accent mt-4 inline-block">← Back to Services</Link>
        </div>
      </Layout>
    );
  }

  const isPropertySearch = slug === "property-search";
  const isConstruction = slug === "construction";
  const isInterior = slug === "interior-design";

  const ctaText = isConstruction
    ? "Request Site Visit"
    : isInterior
    ? "Book Design Consultation"
    : "Start Property Search";

  return (
    <Layout>
      <SEO
        title={`${service.title} – Preinvesto Interiors Hyderabad`}
        description={service.description}
        canonical={`https://preinvesto.com/services/${slug}`}
        jsonLd={[
          breadcrumbSchema([
            { name: "Home", url: "https://preinvesto.com" },
            { name: "Services", url: "https://preinvesto.com/services" },
            { name: service.title, url: `https://preinvesto.com/services/${slug}` },
          ]),
          {
            "@context": "https://schema.org",
            "@type": "Service",
            name: service.title,
            description: service.description,
            provider: { "@type": "Organization", name: "Preinvesto Interiors" },
            areaServed: { "@type": "City", name: "Hyderabad" },
          },
        ]}
      />

      {/* Hero */}
      <section className="relative pt-28 pb-10">
        <div className="absolute inset-0">
          <img src={service.image} alt={service.title} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-hero-overlay/70" />
        </div>
        <div className="container relative z-10">
          <Link to="/services" className="text-accent text-sm mb-2 inline-block hover:underline">← All Services</Link>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-primary-foreground leading-tight mb-2">
            {service.title}
          </h1>
          <p className="text-primary-foreground/80 text-base max-w-2xl">{service.description}</p>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-background">
        <div className="container">
          <h2 className="font-display text-3xl font-bold text-foreground mb-10">What's Included</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {service.features.map((f, i) => (
              <motion.div
                key={f}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="bg-card rounded-xl p-6 border border-border"
              >
                <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center mb-4">
                  <span className="text-accent font-bold text-sm">{String(i + 1).padStart(2, "0")}</span>
                </div>
                <h3 className="font-semibold text-foreground">{f}</h3>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* PowerBI embed for property search */}
      {isPropertySearch && (
        <section className="py-20 bg-section-alt">
          <div className="container">
            <h2 className="font-display text-3xl font-bold text-foreground mb-4">Explore Affordable Options</h2>
            <p className="text-muted-foreground mb-8">Browse through our curated property listings with detailed analytics and pricing insights.</p>
            <div className="relative w-full rounded-xl overflow-hidden border border-border bg-card" style={{ paddingBottom: "56.25%" }}>
              <iframe
                title="Preinvesto Property Search Dashboard"
                src={POWERBI_URL}
                className="absolute inset-0 w-full h-full"
                allowFullScreen
                loading="lazy"
              />
            </div>
          </div>
        </section>
      )}

      {/* FAQs */}
      <section className="py-20 bg-section-alt">
        <div className="container max-w-3xl">
          <h2 className="font-display text-3xl font-bold text-foreground text-center mb-12">FAQs</h2>
          <div className="space-y-4">
            {FAQ_ITEMS.map((faq, i) => (
              <details key={i} className="bg-card rounded-lg border border-border group">
                <summary className="px-6 py-4 cursor-pointer font-medium text-foreground hover:text-accent transition-colors list-none flex items-center justify-between">
                  {faq.question}
                  <span className="text-muted-foreground group-open:rotate-45 transition-transform text-xl">+</span>
                </summary>
                <div className="px-6 pb-4 text-sm text-muted-foreground leading-relaxed">{faq.answer}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-accent text-accent-foreground">
        <div className="container text-center">
          <h2 className="font-display text-3xl font-bold mb-4">Interested in {service.title}?</h2>
          <p className="mb-8 opacity-90">Get a free consultation with our experts today.</p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link to="/contact" className="inline-flex items-center gap-2 px-8 py-3.5 bg-primary text-primary-foreground font-semibold rounded-lg">
              {ctaText} <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href={BRAND.whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-8 py-3.5 bg-[#25D366] text-[#fff] font-semibold rounded-lg"
            >
              <MessageCircle className="w-5 h-5" /> WhatsApp Us
            </a>
          </div>
        </div>
      </section>
    </Layout>
  );
};

export default ServiceDetail;
