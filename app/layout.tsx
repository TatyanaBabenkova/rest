import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: 'Северный экспресс — вагон-ресторан',
  description: 'Автономная система заказов для вагона-ресторана',
  openGraph: {
    title: 'Северный экспресс — вагон-ресторан',
    description: 'Премиальный прототип автономной системы заказов для пассажира, официанта, кухни, бара и менеджера.',
    images: [{ url: '/og.png', width: 1672, height: 941, alt: 'Северный экспресс — вагон-ресторан' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Северный экспресс — вагон-ресторан',
    description: 'Автономная система заказов на борту поезда.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
