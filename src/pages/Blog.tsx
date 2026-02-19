import { useState } from "react";
import { Link } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import SEO, { breadcrumbSchema } from "@/components/SEO";
import { motion } from "framer-motion";
import { BLOG_POSTS } from "@/data/content";
import { CalendarDays, Clock } from "lucide-react";

const Blog = () => {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");

  const categories = ["All", ...new Set(BLOG_POSTS.map((p) => p.category))];
  const filtered = BLOG_POSTS.filter((p) => {
    const matchCat = category === "All" || p.category === category;
    const matchSearch = p.title.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <Layout>
      <SEO
        title="Blog – Property, Construction & Interior Design Tips"
        description="Read expert tips on property search, construction quality, and interior design trends from Preinvesto Interiors Hyderabad."
        canonical="https://preinvesto.com/blog"
        jsonLd={breadcrumbSchema([
          { name: "Home", url: "https://preinvesto.com" },
          { name: "Blog", url: "https://preinvesto.com/blog" },
        ])}
      />

      <section className="relative pt-32 pb-20 bg-primary text-primary-foreground">
        <div className="container">
          <p className="text-accent font-medium tracking-widest uppercase text-sm mb-3">Blog</p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold">Insights & Inspiration</h1>
        </div>
      </section>

      <section className="py-20 bg-background">
        <div className="container">
          <div className="flex flex-col sm:flex-row gap-4 mb-12">
            <input
              type="text"
              placeholder="Search articles..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="px-4 py-3 rounded-lg border border-input bg-background text-foreground text-sm focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none transition flex-1 max-w-sm"
            />
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    category === cat ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground hover:bg-border"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filtered.map((post, i) => (
              <motion.div
                key={post.slug}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
              >
                <Link to={`/blog/${post.slug}`} className="group block bg-card rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition-shadow h-full">
                  <div className="aspect-[16/10] overflow-hidden">
                    <img
                      src={post.image}
                      alt={post.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                    />
                  </div>
                  <div className="p-6">
                    <span className="text-xs text-accent font-medium tracking-wider uppercase">{post.category}</span>
                    <h2 className="font-display text-lg font-semibold text-foreground mt-2 mb-3 group-hover:text-accent transition-colors line-clamp-2">
                      {post.title}
                    </h2>
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-4">{post.excerpt}</p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" /> {post.date}</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {post.readTime}</span>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </Layout>
  );
};

export default Blog;
