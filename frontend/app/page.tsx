import { Navbar } from "@/components/navbar"
import { Hero } from "@/components/hero"
import { About } from "@/components/about"
import { Coverage } from "@/components/coverage"
import { Works } from "@/components/works"
import { TechMarquee } from "@/components/tech-marquee"
import { Footer } from "@/components/footer"
import { SmoothCursor } from "@/components/ui/smooth-cursor"
import { SmoothScroll } from "@/components/smooth-scroll"
import { SectionBlend } from "@/components/section-blend"

export default function Home() {
  return (
    <SmoothScroll>
      <SmoothCursor />
      {/* navbar removed */}
      <main>
        <Hero />
        <SectionBlend />
        <About />
        <Coverage />
        <Works />
{/* tech marquee removed */}
        <Footer />
      </main>
    </SmoothScroll>
  )
}
