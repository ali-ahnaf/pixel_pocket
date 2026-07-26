import type { Metadata, Viewport } from 'next';
import { Anybody, Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import AuthGuard from '@/components/AuthGuard';
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration';
import OfflineSync from '@/components/OfflineSync';

const anybody = Anybody({
  subsets: ['latin'],
  variable: '--font-anybody',
  weight: ['700', '800'],
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  weight: ['700'],
});

// iOS splash screens generated into /public/pwa-assets by pwa-asset-generator.
// Each device class needs a startup image per orientation, matched via media query.
const APPLE_SPLASH_DEVICES: { dw: number; dh: number; dpr: number; portrait: string; landscape: string }[] = [
  // iPhones
  { dw: 320, dh: 568, dpr: 2, portrait: '640-1136', landscape: '1136-640' },
  { dw: 375, dh: 667, dpr: 2, portrait: '750-1334', landscape: '1334-750' },
  { dw: 414, dh: 736, dpr: 3, portrait: '1242-2208', landscape: '2208-1242' },
  { dw: 375, dh: 812, dpr: 3, portrait: '1125-2436', landscape: '2436-1125' },
  { dw: 414, dh: 896, dpr: 2, portrait: '828-1792', landscape: '1792-828' },
  { dw: 414, dh: 896, dpr: 3, portrait: '1242-2688', landscape: '2688-1242' },
  { dw: 360, dh: 780, dpr: 3, portrait: '1080-2340', landscape: '2340-1080' },
  { dw: 390, dh: 844, dpr: 3, portrait: '1170-2532', landscape: '2532-1170' },
  { dw: 393, dh: 852, dpr: 3, portrait: '1179-2556', landscape: '2556-1179' },
  { dw: 428, dh: 926, dpr: 3, portrait: '1284-2778', landscape: '2778-1284' },
  { dw: 430, dh: 932, dpr: 3, portrait: '1290-2796', landscape: '2796-1290' },
  { dw: 402, dh: 874, dpr: 3, portrait: '1206-2622', landscape: '2622-1206' },
  { dw: 420, dh: 912, dpr: 3, portrait: '1260-2736', landscape: '2736-1260' },
  { dw: 440, dh: 956, dpr: 3, portrait: '1320-2868', landscape: '2868-1320' },
];

const appleStartupImages = APPLE_SPLASH_DEVICES.flatMap(({ dw, dh, dpr, portrait, landscape }) => {
  const base = `(device-width: ${dw}px) and (device-height: ${dh}px) and (-webkit-device-pixel-ratio: ${dpr})`;
  return [
    { url: `/pwa-assets/apple-splash-${portrait}.jpg`, media: `${base} and (orientation: portrait)` },
    { url: `/pwa-assets/apple-splash-${landscape}.jpg`, media: `${base} and (orientation: landscape)` },
  ];
});

export const metadata: Metadata = {
  title: 'Pocket Pixel — Expense Tracker',
  description: 'Track your expenses, one pixel at a time.',
  applicationName: 'Pocket Pixel',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/logo192.png', sizes: '192x192', type: 'image/png' },
      { url: '/logo512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/pwa-assets/apple-icon-180.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true,
    title: 'Pocket Pixel',
    statusBarStyle: 'black-translucent',
    startupImage: appleStartupImages,
  },
  other: {
    // Android/Chrome reads the unprefixed tag; Next only emits the apple- variant.
    'mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  themeColor: '#141315',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${anybody.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <ServiceWorkerRegistration />
        <OfflineSync />
        <AuthGuard>{children}</AuthGuard>
      </body>
    </html>
  );
}
