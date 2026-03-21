import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { IMAGES } from "@/data/content";

const Hero = () => (
  <section className="relative h-screen min-h-[600px] max-h-[900px] flex items-center overflow-hidden">
    <div className="absolute inset-0">
      <img
        src={IMAGES.hero}
        alt="Luxury modern living room interior by Preinvesto Interiors"
        className="w-full h-full object-cover"
        loading="eager"
      />
      <div className="absolute inset-0 bg-hero-overlay/60" />
    </div>

    <div className="container relative z-10">
      <div className="max-w-2xl">
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-accent font-medium tracking-widest uppercase text-sm mb-4"
        >
          Featured Project · Modern Villa Interiors
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold text-primary-foreground leading-tight mb-6"
        >
          Your Home Journey, Simplified.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="text-primary-foreground/80 text-lg sm:text-xl leading-relaxed mb-8 max-w-lg"
        >
          Affordable property search, construction, and interiors — handled end-to-end.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="flex flex-wrap gap-4"
        >
          <Link
            to="/portfolio"
            className="inline-flex items-center px-7 py-3.5 bg-accent text-accent-foreground font-semibold rounded-lg hover:opacity-90 transition-opacity"
          >
            SEE OUR PORTFOLIO
          </Link>
        </motion.div>
      </div>
    </div>

    <Link
      to="/portfolio"
      className="absolute bottom-8 right-8 hidden md:flex items-center gap-3 bg-card/90 backdrop-blur-sm rounded-lg px-5 py-3 shadow-lg hover:shadow-xl transition-shadow"
    >
      <img src={IMAGES.portfolioLiving} alt="Featured project" className="w-16 h-12 rounded object-cover" />
      <div>
        <p className="text-xs text-muted-foreground">Featured Project</p>
        <p className="text-sm font-semibold text-foreground">Modern Villa Interiors</p>
      </div>
    </Link>
  </section>
);

export default Hero;
