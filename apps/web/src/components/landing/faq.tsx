import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const faqs = [
  {
    q: "What is a trusted execution environment?",
    a: "A TEE is an isolated region of a CPU or GPU. Its memory is encrypted with keys that never leave the chip, so the operating system, the hypervisor and the cloud operator cannot read what runs inside. The chip also signs a quote describing exactly what was loaded.",
  },
  {
    q: "How do I verify what ran?",
    a: "Every workload gets an attestation report: measurement registers (MRTD, RTMR0 to RTMR3), the hash of your docker-compose file and a hardware signature. Compare the compose hash with your own file, check the signature, and match the report digest against its anchor on Robinhood Chain.",
  },
  {
    q: "Do I need to rewrite my app?",
    a: "No. If it runs in Docker Compose it runs on Eclipseal. Secrets are injected as encrypted environment variables that only a measured enclave can decrypt.",
  },
  {
    q: "What does confidential mode cost in performance?",
    a: "Expect a small overhead, typically under ten percent for GPU inference, depending on the model and how much data crosses the CPU to GPU boundary.",
  },
  {
    q: "What does holding $ECLS unlock?",
    a: "Sign in to the console with the wallet that holds it. The balance is read from Robinhood Chain and sets your tier: a private workspace for agents, jobs and secrets, lower prices on compute and inference, your own API key and higher limits. Nothing is staked or locked, and signing in costs no gas.",
  },
  {
    q: "Do I need $ECLS to try Eclipseal?",
    a: "No. The live model demo and the verifier are open to everyone. Signing in is free, and your tier follows the $ECLS balance of the wallet you sign in with.",
  },
  {
    q: "What else is $ECLS used for?",
    a: "Planned next: paying for compute directly, bonding by node operators who list TEE hardware, fee buybacks and votes on which OS images and firmware the verifier trusts. It trades on Pons with a fixed supply of one billion.",
  },
  {
    q: "Is Eclipseal affiliated with Robinhood?",
    a: "No. Eclipseal is an independent project that builds on Robinhood Chain, a public and permissionless network. It is not endorsed by Robinhood Markets, Inc.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="bg-ink px-4 py-24 md:px-8 md:py-36">
      <div className="mx-auto grid max-w-[1240px] gap-10 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-16">
        <h2 className="type-display text-[11vw] text-bone md:sticky md:top-28 md:self-start md:text-[min(3.3vw,46px)]">Questions</h2>
        <Accordion type="single" collapsible className="border-t border-line">
          {faqs.map((f, i) => (
            <AccordionItem key={f.q} value={`q${i}`} className="border-b border-line">
              <AccordionTrigger className="py-6 text-left text-base font-medium text-bone hover:no-underline md:text-lg">{f.q}</AccordionTrigger>
              <AccordionContent className="max-w-[62ch] pb-6 text-[15px] leading-relaxed text-bone-dim">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
