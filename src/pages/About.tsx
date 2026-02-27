import Layout from "@/components/layout/Layout";
import SEO, { breadcrumbSchema } from "@/components/SEO";
import { motion } from "framer-motion";
import { BRAND, IMAGES, TRUST_ITEMS } from "@/data/content";
import { IndianRupee, Award, Clock, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

const iconMap: Record<string, React.ElementType> = { IndianRupee, Award, Clock, ShieldCheck };

const About = () => (
  <Layout>
    <SEO
      title="About Us – Preinvesto Interiors Hyderabad"
      description="Learn about Preinvesto Interiors – Hyderabad's trusted partner for affordable property search, quality construction, and premium interior design."
      canonical="https://preinvesto.com/about"
      jsonLd={breadcrumbSchema([
        { name: "Home", url: "https://preinvesto.com" },
        { name: "About Us", url: "https://preinvesto.com/about" },
      ])}
    />

    {/* Hero */}
    <section className="relative pt-28 pb-10 bg-primary text-primary-foreground">
      <div className="container">
        <p className="text-accent font-medium tracking-widest uppercase text-sm mb-1">About Us</p>
        <h1 className="font-display text-2xl sm:text-3xl font-bold leading-tight mb-2">
          Building Dreams, Delivering Excellence
        </h1>
        <p className="text-primary-foreground/70 text-base max-w-2xl">
          Completion of projects qualitatively to the utmost satisfaction of clients within the scheduled time with careful and precise evaluation.
        </p>
      </div>
    </section>

    {/* Story */}
    <section className="py-20 bg-background">
      <div className="container">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <img src={IMAGES.hero} alt="Preinvesto Interiors office" className="rounded-xl w-full aspect-[4/3] object-cover" loading="lazy" />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="font-display text-3xl font-bold text-foreground mb-5">Our Story</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Preinvesto Interiors was founded with a simple mission: to simplify the home-building journey for every Indian family. We understand that finding the right property, constructing your dream home, and designing beautiful interiors can be overwhelming.
            </p>
            <p className="text-muted-foreground leading-relaxed mb-4">
              That's why we offer a complete end-to-end solution—from property search to interior design and handover—ensuring a seamless, stress-free experience. Based in Hyderabad, we've helped hundreds of families transform their vision into reality.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Our team of experienced architects, engineers, designers, and project managers work together to deliver projects that exceed expectations—on time, on budget, and with uncompromising quality.
            </p>
          </motion.div>
        </div>
      </div>
    </section>

    {/* Values */}
    <section className="py-20 bg-section-alt">
      <div className="container">
        <h2 className="font-display text-3xl font-bold text-foreground text-center mb-12">Our Values</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {TRUST_ITEMS.map((item, i) => {
            const Icon = iconMap[item.icon];
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bg-card rounded-xl p-7 text-center shadow-sm"
              >
                <Icon className="w-8 h-8 text-accent mx-auto mb-4" />
                <h3 className="font-semibold text-foreground mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.description}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>

    {/* CTA */}
    <section className="py-16 bg-accent text-accent-foreground">
      <div className="container text-center">
        <h2 className="font-display text-3xl font-bold mb-4">Ready to Start Your Project?</h2>
        <p className="mb-8 opacity-90">Contact us today for a free consultation.</p>
        <Link to="/contact" className="inline-flex px-8 py-3.5 bg-primary text-primary-foreground font-semibold rounded-lg hover:opacity-90 transition-opacity">
          Get a Free Quote
        </Link>
      </div>
    </section>
  </Layout>
);

export default About;
