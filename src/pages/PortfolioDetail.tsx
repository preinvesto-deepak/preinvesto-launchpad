import { useParams, Link } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import SEO, { breadcrumbSchema } from "@/components/SEO";
import { PORTFOLIO_ITEMS, BRAND } from "@/data/content";
import { MessageCircle, ArrowRight } from "lucide-react";

const PortfolioDetail = () => {
  const { slug } = useParams<{ slug: string }>();
  const project = PORTFOLIO_ITEMS.find((p) => p.slug === slug);

  if (!project) {
    return (
      <Layout>
        <div className="pt-32 pb-20 container text-center">
          <h1 className="font-display text-3xl font-bold">Project not found</h1>
          <Link to="/portfolio" className="text-accent mt-4 inline-block">← Back to Portfolio</Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <SEO
        title={`${project.title} – Preinvesto Interiors Portfolio`}
        description={`${project.title} project by Preinvesto Interiors in ${project.location}. ${project.category} project showcase.`}
        canonical={`https://preinvesto.com/portfolio/${slug}`}
        jsonLd={breadcrumbSchema([
          { name: "Home", url: "https://preinvesto.com" },
          { name: "Portfolio", url: "https://preinvesto.com/portfolio" },
          { name: project.title, url: `https://preinvesto.com/portfolio/${slug}` },
        ])}
      />

      <section className="relative pt-28 pb-10">
        <div className="absolute inset-0">
          <img src={project.image} alt={project.title} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-hero-overlay/70" />
        </div>
        <div className="container relative z-10">
          <Link to="/portfolio" className="text-accent text-sm mb-2 inline-block hover:underline">← All Projects</Link>
          <span className="text-accent text-xs font-medium tracking-wider uppercase block mb-1">{project.category}</span>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-primary-foreground leading-tight mb-1">{project.title}</h1>
          <p className="text-primary-foreground/70 text-sm">{project.location}</p>
        </div>
      </section>

      <section className="py-20 bg-background">
        <div className="container max-w-4xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mb-12">
            <div className="bg-card rounded-xl p-6 border border-border">
              <h3 className="text-sm font-medium text-muted-foreground mb-1">Category</h3>
              <p className="font-semibold text-foreground">{project.category}</p>
            </div>
            <div className="bg-card rounded-xl p-6 border border-border">
              <h3 className="text-sm font-medium text-muted-foreground mb-1">Location</h3>
              <p className="font-semibold text-foreground">{project.location}</p>
            </div>
          </div>

          <h2 className="font-display text-2xl font-bold text-foreground mb-4">Project Overview</h2>
          <p className="text-muted-foreground leading-relaxed mb-6">
            This {project.category.toLowerCase()} project in {project.location} showcases our expertise in delivering premium quality spaces. Our team worked closely with the client to understand their vision and bring it to life with attention to every detail.
          </p>
          <p className="text-muted-foreground leading-relaxed mb-12">
            From material selection to final execution, every aspect was carefully planned and executed to ensure the highest standards of quality and aesthetics.
          </p>

          <div className="flex flex-wrap gap-4">
            <Link
              to="/contact"
              className="inline-flex items-center gap-2 px-6 py-3 bg-accent text-accent-foreground font-semibold rounded-lg hover:opacity-90 transition-opacity"
            >
              Request Similar Design <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href={BRAND.whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#25D366] text-[#fff] font-semibold rounded-lg hover:opacity-90 transition-opacity"
            >
              <MessageCircle className="w-5 h-5" /> WhatsApp Us
            </a>
          </div>
        </div>
      </section>
    </Layout>
  );
};

export default PortfolioDetail;
