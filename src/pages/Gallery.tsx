import { useState } from "react";
import Layout from "@/components/layout/Layout";
import SEO, { breadcrumbSchema } from "@/components/SEO";
import { motion } from "framer-motion";
import { PORTFOLIO_ITEMS } from "@/data/content";
import { X } from "lucide-react";

const Gallery = () => {
  const [lightbox, setLightbox] = useState<string | null>(null);

  return (
    <Layout>
      <SEO
        title="Gallery – Interior Design & Construction Photos"
        description="Browse our gallery of stunning interior designs, construction projects, and home transformations by Preinvesto Interiors in Hyderabad."
        canonical="https://preinvesto.com/gallery"
        jsonLd={breadcrumbSchema([
          { name: "Home", url: "https://preinvesto.com" },
          { name: "Gallery", url: "https://preinvesto.com/gallery" },
        ])}
      />

      <section className="relative pt-28 pb-10 bg-primary text-primary-foreground">
        <div className="container">
          <p className="text-accent font-medium tracking-widest uppercase text-sm mb-1">Gallery</p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold leading-tight">Our Work in Pictures</h1>
        </div>
      </section>

      <section className="py-20 bg-background">
        <div className="container">
          <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 space-y-4">
            {PORTFOLIO_ITEMS.map((item, i) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="break-inside-avoid"
              >
                <button
                  onClick={() => setLightbox(item.image)}
                  className="group block w-full rounded-xl overflow-hidden cursor-pointer"
                  aria-label={`View ${item.title}`}
                >
                  <img
                    src={item.image}
                    alt={`${item.title} – Preinvesto Interiors`}
                    className={`w-full object-cover group-hover:scale-105 transition-transform duration-500 ${i % 3 === 0 ? "aspect-[3/4]" : i % 3 === 1 ? "aspect-square" : "aspect-[4/3]"}`}
                    loading="lazy"
                  />
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-[100] bg-hero-overlay/90 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <button onClick={() => setLightbox(null)} className="absolute top-6 right-6 text-primary-foreground/80 hover:text-primary-foreground" aria-label="Close lightbox">
            <X className="w-8 h-8" />
          </button>
          <img src={lightbox} alt="Gallery image" className="max-w-full max-h-[85vh] object-contain rounded-lg" />
        </div>
      )}
    </Layout>
  );
};

export default Gallery;
