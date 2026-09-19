import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "ClimaGrid",
  description: "Cenários climáticos, geração eólica e exportação para estudos no ANAREDE.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
