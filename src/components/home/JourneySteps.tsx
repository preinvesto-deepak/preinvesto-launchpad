import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Search, Building2, Palette, KeyRound } from "lucide-react";
import { JOURNEY_STEPS } from "@/data/content";

const iconMap: Record<string, React.ElementType> = { Search, Building2, Palette, KeyRound };

const JourneySteps = () => (
  <section className="py-20 lg:py-28 bg-background">
    <div className="container">
      <div className="text-center max-w-2xl mx-auto mb-16">
        <p className="text-accent font-medium tracking-widest uppercase text-sm mb-3">How It Works</p>
        <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground">
          Your Journey Starts Here
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 relative">
        {/* Connector line (desktop) */}
        <div className="hidden lg:block absolute top-12 left-[12.5%] right-[12.5%] h-px bg-border" />

        {JOURNEY_STEPS.map((step, i) => {
          const Icon = iconMap[step.icon];
          return (
            <motion.div
              key={step.step}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.15 }}
              className="text-center relative"
            >
              <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-section-alt flex items-center justify-center relative z-10">
                <Icon className="w-8 h-8 text-accent" />
                <span className="absolute -top-1 -right-1 w-7 h-7 bg-accent text-accent-foreground text-xs font-bold rounded-full flex items-center justify-center">
                  {step.step}
                </span>
              </div>
              <h3 className="font-display text-lg font-semibold text-foreground mb-2">{step.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">{step.description}</p>
              <Link to={step.link} className="text-sm font-medium text-accent hover:underline">
                Learn more →
              </Link>
            </motion.div>
          );
        })}
      </div>
    </div>
  </section>
);

export default JourneySteps;
