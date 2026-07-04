"use client"

import { useRef, useState } from "react"
import { motion, useInView } from "framer-motion"

const ease = [0.25, 0.46, 0.45, 0.94] as const

const nodes = [
  { label: "Base", pos: "top-[12%] left-[12%]", desc: "L2 on Ethereum" },
  { label: "Ethereum", pos: "top-[12%] right-[12%]", desc: "Mainnet" },
  { label: "Arbitrum", pos: "top-1/2 left-[2%] -translate-y-1/2", desc: "L2 Rollup" },
  { label: "Stellar", pos: "top-1/2 right-[2%] -translate-y-1/2", desc: "Settlement layer" },
  { label: "Solana", pos: "bottom-[12%] left-[12%]", desc: "High throughput" },
  { label: "CCTP", pos: "bottom-[12%] right-[12%]", desc: "Circle bridge" },
]

export function Coverage() {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: "-100px" })
  const [hovered, setHovered] = useState<number | null>(null)

  return (
    <section ref={ref} className="relative py-32 px-8 md:px-16 overflow-hidden bg-[#050505]">
      <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-20 items-center">
        {/* Left content */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 1, ease }}
        >
          <p className="font-mono text-sm tracking-[0.3em] text-white/50 mb-6">CROSS-CHAIN COVERAGE</p>
          <h2 className="font-sans text-5xl md:text-6xl lg:text-7xl font-light tracking-tight mb-8 text-white">
            One private note,
            <br />
            settled <span className="italic text-white/60">everywhere</span>.
          </h2>
          <p className="text-lg md:text-xl leading-relaxed max-w-lg mb-10 text-white/50">
            USDC burns on the source chain and mints fresh on Stellar — no wrapped tokens. Every settlement resolves inside a zero-knowledge proof. Your balance never touches a public ledger.
          </p>
          <a href="#" className="group inline-flex items-center gap-3 font-mono text-base text-white/60 hover:text-white transition-colors">
            <span className="border-b border-white/20 pb-1 group-hover:border-white/50 transition-colors">Explore the protocol</span>
            <span className="transition-transform group-hover:translate-x-1">→</span>
          </a>
        </motion.div>

        {/* Right: orbital diagram */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={inView ? { opacity: 1, scale: 1 } : {}}
          transition={{ duration: 1, delay: 0.2, ease }}
        >
          <div className="relative aspect-square w-full max-w-[560px] mx-auto rounded-3xl overflow-hidden" style={{
            background: "radial-gradient(circle at 50% 50%, rgba(255,255,255,0.03), rgba(5,5,5,0.5))",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 0 80px rgba(255,255,255,0.02)",
          }}>

            {/* Static SVG rings */}
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="0.25" />
              <circle cx="50" cy="50" r="27" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="0.2" strokeDasharray="1.5 1.5" />
              <circle cx="50" cy="50" r="15" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.15" strokeDasharray="0.5 1.5" />
              {/* Spokes */}
              <line x1="50" y1="8" x2="50" y2="92" stroke="rgba(255,255,255,0.04)" strokeWidth="0.15" strokeDasharray="1.5 1.5" />
              <line x1="8" y1="50" x2="92" y2="50" stroke="rgba(255,255,255,0.04)" strokeWidth="0.15" strokeDasharray="1.5 1.5" />
              <line x1="20" y1="20" x2="80" y2="80" stroke="rgba(255,255,255,0.03)" strokeWidth="0.15" strokeDasharray="1.5 1.5" />
              <line x1="80" y1="20" x2="20" y2="80" stroke="rgba(255,255,255,0.03)" strokeWidth="0.15" strokeDasharray="1.5 1.5" />
            </svg>

            {/* Rotating dashed ring overlay — just decorative */}
            <motion.svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox="0 0 100 100"
              animate={{ rotate: 360 }}
              transition={{ duration: 90, repeat: Infinity, ease: "linear" }}
            >
              <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="0.3" strokeDasharray="0.6 3" />
            </motion.svg>

            {/* Counter-rotating inner dashed ring */}
            <motion.svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox="0 0 100 100"
              animate={{ rotate: -360 }}
              transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
            >
              <circle cx="50" cy="50" r="27" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="0.25" strokeDasharray="0.4 2" />
            </motion.svg>

            {/* Center glow */}
            <motion.div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
              style={{ width: "50%", height: "50%", background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.04) 40%, transparent 70%)" }}
              animate={{ scale: [1, 1.15, 1], opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            />

            {/* Center node */}
            <motion.div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center rounded-full"
              style={{
                width: "30%", height: "30%",
                background: "radial-gradient(circle at 50% 40%, #1a1a1a, #050505)",
                border: "1px solid rgba(255,255,255,0.15)",
              }}
              animate={{
                boxShadow: [
                  "0 0 30px rgba(255,255,255,0.04)",
                  "0 0 60px rgba(255,255,255,0.08)",
                  "0 0 30px rgba(255,255,255,0.04)",
                ],
              }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            >
              <motion.div
                className="w-10 h-10 rounded-full flex items-center justify-center mb-2"
                style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.25), rgba(255,255,255,0.08))", border: "1px solid rgba(255,255,255,0.15)" }}
                animate={{
                  boxShadow: [
                    "0 0 16px rgba(255,255,255,0.15)",
                    "0 0 36px rgba(255,255,255,0.3)",
                    "0 0 16px rgba(255,255,255,0.15)",
                  ],
                }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              >
                <motion.svg
                  width="16" height="16" viewBox="0 0 28 28" fill="none"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                >
                  <path d="M14 0L17.5 10.5L28 14L17.5 17.5L14 28L10.5 17.5L0 14L10.5 10.5L14 0Z" fill="white" fillOpacity="0.85" />
                </motion.svg>
              </motion.div>
              <span className="text-base font-medium text-white/85">Shade</span>
              <span className="text-[11px] text-white/35">ZK core</span>
            </motion.div>

            {/* Orbiting pills — same positions as before, enhanced */}
            {nodes.map((node, i) => (
              <motion.div
                key={node.label}
                className={`absolute ${node.pos} flex items-center gap-2.5 px-5 py-3 rounded-full cursor-pointer`}
                style={{
                  background: hovered === i ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)",
                  border: hovered === i ? "1px solid rgba(255,255,255,0.3)" : "1px solid rgba(255,255,255,0.08)",
                  backdropFilter: "blur(8px)",
                  transition: "all 0.3s ease",
                  boxShadow: hovered === i ? "0 0 20px rgba(255,255,255,0.05)" : "none",
                }}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={inView ? { opacity: 1, scale: 1 } : {}}
                transition={{ duration: 0.6, delay: 0.4 + i * 0.08, ease }}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              >
                <span className="w-2 h-2 rounded-full bg-white/40" />
                <span className="text-[15px] font-medium whitespace-nowrap" style={{ color: hovered === i ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.55)", transition: "color 0.3s" }}>
                  {node.label}
                </span>
              </motion.div>
            ))}

            {/* Floating particles */}
            {[
              { w: 1.8, h: 1.6, l: 30, t: 25, dur: 5, del: 0 },
              { w: 2.1, h: 1.9, l: 65, t: 35, dur: 6, del: 1.2 },
              { w: 1.5, h: 2.0, l: 45, t: 60, dur: 4.5, del: 2.5 },
              { w: 2.3, h: 1.7, l: 72, t: 45, dur: 5.5, del: 3.8 },
              { w: 1.7, h: 1.8, l: 28, t: 70, dur: 6.5, del: 1.5 },
              { w: 2.0, h: 2.2, l: 55, t: 55, dur: 4, del: 4.2 },
            ].map((p, i) => (
              <motion.div
                key={`p-${i}`}
                className="absolute rounded-full bg-white pointer-events-none"
                style={{ width: p.w, height: p.h, left: `${p.l}%`, top: `${p.t}%` }}
                animate={{ opacity: [0, 0.35, 0], y: [0, -15, -30] }}
                transition={{ duration: p.dur, repeat: Infinity, delay: p.del, ease: "easeOut" }}
              />
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  )
}
