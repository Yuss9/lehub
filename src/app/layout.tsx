import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import "./globals.css";
import { Pwa } from "@/components/pwa";
export const metadata: Metadata = {
  title: { default: "lehub — La maison, simplement", template: "%s · lehub" },
  description: "Ton espace privé pour organiser la maison.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body>
        <Providers>
          <Pwa />
          {children}
        </Providers>
      </body>
    </html>
  );
}
