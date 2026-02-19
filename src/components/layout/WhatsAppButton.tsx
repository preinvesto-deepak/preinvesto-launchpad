import { MessageCircle } from "lucide-react";
import { BRAND } from "@/data/content";

const WhatsAppButton = () => (
  <a
    href={BRAND.whatsappLink}
    target="_blank"
    rel="noopener noreferrer"
    className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-[#25D366] rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
    aria-label="Chat on WhatsApp"
  >
    <MessageCircle className="w-7 h-7 text-[#fff]" />
  </a>
);

export default WhatsAppButton;
