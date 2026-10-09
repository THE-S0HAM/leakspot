// Ambient types for CSS imports so TypeScript accepts CSS-module default imports and plain side-effect imports.
declare module "*.module.css" {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}

declare module "*.css";
