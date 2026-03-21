import { Link } from "react-router-dom";

const InteriorTagline = () => (
  <section className="py-16 bg-background text-center">
    <div className="container max-w-3xl mx-auto px-4">
      <p className="text-accent font-medium tracking-widest uppercase text-sm mb-4">
        Why Choose Preinvesto
      </p>
      <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground leading-tight mb-6">
        The home design you crave
      </h2>
      <p className="text-muted-foreground text-lg leading-relaxed mb-8 max-w-2xl mx-auto">
        When you give your home the Preinvesto touch, you get both beauty and functionality.
        We employ state-of-the-art design techniques to ensure your home features a flawless
        look that lasts a very long time.
      </p>
      <Link
        to="/contact"
        className="inline-flex items-center px-8 py-3.5 bg-accent text-accent-foreground font-semibold rounded-lg hover:opacity-90 transition-opacity text-sm tracking-wide"
      >
        BOOK FREE CONSULTATION
      </Link>
    </div>
  </section>
);

export default InteriorTagline;
