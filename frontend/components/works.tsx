"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"

const features = [
  {
    title: "Shade Shield",
    tags: ["Bridge", "CCTP", "Stellar"],
    description: "Bring USDC in from Base, Ethereum, Arbitrum, or Solana. It burns on the source chain and mints fresh on Stellar. Your private note is generated client-side before anything is signed.",
    status: "Live",
  },
  {
    title: "Shade RFQ",
    tags: ["Quotes", "Solvers", "Intent"],
    description: "Request a private quote from solvers without revealing your balance. Compare net output, fees, and expiry — accept the best one. If a solver defaults, your note stays untouched.",
    status: "Live",
  },
  {
    title: "Shade Remit",
    tags: ["Payout", "Anchor", "Fiat"],
    description: "Cash out to a bank, mobile wallet, or cash pickup. Payouts route through licensed anchor partners. We always tell you what's real vs. simulated, right on the control.",
    status: "Partner-gated",
  },
  {
    title: "Shade View",
    tags: ["Disclosure", "Receipt", "Compliance"],
    description: "Generate a signed disclosure receipt only when you choose to. Pick a date range, select which transactions to include. Nothing is shared until you decide to share it.",
    status: "Live",
  },
]

export function Works() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  const toggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index)
  }

  return (
    <section className="relative py-32 px-8 md:px-12 md:py-24 bg-[#050505]">
      {/* Section Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
        className="mb-24"
      >
        <p className="font-mono text-xs tracking-[0.3em] text-muted-foreground mb-4">04 — PRODUCT SURFACE</p>
        <h2 className="font-sans text-3xl md:text-5xl font-light italic">What Shade Does</h2>
      </motion.div>

      {/* Features List */}
      <div>
        {features.map((feature, index) => (
          <motion.div
            key={feature.title}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: index * 0.08 }}
            className="border-t border-white/10 cursor-pointer"
            onMouseEnter={() => setOpenIndex(index)}
            onMouseLeave={() => setOpenIndex(null)}
          >
            <div className="py-8 md:py-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-6 flex-1">
                <span className="font-mono text-xs text-white/20 tracking-widest hidden md:block">
                  0{index + 1}
                </span>
                <motion.h3
                  className="font-sans text-3xl md:text-5xl lg:text-6xl font-light tracking-tight transition-colors duration-300"
                  animate={{ color: openIndex === index ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.6)" }}
                >
                  {feature.title}
                </motion.h3>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-mono text-[10px] tracking-wider px-3 py-1 border border-white/10 rounded-full text-white/30">
                  {feature.status}
                </span>
                <motion.span
                  className="text-white/30 text-xl"
                  animate={{ rotate: openIndex === index ? 180 : 0 }}
                  transition={{ duration: 0.3 }}
                >
                  ↓
                </motion.span>
              </div>
            </div>

            <AnimatePresence>
              {openIndex === index && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
                  className="overflow-hidden"
                >
                  <div className="pb-10 md:pl-16 md:pr-20">
                    <p className="text-base md:text-lg leading-relaxed text-white/40 max-w-2xl mb-6">
                      {feature.description}
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      {feature.tags.map((tag) => (
                        <span
                          key={tag}
                          className="font-mono text-[10px] tracking-wider px-3 py-1.5 border border-white/10 rounded-full text-white/25"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}

        {/* Bottom Border */}
        <div className="border-t border-white/10" />
      </div>
    </section>
  )
}
