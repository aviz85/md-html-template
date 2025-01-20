/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: true,
  },
  webpack: (config) => {
    config.externals = [...config.externals, 'canvas', 'jsdom']
    return config
  },
  async rewrites() {
    return [
      {
        source: '/api/jotform-results',
        destination: '/api/jotform-results'
      }
    ]
  }
}

module.exports = nextConfig 