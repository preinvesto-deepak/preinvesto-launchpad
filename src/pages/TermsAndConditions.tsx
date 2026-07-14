import Layout from "@/components/layout/Layout";
import SEO from "@/components/SEO";

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mb-8">
    <h2 className="text-xl font-bold text-foreground mb-3 pb-2 border-b border-border">{title}</h2>
    <div className="space-y-3 text-muted-foreground text-sm leading-relaxed">{children}</div>
  </div>
);

const TermsAndConditions = () => (
  <Layout>
    <SEO
      title="Terms and Conditions | Preinvesto"
      description="Terms and Conditions for using Preinvesto.com property portal and services. Please read carefully before using our platform."
      canonical="https://preinvesto.com/terms"
    />

    <div className="bg-section-alt py-12 border-b border-border">
      <div className="container max-w-4xl">
        <p className="text-accent font-medium tracking-widest uppercase text-xs mb-2">Legal</p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-foreground mb-3">Terms &amp; Conditions</h1>
        <p className="text-muted-foreground text-sm">Last updated: March 2026 &nbsp;|&nbsp; Effective immediately upon use of this website.</p>
      </div>
    </div>

    <div className="container max-w-4xl py-12">

      {/* Important warning box */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-10">
        <p className="text-amber-800 font-semibold text-sm mb-1">⚠️ Important Safety Warning</p>
        <p className="text-amber-700 text-sm leading-relaxed">
          Never pay any advance, token amount, or security deposit to any person you found through Preinvesto without
          physically visiting the property and verifying ownership documents with a legal professional.
          Preinvesto will never ask you to transfer money to complete a listing or transaction.
        </p>
      </div>

      <Section title="1. About Preinvesto">
        <p>
          Preinvesto.com is an online real estate portal and interior design company website operated by
          Preinvesto Interiors, Hyderabad, Telangana, India. The platform provides an online marketplace
          where property owners, agents and sellers can list properties, and buyers and tenants can search
          and discover them.
        </p>
        <p>
          By accessing or using this website, you agree to be bound by these Terms and Conditions.
          If you do not agree, please discontinue use of this website immediately.
        </p>
      </Section>

      <Section title="2. Intermediary Status">
        <p>
          Preinvesto is an <strong className="text-foreground">intermediary</strong> as defined under
          Section 2(w) of the Information Technology Act, 2000 and the Information Technology
          (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021.
        </p>
        <p>
          As an intermediary, Preinvesto provides a platform for third-party users to list and discover
          properties. Preinvesto does not initiate, participate in, facilitate, or become a party to any
          transaction, agreement, or financial exchange between any two users on this platform.
          Preinvesto is not an agent of any buyer, seller, landlord, or tenant.
        </p>
      </Section>

      <Section title="3. No Verification of Listings">
        <p>
          Preinvesto does not independently verify the accuracy, completeness, title, ownership, or
          legitimacy of any property listing posted by any user. All listings on this platform are
          provided on an <strong className="text-foreground">"as is" and "as available"</strong> basis
          without any warranty, representation, or guarantee of any kind, either express or implied.
        </p>
        <p>
          Preinvesto makes no representation that any listed property exists, is currently available,
          is accurately described, or that the lister is the legitimate owner or an authorised agent.
          Users are solely responsible for verifying all property details independently before taking
          any action.
        </p>
      </Section>

      <Section title="4. No Liability for Fraud or False Listings">
        <p>
          Preinvesto shall not be held responsible or liable — directly or indirectly — for any loss,
          financial or otherwise, suffered by any user as a result of a false, fraudulent, misleading,
          inaccurate, or non-existent property listing posted by another user or any third party on
          this platform.
        </p>
        <p>
          This includes but is not limited to: loss of advance payments, token amounts, security
          deposits, brokerage fees, or any other financial commitment made by a user in reliance on
          a listing found on this website.
        </p>
        <p>
          Preinvesto does not have the obligation to physically visit, inspect, or conduct background
          verification or police verification of any user or any property listed on this platform.
        </p>
      </Section>

      <Section title="5. User Responsibility — Listing a Property">
        <p>
          Any person or entity listing a property on Preinvesto hereby confirms and warrants that:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>All information provided in the listing is true, accurate, current, and complete.</li>
          <li>They are the legitimate owner of the property or are duly authorised to list it.</li>
          <li>The property exists and is genuinely available for sale or rent as described.</li>
          <li>They will not solicit any advance payment, token money, or security deposit through fraudulent means.</li>
          <li>They will comply with all applicable laws including RERA (Real Estate Regulation and Development Act, 2016).</li>
        </ul>
        <p>
          Listing a false, non-existent, or fraudulently described property is a serious violation of
          these Terms and may constitute a criminal offence under the Indian Penal Code (IPC), the
          Information Technology Act, 2000, and the RERA Act. Preinvesto reserves the right to
          immediately remove any listing and permanently ban any user found to be in violation,
          and will cooperate fully with law enforcement authorities.
        </p>
      </Section>

      <Section title="6. User Responsibility — Searching for a Property">
        <p>
          Users searching for properties on Preinvesto are advised to:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Physically visit and inspect any property before making any payment or commitment.</li>
          <li>Verify the identity of the property owner or agent through official government-issued documents.</li>
          <li>Verify property ownership through the relevant Sub-Registrar Office or official land records.</li>
          <li>Consult a qualified legal professional before signing any agreement or transferring any funds.</li>
          <li>Never transfer money to any person without completing the above due diligence steps.</li>
          <li>Be cautious of listings that seem too good to be true or where the lister requests urgent payment.</li>
        </ul>
      </Section>

      <Section title="7. Disclaimer of Warranties">
        <p>
          To the fullest extent permitted by applicable law, Preinvesto expressly disclaims all
          warranties, express or implied, statutory or otherwise, including but not limited to:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Implied warranties of merchantability or fitness for a particular purpose.</li>
          <li>Accuracy, completeness, timeliness, or reliability of any listing or content on this platform.</li>
          <li>That the website will be uninterrupted, error-free, or free from viruses or harmful components.</li>
          <li>That search results will meet the user's requirements or expectations.</li>
        </ul>
      </Section>

      <Section title="8. Limitation of Liability">
        <p>
          Preinvesto's total liability to any user for any claim arising out of or in connection with
          the use of this website shall not exceed the amount paid by that user to Preinvesto (if any)
          in the 3 months preceding the claim. Preinvesto shall not be liable for any indirect,
          incidental, consequential, special, or punitive damages of any kind.
        </p>
      </Section>

      <Section title="9. Intellectual Property">
        <p>
          All content on this website including text, images, graphics, logos, and software is the
          property of Preinvesto Interiors or its licensors and is protected under applicable
          intellectual property laws. You may not reproduce, distribute, or use any content from
          this website without prior written permission from Preinvesto.
        </p>
        <p>
          By posting a listing or any content on this platform, you grant Preinvesto a non-exclusive,
          royalty-free licence to display, reproduce, and use that content for the purpose of operating
          and promoting the platform.
        </p>
      </Section>

      <Section title="10. Prohibited Activities">
        <p>Users of this platform must not:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Post false, misleading, or fraudulent property listings.</li>
          <li>Impersonate any person, property owner, or real estate agent.</li>
          <li>Use this platform for any unlawful purpose.</li>
          <li>Collect personal data of other users without their consent.</li>
          <li>Attempt to hack, disrupt, or damage the website or its infrastructure.</li>
          <li>Post duplicate, spam, or irrelevant listings.</li>
          <li>Use the platform to advertise services unrelated to real estate without permission.</li>
        </ul>
        <p>
          Preinvesto reserves the right to remove any content and suspend or permanently ban any
          user who violates these prohibitions, without notice and without refund.
        </p>
      </Section>

      <Section title="11. RERA Compliance">
        <p>
          Sellers and agents listing new residential projects on this platform are responsible for
          ensuring their projects are registered under the Real Estate (Regulation and Development)
          Act, 2016 (RERA) with the Telangana Real Estate Regulatory Authority (TSRERA) where
          applicable. Preinvesto does not verify RERA registration of any listed project and is
          not responsible for any RERA non-compliance by a lister.
        </p>
      </Section>

      <Section title="12. Governing Law and Dispute Resolution">
        <p>
          These Terms and Conditions shall be governed by and construed in accordance with the laws
          of India. Any dispute arising out of or in connection with these Terms shall be subject to
          the exclusive jurisdiction of the courts in Hyderabad, Telangana, India.
        </p>
      </Section>

      <Section title="13. Amendments">
        <p>
          Preinvesto reserves the right to amend, modify, or update these Terms and Conditions at any
          time without prior notice. The updated Terms will be posted on this page with a revised
          effective date. Continued use of this website after any changes constitutes your acceptance
          of the updated Terms.
        </p>
      </Section>

      <Section title="14. Report Fraud">
        <p>
          If you believe a listing on Preinvesto is fraudulent or you have been a victim of fraud
          involving a listing found on this platform, please:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Report it immediately to us at <strong className="text-foreground">contact@preinvesto.com</strong> with the listing details.</li>
          <li>File a complaint with your nearest police station or the Telangana Cyber Crime Police at <strong className="text-foreground">cybercrime.gov.in</strong>.</li>
          <li>File a complaint with the National Consumer Helpline at <strong className="text-foreground">1915</strong>.</li>
        </ul>
        <p>
          Preinvesto will cooperate fully with law enforcement authorities investigating any fraud
          reported through or in connection with this platform.
        </p>
      </Section>

      <Section title="15. Contact Us">
        <p>
          For any questions or concerns regarding these Terms and Conditions, please contact us at:
        </p>
        <ul className="list-none space-y-1">
          <li><strong className="text-foreground">Email:</strong> contact@preinvesto.com</li>
          <li><strong className="text-foreground">Phone:</strong> +91 90309 82932</li>
          <li><strong className="text-foreground">Address:</strong> Preinvesto Interiors, Hyderabad, Telangana, India</li>
        </ul>
      </Section>

      <div className="mt-10 p-5 bg-muted rounded-xl text-xs text-muted-foreground leading-relaxed">
        <strong className="text-foreground">Legal Disclaimer:</strong> The Terms and Conditions on this page have been prepared based on industry practice and are intended as a general framework. They do not constitute legal advice. Preinvesto strongly recommends having these Terms reviewed by a qualified lawyer registered in Telangana/India who specialises in IT and real estate law before relying on them for legal protection.
      </div>

    </div>
  </Layout>
);

export default TermsAndConditions;
