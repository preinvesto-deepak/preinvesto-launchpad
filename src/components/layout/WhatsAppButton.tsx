import { MessageCircle } from "lucide-react";
import { BRAND } from "@/data/content";

const WhatsAppButton = () => (
  <a
    href={BRAND.whatsappLink}
    target="_blank"
    rel="noopener noreferrer"
    className="fixed bottom-6 right-6 z-50 bg-[#25D366] rounded-full flex items-center gap-2 px-5 py-3 shadow-lg hover:scale-105 transition-transform"
    aria-label="Chat on WhatsApp"
  >
    <span className="text-white font-semibold text-sm">Get Quote</span>
    <MessageCircle className="w-6 h-6 text-white" />
  </a>
);

export default WhatsAppButton;
