import Layout from "@/components/layout/Layout";
import SEO, { breadcrumbSchema } from "@/components/SEO";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { SERVICES, FAQ_ITEMS } from "@/data/content";

const Services = () => (
  <Layout>
    <SEO
      title="Services – Property Search, Construction & Interior Design"
      description="Explore Preinvesto Interiors' services: affordable property search, quality construction, and premium interior design in Hyderabad."
      canonical="https://preinvesto.com/services"
      jsonLd={[
        breadcrumbSchema([
          { name: "Home", url: "https://preinvesto.com" },
          { name: "Services", url: "https://preinvesto.com/services" },
        ]),
        {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ_ITEMS.slice(0, 4).map((faq) => ({
            "@type": "Question",
            name: faq.question,
            acceptedAnswer: { "@type": "Answer", text: faq.answer },
          })),
        },
      ]}
    />

    <section className="relative pt-28 pb-10 bg-primary text-primary-foreground">
      <div className="container">
        <p className="text-accent font-medium tracking-widest uppercase text-sm mb-1">Our Services</p>
        <h1 className="font-display text-2xl sm:text-3xl font-bold leading-tight mb-2">
          Complete Home Solutions in Hyderabad
        </h1>
        <p className="text-primary-foreground/70 text-base max-w-2xl">
          From finding the perfect property to designing stunning interiors, we handle every step of your home journey.
        </p>
      </div>
    </section>

    <section className="py-20 bg-background">
      <div className="container space-y-16">
        {SERVICES.map((service, i) => (
          <motion.div
            key={service.slug}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className={`grid grid-cols-1 lg:grid-cols-2 gap-12 items-center ${i % 2 === 1 ? "lg:direction-rtl" : ""}`}
          >
            <div className={i % 2 === 1 ? "lg:order-2" : ""}>
              <img
                src={service.image}
                alt={`${service.title} – Preinvesto Interiors`}
                className="rounded-xl w-full aspect-[4/3] object-cover"
                loading="lazy"
              />
            </div>
            <div className={i % 2 === 1 ? "lg:order-1" : ""}>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-foreground mb-4">{service.title}</h2>
              <p className="text-muted-foreground leading-relaxed mb-6">{service.description}</p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                {service.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-foreground">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                to={`/services/${service.slug}`}
                className="inline-flex items-center gap-2 px-6 py-3 bg-accent text-accent-foreground font-semibold rounded-lg hover:opacity-90 transition-opacity"
              >
                Learn More <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </motion.div>
        ))}
      </div>
    </section>

    {/* FAQs */}
    <section className="py-20 bg-section-alt">
      <div className="container max-w-3xl">
        <h2 className="font-display text-3xl font-bold text-foreground text-center mb-12">Frequently Asked Questions</h2>
        <div className="space-y-4">
          {FAQ_ITEMS.map((faq, i) => (
            <details key={i} className="bg-card rounded-lg border border-border group">
              <summary className="px-6 py-4 cursor-pointer font-medium text-foreground hover:text-accent transition-colors list-none flex items-center justify-between">
                {faq.question}
                <span className="text-muted-foreground group-open:rotate-45 transition-transform text-xl">+</span>
              </summary>
              <div className="px-6 pb-4 text-sm text-muted-foreground leading-relaxed">
                {faq.answer}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  </Layout>
);

export default Services;
