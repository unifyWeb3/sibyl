/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
    // Prevent webpack from trying to bundle these packages — they ship CJS
    // bundles with embedded Node.js dependencies that webpack chokes on
    // (gokite-aa-sdk has an internal dotenv import). Externalizing them means
    // they're loaded at runtime via require(), where Node.js handles them
    // natively with full access to process.env and node_modules.
    serverComponentsExternalPackages: ['gokite-aa-sdk', 'ethers'],
  },
};

export default nextConfig;
