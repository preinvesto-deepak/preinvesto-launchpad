import { useState } from "react";
import { Link } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import SEO, { breadcrumbSchema } from "@/components/SEO";
import { motion } from "framer-motion";
import { PORTFOLIO_ITEMS } from "@/data/content";

const CATEGORIES = ["All", "Interiors", "Construction", "Residential", "Commercial"];

const Portfolio = () => {
  const [active, setActive] = useState("All");
  const filtered = active === "All" ? PORTFOLIO_ITEMS : PORTFOLIO_ITEMS.filter((p) => p.category === active);

  return (
    <Layout>
      <SEO
        title="Portfolio – Our Projects in Hyderabad"
        description="Explore Preinvesto Interiors' portfolio of residential, commercial, and interior design projects across Hyderabad."
        canonical="https://preinvesto.com/portfolio"
        jsonLd={breadcrumbSchema([
          { name: "Home", url: "https://preinvesto.com" },
          { name: "Portfolio", url: "https://preinvesto.com/portfolio" },
        ])}
      />

      <section className="relative pt-32 pb-20 bg-primary text-primary-foreground">
        <div className="container">
          <p className="text-accent font-medium tracking-widest uppercase text-sm mb-3">Portfolio</p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold">Our Projects</h1>
        </div>
      </section>

      <section className="py-20 bg-background">
        <div className="container">
          <div className="flex flex-wrap gap-3 mb-12">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setActive(cat)}
                className={`px-5 py-2 rounded-full text-sm font-medium transition-colors ${
                  active === cat
                    ? "bg-accent text-accent-foreground"
                    : "bg-muted text-muted-foreground hover:bg-border"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((item, i) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Link
                  to={`/portfolio/${item.slug}`}
                  className="group block relative aspect-[4/3] rounded-xl overflow-hidden"
                >
                  <img
                    src={item.image}
                    alt={`${item.title} – ${item.location}`}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-hero-overlay/80 via-transparent to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-5">
                    <span className="text-xs text-accent font-medium tracking-wider uppercase">{item.category}</span>
                    <h3 className="text-primary-foreground font-display text-lg font-semibold mt-1">{item.title}</h3>
                    <p className="text-primary-foreground/70 text-xs mt-1">{item.location}</p>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </Layout>
  );
};

export default Portfolio;
