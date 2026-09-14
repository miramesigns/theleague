import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MFL League Companion',
    short_name: 'MFL Companion',
    description: 'Phone-first fantasy football companion for MFL leagues.',
    start_url: '/scores',
    display: 'standalone',
    background_color: '#08111f',
    theme_color: '#08111f',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
    ],
  };
}
