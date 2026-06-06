import { motion, useScroll, useTransform } from 'framer-motion'

export function AnimatedCharacter() {
  const { scrollYProgress } = useScroll()
  const y = useTransform(scrollYProgress, [0, 1], [0, -60])
  const rotate = useTransform(scrollYProgress, [0, 1], [0, 16])

  return (
    <motion.div
      className="pointer-events-none fixed right-4 top-24 z-40 hidden lg:block"
      style={{ y, rotate }}
      animate={{ y: [0, -8, 0], rotate: [0, 2, 0] }}
      transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
    >
      <div className="relative h-20 w-20 rounded-full border border-cyan-300/35 bg-cyan-300/10 shadow-neon backdrop-blur">
        <div className="absolute inset-3 rounded-full border border-cyan-200/30" />
        <div className="absolute inset-[22%] rounded-full bg-cyan-200/55 blur-[2px]" />
      </div>
    </motion.div>
  )
}
