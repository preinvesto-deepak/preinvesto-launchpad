import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { usePortfolioIndex } from "@/hooks/usePortfolioIndex";

function toLabel(cat: string) {
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}

const PortfolioPreview = () => {
  const { data } = usePortfolioIndex();
  const projects = (data?.projects ?? []).slice(0, 6);

  return (
    <section className="py-20 lg:py-28 bg-background">
      <div className="container">
        <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 mb-12">
          <div>
            <p className="text-accent font-medium tracking-widest uppercase text-sm mb-3">Our Work</p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground">
              Recent Projects
            </h2>
          </div>
          <Link to="/portfolio" className="text-sm font-medium text-accent hover:underline whitespace-nowrap">
            View All Projects →
          </Link>
        </div>

        {projects.length === 0 && (
          <p className="text-muted-foreground text-center py-12">Projects coming soon.</p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((item, i) => (
            <motion.div
              key={`${item.category}-${item.slug}`}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
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
                  <span className="text-xs text-accent font-medium tracking-wider uppercase">{toLabel(item.category)}</span>
                  <h3 className="text-primary-foreground font-display text-lg font-semibold mt-1">{item.displayName}</h3>
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
  );
};

export default PortfolioPreview;
