import { Link } from "react-router-dom";
import { Instagram, Facebook, Youtube, Linkedin, MapPin, Phone, Mail } from "lucide-react";
import { BRAND, NAV_ITEMS, AREAS_SERVED } from "@/data/content";

const Footer = () => (
  <footer className="bg-primary text-primary-foreground" role="contentinfo">
    <div className="container py-16">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
        {/* Brand */}
        <div>
          <Link to="/" className="inline-block mb-4">
            <span className="font-display text-2xl font-bold">{BRAND.shortName}</span>
            <span className="block text-xs tracking-widest uppercase text-accent">Interiors</span>
          </Link>
          <p className="text-sm text-primary-foreground/70 leading-relaxed mb-6">
            Your trusted partner for affordable property search, quality construction, and stunning interior design in Hyderabad.
          </p>
          <div className="flex gap-3">
            {[
              { icon: Instagram, href: BRAND.social.instagram, label: "Instagram" },
              { icon: Facebook, href: BRAND.social.facebook, label: "Facebook" },
              { icon: Youtube, href: BRAND.social.youtube, label: "YouTube" },
              { icon: Linkedin, href: BRAND.social.linkedin, label: "LinkedIn" },
            ].map(({ icon: Icon, href, label }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-full border border-primary-foreground/20 flex items-center justify-center hover:bg-accent hover:border-accent transition-colors"
                aria-label={label}
              >
                <Icon className="w-4 h-4" />
              </a>
            ))}
          </div>
        </div>

        {/* Quick Links */}
        <div>
          <h3 className="font-semibold text-sm tracking-widest uppercase mb-5">Quick Links</h3>
          <ul className="space-y-3">
            {NAV_ITEMS.filter(i => !i.children).map((item) => (
              <li key={item.path}>
                <Link to={item.path} className="text-sm text-primary-foreground/70 hover:text-accent transition-colors">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Services */}
        <div>
          <h3 className="font-semibold text-sm tracking-widest uppercase mb-5">Services</h3>
          <ul className="space-y-3">
            {NAV_ITEMS.find(i => i.children)?.children?.map((child) => (
              <li key={child.path}>
                <Link to={child.path} className="text-sm text-primary-foreground/70 hover:text-accent transition-colors">
                  {child.label}
                </Link>
              </li>
            ))}
          </ul>
          <h3 className="font-semibold text-sm tracking-widest uppercase mt-8 mb-4">Areas We Serve</h3>
          <p className="text-xs text-primary-foreground/60 leading-relaxed">
            {AREAS_SERVED.join(" · ")}
          </p>
        </div>

        {/* Contact (NAP) */}
        <div>
          <h3 className="font-semibold text-sm tracking-widest uppercase mb-5">Contact</h3>
          <address className="not-italic space-y-4">
            <div className="flex gap-3 items-start">
              <MapPin className="w-4 h-4 mt-0.5 text-accent flex-shrink-0" />
              <div>
                <p className="text-sm text-primary-foreground/70">{BRAND.address}</p>
                <a href={BRAND.mapsLink} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline">
                  Get Directions →
                </a>
              </div>
            </div>
            <div className="flex gap-3 items-center">
              <Phone className="w-4 h-4 text-accent flex-shrink-0" />
              <div className="flex flex-col gap-1">
                <a href={`tel:${BRAND.phone}`} className="text-sm text-primary-foreground/70 hover:text-accent transition-colors">
                  {BRAND.phone}
                </a>
                <a href={`tel:${BRAND.phone2}`} className="text-sm text-primary-foreground/70 hover:text-accent transition-colors">
                  {BRAND.phone2}
                </a>
              </div>
            </div>
            <div className="flex gap-3 items-center">
              <Mail className="w-4 h-4 text-accent flex-shrink-0" />
              <a href={`mailto:${BRAND.email}`} className="text-sm text-primary-foreground/70 hover:text-accent transition-colors">
                {BRAND.email}
              </a>
            </div>
          </address>
        </div>
      </div>
    </div>

    <div className="border-t border-primary-foreground/10">
      <div className="container py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
        <p className="text-xs text-primary-foreground/50">
          © {new Date().getFullYear()} {BRAND.name}. All rights reserved.
        </p>
        <div className="flex gap-4">
          <Link to="/contact" className="text-xs text-primary-foreground/50 hover:text-accent transition-colors">Privacy Policy</Link>
          <Link to="/contact" className="text-xs text-primary-foreground/50 hover:text-accent transition-colors">Terms of Service</Link>
        </div>
      </div>
    </div>
  </footer>
);

export default Footer;
