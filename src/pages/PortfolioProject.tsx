import { useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import SEO, { breadcrumbSchema } from "@/components/SEO";
import { usePortfolioIndex } from "@/hooks/usePortfolioIndex";
import { ChevronLeft, ChevronRight, X, MapPin } from "lucide-react";
import { motion } from "framer-motion";

function toLabel(cat: string) {
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}

const PortfolioProject = () => {
  const { category, projectSlug } = useParams<{
    category: string;
    projectSlug: string;
  }>();
  const { data, isLoading } = usePortfolioIndex();
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [isPortrait, setIsPortrait] = useState(false);

  const handleVideoMetadata = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    const v = e.currentTarget;
    setIsPortrait(v.videoHeight > v.videoWidth);
  }, []);

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setIsPortrait(img.naturalHeight > img.naturalWidth);
  }, []);

  const project = data?.projects.find(
    (p) => p.category === category && p.slug === projectSlug
  );

  if (isLoading) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!project) {
    return (
      <Layout>
        <div className="pt-32 pb-20 container text-center">
          <h1 className="font-display text-3xl font-bold">
            Project not found
          </h1>
          <Link
            to="/portfolio"
            className="text-accent mt-4 inline-block hover:underline"
          >
            ← Back to Portfolio
          </Link>
        </div>
      </Layout>
    );
  }

  const featuredMedia =
    project.summaryVideo ||
    project.featuredImage ||
    project.galleryImages[0] ||
    null;
  const videoPoster = project.featuredImage || project.galleryImages[0] || undefined;
  const allImages = project.galleryImages;

  const openLightbox = (idx: number) => setLightboxIdx(idx);
  const closeLightbox = () => setLightboxIdx(null);
  const prevImage = () =>
    setLightboxIdx((i) =>
      i !== null ? (i - 1 + allImages.length) % allImages.length : null
    );
  const nextImage = () =>
    setLightboxIdx((i) =>
      i !== null ? (i + 1) % allImages.length : null
    );

  return (
    <Layout>
      <SEO
        title={`${project.displayName} – Preinvesto Interiors`}
        description={`${project.displayName}${project.location ? `, ${project.location}` : ''} – a ${toLabel(project.category)} project by Preinvesto Interiors in Hyderabad.`}
        canonical={`https://preinvesto.com/portfolio/${category}/${projectSlug}`}
        jsonLd={breadcrumbSchema([
          { name: "Home", url: "https://preinvesto.com" },
          { name: "Portfolio", url: "https://preinvesto.com/portfolio" },
          {
            name: project.displayName,
            url: `https://preinvesto.com/portfolio/${category}/${projectSlug}`,
          },
        ])}
      />

      {/* Compact Hero */}
      <section className="relative pt-28 pb-10 bg-primary text-primary-foreground">
        <div className="container">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Link to="/portfolio" className="text-accent hover:underline">
              Portfolio
            </Link>
            <span className="text-primary-foreground/40">/</span>
            <Link
              to={`/portfolio?cat=${category}`}
              className="text-accent hover:underline"
            >
              {toLabel(category || "")}
            </Link>
            <span className="text-primary-foreground/40">/</span>
            <span className="text-primary-foreground/70">
              {project.displayName}
            </span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold leading-tight">
            {project.displayName}
          </h1>
          {project.location && (
            <div className="flex items-center gap-1.5 mt-2 text-primary-foreground/70 text-sm">
              <MapPin className="w-4 h-4 text-accent" />
              <span>{project.location}</span>
            </div>
          )}
        </div>
      </section>

      {/* Featured media (RIGHT) + text (LEFT, vertically centered) */}
      <section className="py-16 bg-background">
        <div className="container">
          <div className={`grid grid-cols-1 gap-8 items-center ${isPortrait ? 'lg:grid-cols-[3fr_2fr]' : 'lg:grid-cols-2'}`}>
            {/* Text — left on desktop */}
            <div className="flex flex-col justify-center lg:order-1 order-2">
              <span className="text-accent text-xs font-medium tracking-wider uppercase mb-2">
                {toLabel(project.category)}
              </span>
              <h2 className="font-display text-xl sm:text-2xl font-bold text-foreground mb-4">
                About This Project
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                This {toLabel(project.category).toLowerCase()} project
                showcases our dedication to quality craftsmanship and thoughtful
                design. Every detail was carefully planned and executed to
                deliver a space that is both beautiful and functional.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Our team worked closely with the client to ensure the final
                result reflects their vision while meeting the highest standards
                of construction and finish quality.
              </p>
            </div>

            {/* Media — right on desktop */}
            <div className="lg:order-2 order-1 flex lg:justify-end justify-center">
              <div
                className={`rounded-xl overflow-hidden bg-black/90 flex items-center justify-center w-full ${
                  isPortrait
                    ? 'max-h-[50vh] lg:max-h-[400px] lg:max-w-[85%]'
                    : 'max-h-[60vh] lg:max-h-[480px]'
                }`}
                style={{ aspectRatio: isPortrait ? '9/16' : '16/9' }}
            >
              {project.summaryVideo ? (
                <video
                  src={project.summaryVideo}
                  poster={videoPoster}
                  controls
                  autoPlay
                  muted
                  playsInline
                  loop
                  preload="metadata"
                  onLoadedMetadata={handleVideoMetadata}
                  className="w-full h-full object-contain object-center"
                />
              ) : featuredMedia ? (
                <img
                  src={featuredMedia}
                  alt={project.displayName}
                  className="w-full h-full object-contain object-center"
                  onLoad={handleImageLoad}
                />
              ) : null}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Gallery */}
      {allImages.length > 0 && (
        <section className="pb-20 bg-background">
          <div className="container">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-foreground mb-8">
              Project Gallery
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {allImages.map((src, i) => (
                <motion.div
                  key={src}
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                  className=""
                >
                  <button
                    onClick={() => openLightbox(i)}
                    className="group block w-full rounded-xl overflow-hidden cursor-pointer"
                    aria-label={`View image ${i + 1}`}
                  >
                    <img
                      src={src}
                      alt={`${project.displayName} – Image ${i + 1}`}
                      className="w-full object-cover group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                    />
                  </button>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Lightbox */}
      {lightboxIdx !== null && allImages[lightboxIdx] && (
        <div
          className="fixed inset-0 z-[100] bg-hero-overlay/90 flex items-center justify-center p-4"
          onClick={closeLightbox}
        >
          <button
            onClick={closeLightbox}
            className="absolute top-6 right-6 text-primary-foreground/80 hover:text-primary-foreground z-10"
            aria-label="Close lightbox"
          >
            <X className="w-8 h-8" />
          </button>

          {allImages.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  prevImage();
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 bg-primary/60 hover:bg-primary/80 text-primary-foreground rounded-full p-2 z-10"
                aria-label="Previous image"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  nextImage();
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 bg-primary/60 hover:bg-primary/80 text-primary-foreground rounded-full p-2 z-10"
                aria-label="Next image"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </>
          )}

          <img
            src={allImages[lightboxIdx]}
            alt={`${project.displayName} – Image ${lightboxIdx + 1}`}
            className="max-w-full max-h-[85vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />

          <div className="absolute bottom-6 text-primary-foreground/70 text-sm">
            {lightboxIdx + 1} / {allImages.length}
          </div>
        </div>
      )}
    </Layout>
  );
};

export default PortfolioProject;
