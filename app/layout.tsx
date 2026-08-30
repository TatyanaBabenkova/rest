import type { Metadata } from 'next';
import './globals.css';

const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: 'Вагон-ресторан АО «ФПК» — интерактивный прототип',
  description: 'Автономная система заказов для вагона-ресторана',
  openGraph: {
    title: 'Вагон-ресторан АО «ФПК»',
    description: 'Интерактивный прототип автономной системы заказов для поездов «Аврора» и «Буревестник».',
    images: [{ url: `${publicBasePath}/og.png`, width: 1200, height: 675, alt: 'Вагон-ресторан — интерактивный прототип' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Вагон-ресторан АО «ФПК»',
    description: 'Автономная система заказов на борту поезда.',
    images: [`${publicBasePath}/og.png`],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
