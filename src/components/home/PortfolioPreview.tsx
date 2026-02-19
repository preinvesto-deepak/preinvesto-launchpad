import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { PORTFOLIO_ITEMS } from "@/data/content";

const PortfolioPreview = () => (
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {PORTFOLIO_ITEMS.map((item, i) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
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
);

export default PortfolioPreview;
