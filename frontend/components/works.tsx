"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"

const features = [
  {
    title: "Shade Bridge",
    tags: ["CCTP v2", "Base Sepolia", "Arc"],
    description: "Fund your Arc balance from Base Sepolia, Ethereum Sepolia, or Arbitrum Sepolia. USDC burns on the source chain, Circle Iris attests, and native USDC mints on Arc. No wrapped tokens — the real thing.",
    status: "Live",
  },
  {
    title: "Shade Stream",
    tags: ["StreamPay", "Real USDC", "$0.0001/sec"],
    description: "A payable escrow that streams real native USDC by the second at a fixed rate. Open with a cap, watch the on-chain meter tick, withdraw mid-stream, pause and resume, or stop with an automatic refund of the unspent tail.",
    status: "Live",
  },
  {
    title: "Shade Service",
    tags: ["x402", "Vouchers", "ZK settle"],
    description: "Private per-request billing for agents and services. Each call is an off-chain EdDSA voucher — zero gas per tick — and only the net settles on-chain with one Groth16 proof that hides the per-request detail.",
    status: "Preview",
  },
  {
    title: "Shade Receipts",
    tags: ["Events", "Audit", "arcscan"],
    description: "Every run is auditable. Receipts reconstruct from on-chain events (Opened / Withdrawn / Paused / Resumed / Stopped) and prove the value-conservation invariant: payee paid + payer refund equals the deposited cap.",
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
        <h2 className="font-sans text-3xl md:text-5xl font-light italic">What Shade Pay Does</h2>
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
