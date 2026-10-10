// Root ESLint flat config for every workspace and scripts/: typescript-eslint, the repo conventions
// (no any, no unused code, no console.log in src/, named exports only), the layer dependency rules and
// react-hooks for apps/web. eslint-config-prettier stays last so formatting is left entirely to Prettier.
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

// The `globals` package is not installed, so the few Node globals the .mjs scripts use are listed here.
const nodeGlobals = {
  Buffer: "readonly",
  URL: "readonly",
  clearTimeout: "readonly",
  console: "readonly",
  process: "readonly",
  setTimeout: "readonly",
};

// Default exports are banned with core `no-restricted-syntax` (no eslint-plugin-import).
const noDefaultExportSelectors = [
  {
    selector: "ExportDefaultDeclaration",
    message: "Use named exports only (default exports are allowed in *.config.* files).",
  },
  {
    selector: "ExportSpecifier[exported.name='default']",
    message: "Use named exports only (default exports are allowed in *.config.* files).",
  },
];

// ---- Dependency rules (structure.md › Dependency rules; Req 4) ----
// Each restriction is one regex over the import source. `no-restricted-imports` applies it to `import`
// (`import type` included) and `export … from`; `no-restricted-syntax` applies it to `import("…")` and to
// TypeScript `import("…")` types. Composition: flat config gives a file the options of the LAST block
// that sets a rule, so blocks run general → specific and each carries the COMPLETE list for its files,
// built from these constants, with `noDefaultExportSelectors` spread into every `no-restricted-syntax`.
const EXT = "{ts,tsx,mjs,js,cjs}";
const SEP = String.raw`[\\/]`;
const END = String.raw`(?:[\\/]|$)`;

/** Any specifier except a relative path and the exact package names in `allowed`. */
function onlyRelativeAnd(folder, allowed) {
  const exceptions = [String.raw`\.\.?${END}`, ...allowed.map((name) => `${name}$`)].join("|");
  const extra = allowed.length > 0 ? ` and ${allowed.join(", ")}` : "";
  return { regex: `^(?!${exceptions})`, message: `${folder} imports only its own files${extra}.` };
}

/** `..` right after a folder name (`./../x`, `./a/../../x`); banned so the leading `..` run is the climb. */
function normalForm(folder) {
  return {
    regex: String.raw`(?:^|${SEP})(?!\.\.${END})[^\\/]+${SEP}+\.\.${END}`,
    message: `Write relative imports in ${folder} with every ".." at the start (no "./.." or "a/..").`,
  };
}

/** For a file `depth` folders below `folder`, more than `depth` leading `..` segments leave `folder`. */
function staysInside(folder, depth) {
  return {
    regex: String.raw`^\.\.(?:${SEP}+\.\.){${depth}}${END}`,
    message: `Relative imports must stay inside ${folder}.`,
  };
}

/** A relative path with `segment` as one of its folders or files, e.g. `../sim`, `./../../src/sim/x`. */
function relativeInto(segment, message) {
  return { regex: String.raw`^\.\.?${SEP}(?:.*${SEP})?${segment}${END}`, message };
}

const awsSdk = {
  regex: String.raw`^@aws-sdk${SEP}`,
  message: "Only services/api/src/adapters may import @aws-sdk/* packages.",
};
const coreSubpath = {
  regex: String.raw`^@leakspot${SEP}core(?!/(?:world|counterfactual)$)${END}`,
  message:
    'apps/web imports core only as "@leakspot/core/world" or "@leakspot/core/counterfactual".',
};
const relativeIntoCore = relativeInto(
  String.raw`(?:packages|@leakspot)${SEP}(?:.*${SEP})?core`,
  "apps/web may not import packages/core by relative path; use @leakspot/core/world.",
);
const relativeIntoApi = relativeInto("api", "world/ and ui/ never call the API; use state/ hooks.");
const relativeIntoAdapters = relativeInto("adapters", "app/ uses ports, never adapters.");
const relativeIntoSim = relativeInto("sim", "engine/ never imports sim/ (no ground truth).");

const literalImportSelector = {
  selector: "ImportExpression[source.type!='Literal']",
  message: "Use a string literal in import() here so the dependency rules can check it.",
};
const fetchMessage = "world/ and ui/ never call the API (no fetch); use state/ hooks.";

/**
 * The same regex as a `no-restricted-syntax` selector for `import("…")` and TypeScript `import("…")`
 * types (both keep the specifier in `.source`). esquery regexes cannot contain "/", so it becomes \x2F.
 */
function sourceSelector({ regex, message }) {
  const value = `/${regex.replaceAll("/", String.raw`\x2F`)}/i`;
  return {
    selector: `:matches(ImportExpression, TSImportType) > Literal.source[value=${value}]`,
    message,
  };
}

