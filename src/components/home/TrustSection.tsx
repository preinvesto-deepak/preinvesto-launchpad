import { motion } from "framer-motion";
import { IndianRupee, Award, Clock, ShieldCheck } from "lucide-react";
import { TRUST_ITEMS } from "@/data/content";

const iconMap: Record<string, React.ElementType> = { IndianRupee, Award, Clock, ShieldCheck };

const TrustSection = () => (
  <section className="py-20 lg:py-28 bg-primary text-primary-foreground">
    <div className="container">
      <div className="text-center max-w-2xl mx-auto mb-16">
        <p className="text-accent font-medium tracking-widest uppercase text-sm mb-3">Why Choose Us</p>
        <h2 className="font-display text-3xl sm:text-4xl font-bold">
          Built on Trust & Quality
        </h2>
      </div>

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
              className="text-center"
            >
              <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-primary-foreground/10 flex items-center justify-center">
                <Icon className="w-7 h-7 text-accent" />
              </div>
              <h3 className="font-semibold text-lg mb-2">{item.title}</h3>
              <p className="text-sm text-primary-foreground/70 leading-relaxed">{item.description}</p>
            </motion.div>
          );
        })}
      </div>
    </div>
  </section>
);

export default TrustSection;
