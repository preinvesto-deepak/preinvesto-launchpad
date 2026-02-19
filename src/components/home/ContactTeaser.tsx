import { useState } from "react";
import { Link } from "react-router-dom";
import { Send, MessageCircle } from "lucide-react";
import { BRAND } from "@/data/content";

const ContactTeaser = () => {
  const [form, setForm] = useState({ name: "", phone: "", message: "" });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Placeholder - would connect to backend
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 3000);
    setForm({ name: "", phone: "", message: "" });
  };

  return (
    <section className="py-20 lg:py-28 bg-background">
      <div className="container">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <p className="text-accent font-medium tracking-widest uppercase text-sm mb-3">Get In Touch</p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Ready to Start Your Project?
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-8">
              Share your requirements and our team will get back to you with a detailed quotation within 24 hours.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <a
                href={BRAND.whatsappLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#25D366] text-[#fff] font-semibold rounded-lg hover:opacity-90 transition-opacity"
              >
                <MessageCircle className="w-5 h-5" />
                Chat on WhatsApp
              </a>
              <Link
                to="/contact"
                className="inline-flex items-center justify-center px-6 py-3 border border-border text-foreground font-semibold rounded-lg hover:bg-muted transition-colors"
              >
                Visit Contact Page
              </Link>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="bg-card rounded-xl p-8 shadow-sm border border-border space-y-5">
            <div>
              <label htmlFor="teaser-name" className="block text-sm font-medium text-foreground mb-1.5">Name</label>
              <input
                id="teaser-name"
                type="text"
                required
                maxLength={100}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-4 py-3 rounded-lg border border-input bg-background text-foreground text-sm focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none transition"
                placeholder="Your name"
              />
            </div>
            <div>
              <label htmlFor="teaser-phone" className="block text-sm font-medium text-foreground mb-1.5">Phone</label>
              <input
                id="teaser-phone"
                type="tel"
                required
                maxLength={15}
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-4 py-3 rounded-lg border border-input bg-background text-foreground text-sm focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none transition"
                placeholder="+91 XXXXXXXXXX"
              />
            </div>
            <div>
              <label htmlFor="teaser-msg" className="block text-sm font-medium text-foreground mb-1.5">Message</label>
              <textarea
                id="teaser-msg"
                required
                maxLength={500}
                rows={3}
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                className="w-full px-4 py-3 rounded-lg border border-input bg-background text-foreground text-sm focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none transition resize-none"
                placeholder="Tell us about your project..."
              />
            </div>
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-accent text-accent-foreground font-semibold rounded-lg hover:opacity-90 transition-opacity"
            >
              {submitted ? "Message Sent!" : <><Send className="w-4 h-4" /> Send Message</>}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
};

export default ContactTeaser;
