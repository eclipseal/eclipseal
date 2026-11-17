import { SmoothScroll, Grain } from "@/components/landing/smooth-scroll";
import { SiteNav } from "@/components/landing/site-nav";
import { Hero } from "@/components/landing/hero";
import { Manifesto } from "@/components/landing/manifesto";
import { Products } from "@/components/landing/products";
import { ProofStack } from "@/components/landing/proof-stack";
import { LiveProof } from "@/components/landing/live-proof";
import { ModelsMarquee } from "@/components/landing/models-marquee";
import { ChainToken } from "@/components/landing/chain-token";
import { Faq } from "@/components/landing/faq";
import { Footer } from "@/components/landing/footer";

export default function Home() {
  return (
    <SmoothScroll>
      <SiteNav />
      <main>
        <Hero />
        <Manifesto />
        <Products />
        <ProofStack />
        <LiveProof />
        <ModelsMarquee />
        <ChainToken />
        <Faq />
      </main>
      <Footer />
      <Grain />
    </SmoothScroll>
  );
}
