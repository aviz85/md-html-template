/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.externals = [...config.externals, 'canvas', 'jsdom']
    return config
  },
  experimental: {
    // Server Actions are enabled by default in Next.js 14
  }
}

module.exports = nextConfig 