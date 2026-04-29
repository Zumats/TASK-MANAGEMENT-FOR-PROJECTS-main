import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { SyncIndicator } from "@/components/SyncIndicator";
import { StartOfflineSync } from "@/components/StartOfflineSync";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Task Management",
  description: "Task management web system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AnimatedBackground />
        <AuthProvider>
          <SyncIndicator />
          <StartOfflineSync />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