/** One dependency-rule block: `files` with the complete restriction list that applies to them. */
function dependencyScope(files, restrictions, { ignores, literalImportsOnly = false, rules } = {}) {
  return {
    files,
    ...(ignores ? { ignores } : {}),
    rules: {
      "no-restricted-imports": ["error", { patterns: restrictions }],
      "no-restricted-syntax": [
        "error",
        ...noDefaultExportSelectors,
        ...restrictions.map(sourceSelector),
        ...(literalImportsOnly ? [literalImportSelector] : []),
      ],
      ...rules,
    },
  };
}

// packages/<pkg>/src imports only relative files that stay inside src, plus `allowed` (and vitest in
// `*.test.ts`); this subsumes the @aws-sdk ban. With every ".." at the start (normalForm), the leading run
// is the whole climb: a file directly in src may not start with "..", one in a subfolder not with "../..".
// Files two or more folders deep get the subfolder tier: stricter than needed, never looser.
function packageSrcScopes(pkg, allowed, nested = []) {
  const src = `packages/${pkg}/src`;
  const tiers = [
    { prefix: `${src}/`, depth: 0, extra: [] },
    { prefix: `${src}/*/**/`, depth: 1, extra: [] },
    ...nested.map(({ folder, extra }) => ({ prefix: `${src}/${folder}/**/`, depth: 1, extra })),
  ];
  return tiers.flatMap(({ prefix, depth, extra }) =>
    [false, true].map((isTest) =>
      dependencyScope(
        [`${prefix}*.${isTest ? "test.ts" : EXT}`],
        [
          onlyRelativeAnd(src, isTest ? [...allowed, "vitest"] : allowed),
          normalForm(src),
          staysInside(src, depth),
          ...extra,
        ],
        { literalImportsOnly: true },
      ),
    ),
  );
}

const workspaceAndScriptFiles = [
  "apps/web",
  "services/api",
  "packages/core",
  "packages/contracts",
  "infra",
  "scripts",
].map((dir) => `${dir}/**/*.${EXT}`);

const dependencyRules = [
  dependencyScope(workspaceAndScriptFiles, [awsSdk], { ignores: ["services/api/src/adapters/**"] }),
  dependencyScope([`apps/web/**/*.${EXT}`], [awsSdk, coreSubpath, relativeIntoCore]),
  dependencyScope(
    [`apps/web/src/world/**/*.${EXT}`, `apps/web/src/ui/**/*.${EXT}`],
    [awsSdk, coreSubpath, relativeIntoCore, relativeIntoApi],
    {
      literalImportsOnly: true,
      rules: {
        "no-restricted-globals": ["error", { name: "fetch", message: fetchMessage }],
        "no-restricted-properties": [
          "error",
          ...["window", "globalThis", "self"].map((object) => ({
            object,
            property: "fetch",
            message: fetchMessage,
          })),
        ],
      },
    },
  ),
  dependencyScope([`services/api/src/app/**/*.${EXT}`], [awsSdk, relativeIntoAdapters], {
    literalImportsOnly: true,
  }),
  ...packageSrcScopes("contracts", ["zod"]),
  ...packageSrcScopes("core", [], [{ folder: "engine", extra: [relativeIntoSim] }]),
];

export default defineConfig(
  globalIgnores(["**/node_modules/", "**/dist/", "**/cdk.out/", "**/coverage/", "apps/web/dist/"]),

  {
    files: ["**/*.{ts,tsx,mjs}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { vars: "all", args: "all", caughtErrors: "all", ignoreRestSiblings: false },
      ],
      "no-restricted-syntax": ["error", ...noDefaultExportSelectors],
    },
  },

  {
    files: ["**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: nodeGlobals,
    },
  },

  {
    files: [
      "apps/web/src/**/*.{ts,tsx,mjs}",
      "services/api/src/**/*.{ts,tsx,mjs}",
      "packages/*/src/**/*.{ts,tsx,mjs}",
      "infra/src/**/*.{ts,tsx,mjs}",
    ],
    rules: {
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },

  // The API logger is the one src/ module that writes log lines; scripts/ are CLIs that print.
  {
    files: ["services/api/src/logger.ts", "scripts/**"],
    rules: {
      "no-console": "off",
    },
  },

  {
    files: ["apps/web/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat.recommended],
  },

  // Dependency rules (built above). They set `no-restricted-syntax`, so they stay above the exemption.
  ...dependencyRules,

  // Tools such as Vite, Vitest and ESLint load their config through a default export.
  {
    files: ["**/*.config.{ts,js,mjs,cts,mts}"],
    rules: {
      "no-restricted-syntax": "off",
    },
  },

  prettier,
);
