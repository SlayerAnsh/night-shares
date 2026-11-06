import {
  Bebas_Neue,
  Inter,
  JetBrains_Mono,
  Nunito_Sans,
} from "next/font/google";

// Variable fonts load their full weight range. Each font sets the --font-* variable that the design token stacks read first.
const display = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-bebas-neue",
});
const sans = Nunito_Sans({
  subsets: ["latin"],
  variable: "--font-nunito-sans",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});
// World ID sign in and the trader app.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const fontVariables = [display, sans, mono, inter]
  .map((font) => font.variable)
  .join(" ");
