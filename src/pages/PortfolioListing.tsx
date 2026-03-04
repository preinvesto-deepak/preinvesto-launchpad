import { useState } from "react";
import { Link } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import SEO, { breadcrumbSchema } from "@/components/SEO";
import { motion } from "framer-motion";
import { usePortfolioIndex } from "@/hooks/usePortfolioIndex";

function toLabel(cat: string) {
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}

const PortfolioListing = () => {
  const { data, isLoading } = usePortfolioIndex();
  const [active, setActive] = useState<string>("all");

  const categories = data?.categories ?? [];
  const projects = data?.projects ?? [];
  const filtered =
    active === "all"
      ? projects
      : projects.filter((p) => p.category === active);

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

      <section className="relative pt-28 pb-10 bg-primary text-primary-foreground">
        <div className="container">
          <p className="text-accent font-medium tracking-widest uppercase text-sm mb-1">
            Portfolio
          </p>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <h1 className="font-display text-2xl sm:text-3xl font-bold leading-tight">
              Our Projects
            </h1>
            <div className="flex flex-wrap gap-2 justify-start md:justify-end">
              <button
                onClick={() => setActive("all")}
                className={`px-5 py-2 rounded-full text-sm font-medium transition-colors ${
                  active === "all"
                    ? "bg-accent text-accent-foreground"
                    : "bg-primary-foreground/10 text-primary-foreground/80 hover:bg-primary-foreground/20"
                }`}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActive(cat)}
                  className={`px-5 py-2 rounded-full text-sm font-medium transition-colors ${
                    active === cat
                      ? "bg-accent text-accent-foreground"
                      : "bg-primary-foreground/10 text-primary-foreground/80 hover:bg-primary-foreground/20"
                  }`}
                >
                  {toLabel(cat)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-background">
        <div className="container">

          {isLoading && (
            <div className="flex justify-center py-20">
              <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!isLoading && filtered.length === 0 && (
            <p className="text-muted-foreground text-center py-16">
              No projects yet in this category.
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((item, i) => (
              <motion.div
                key={`${item.category}-${item.slug}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Link
                  to={`/portfolio/${item.category}/${item.slug}`}
                  className="group block relative aspect-[4/3] rounded-xl overflow-hidden bg-muted"
                >
                  {item.coverImage && (
                    <img
                      src={item.coverImage}
                      alt={item.displayName}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-hero-overlay/80 via-transparent to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-5">
                    <span className="text-xs text-accent font-medium tracking-wider uppercase">
                      {toLabel(item.category)}
                    </span>
                    <h3 className="text-primary-foreground font-display text-lg font-semibold mt-1">
                      {item.displayName}
                    </h3>
                    {item.location && (
                      <p className="text-primary-foreground/60 text-xs mt-0.5">{item.location}</p>
                    )}
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

export default PortfolioListing;
