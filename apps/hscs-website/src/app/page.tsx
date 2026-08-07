import {
  Hero,
  CredibilityStrip,
  Lifecycle,
  WhyHscs,
  ServiceLadder,
  MethodSection,
  AiClarifier,
  Toolbox,
  WhoWeHelp,
  WhatYouGet,
  ClosingCta,
} from "@/components/home/sections";

// HSCS homepage — sections S1–S11 in the approved Homepage Content Architecture
// order (S0 header and S12 footer are provided by the layout).
export default function HomePage() {
  return (
    <>
      <Hero />
      <CredibilityStrip />
      <Lifecycle />
      <WhyHscs />
      <ServiceLadder />
      <MethodSection />
      <AiClarifier />
      <Toolbox />
      <WhoWeHelp />
      <WhatYouGet />
      <ClosingCta />
    </>
  );
}
