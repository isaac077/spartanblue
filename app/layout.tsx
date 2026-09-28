import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./spartanblue.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://spartanblue.vercel.app"),
  title: "Spartanblue",
  description: "Proyectos, tareas, procesos y conversaciones del equipo Spartanblue.",
  icons: {
    icon: [{ url: "/spartanblue-favicon.png", type: "image/png" }],
    shortcut: "/spartanblue-favicon.png",
  },
  openGraph: {
    title: "Spartanblue",
    description: "Claridad para coordinar proyectos, tareas, procesos y conversaciones.",
    images: [{ url: "/spartanblue-coast.jpg", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image", images: ["/spartanblue-coast.jpg"] },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
