import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Permit the companion's LAN address to load Next dev assets during phone smoke tests.
  allowedDevOrigins: ['10.0.0.9'],
};

export default nextConfig;
