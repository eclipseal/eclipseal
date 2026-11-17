import type { Metadata, Viewport } from "next";
import { Archivo, Geist, JetBrains_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });
const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], axes: ["wdth"] });

export const metadata: Metadata = {
  metadataBase: new URL(`https://${site.domain}`),
  title: {
    default: `${site.name}: confidential AI compute, proven in the dark`,
    template: `%s | ${site.name}`,
  },
  description: site.description,
  openGraph: {
    title: `${site.name}: proven in the dark`,
    description: site.description,
    images: [{ url: "/og.jpg", width: 1200, height: 630, alt: "A colossal ring gate on a dark desert at night under a field of stars" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    site: site.handle,
    creator: site.handle,
    title: `${site.name}: proven in the dark`,
    description: site.description,
    images: ["/og.jpg"],
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0b",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={cn("dark antialiased", geist.variable, jetbrains.variable, archivo.variable)}>
      <body className="min-h-dvh">
        <TooltipProvider delayDuration={150}>{children}</TooltipProvider>
        <Toaster theme="dark" position="bottom-right" />
      </body>
    </html>
  );
}
