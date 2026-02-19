import { useParams, Link } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import SEO, { breadcrumbSchema } from "@/components/SEO";
import { BLOG_POSTS } from "@/data/content";
import { CalendarDays, Clock, ArrowLeft, Share2 } from "lucide-react";

const BlogDetail = () => {
  const { slug } = useParams<{ slug: string }>();
  const post = BLOG_POSTS.find((p) => p.slug === slug);
  const related = BLOG_POSTS.filter((p) => p.slug !== slug).slice(0, 2);

  if (!post) {
    return (
      <Layout>
        <div className="pt-32 pb-20 container text-center">
          <h1 className="font-display text-3xl font-bold">Post not found</h1>
          <Link to="/blog" className="text-accent mt-4 inline-block">← Back to Blog</Link>
        </div>
      </Layout>
    );
  }

  const shareUrl = `https://preinvesto.com/blog/${slug}`;

  return (
    <Layout>
      <SEO
        title={post.title}
        description={post.excerpt}
        canonical={shareUrl}
        type="article"
        jsonLd={[
          breadcrumbSchema([
            { name: "Home", url: "https://preinvesto.com" },
            { name: "Blog", url: "https://preinvesto.com/blog" },
            { name: post.title, url: shareUrl },
          ]),
          {
            "@context": "https://schema.org",
            "@type": "BlogPosting",
            headline: post.title,
            description: post.excerpt,
            datePublished: post.date,
            author: { "@type": "Organization", name: "Preinvesto Interiors" },
          },
        ]}
      />

      <section className="pt-32 pb-12 bg-primary text-primary-foreground">
        <div className="container max-w-3xl">
          <Link to="/blog" className="inline-flex items-center gap-1 text-accent text-sm mb-6 hover:underline">
            <ArrowLeft className="w-4 h-4" /> Back to Blog
          </Link>
          <span className="text-xs text-accent font-medium tracking-wider uppercase block mb-2">{post.category}</span>
          <h1 className="font-display text-3xl sm:text-4xl font-bold mb-4">{post.title}</h1>
          <div className="flex items-center gap-4 text-sm text-primary-foreground/60">
            <span className="flex items-center gap-1"><CalendarDays className="w-4 h-4" /> {post.date}</span>
            <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {post.readTime}</span>
          </div>
        </div>
      </section>

      <section className="py-12 bg-background">
        <div className="container max-w-3xl">
          <img src={post.image} alt={post.title} className="w-full aspect-[16/9] object-cover rounded-xl mb-10" loading="lazy" />
          <article className="prose prose-lg max-w-none text-foreground prose-headings:font-display prose-headings:text-foreground prose-p:text-muted-foreground prose-a:text-accent">
            {post.content.split("\n\n").map((paragraph, i) => {
              if (paragraph.startsWith("## ")) {
                return <h2 key={i}>{paragraph.replace("## ", "")}</h2>;
              }
              return <p key={i}>{paragraph}</p>;
            })}
          </article>

          {/* Share */}
          <div className="flex items-center gap-4 mt-10 pt-8 border-t border-border">
            <Share2 className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Share:</span>
            <a href={`https://twitter.com/intent/tweet?url=${shareUrl}&text=${encodeURIComponent(post.title)}`} target="_blank" rel="noopener noreferrer" className="text-sm text-accent hover:underline">Twitter</a>
            <a href={`https://www.linkedin.com/shareArticle?mini=true&url=${shareUrl}`} target="_blank" rel="noopener noreferrer" className="text-sm text-accent hover:underline">LinkedIn</a>
            <a href={`https://wa.me/?text=${encodeURIComponent(post.title + " " + shareUrl)}`} target="_blank" rel="noopener noreferrer" className="text-sm text-accent hover:underline">WhatsApp</a>
          </div>

          {/* Related */}
          {related.length > 0 && (
            <div className="mt-16">
              <h2 className="font-display text-2xl font-bold text-foreground mb-8">Related Posts</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {related.map((r) => (
                  <Link key={r.slug} to={`/blog/${r.slug}`} className="group block bg-card rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition-shadow">
                    <div className="aspect-[16/10] overflow-hidden">
                      <img src={r.image} alt={r.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                    </div>
                    <div className="p-5">
                      <span className="text-xs text-accent font-medium">{r.category}</span>
                      <h3 className="font-display font-semibold text-foreground mt-1 group-hover:text-accent transition-colors">{r.title}</h3>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </Layout>
  );
};

export default BlogDetail;
