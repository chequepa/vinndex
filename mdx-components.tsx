import type { MDXComponents } from "mdx/types";

/**
 * Global MDX component overrides. Used by @next/mdx via `useMDXComponents`
 * for every .mdx file in the project. Keep styling semantic and close to
 * the rest of the design system (Fraunces for display, Inter for body,
 * cobalt/ink/graphite palette).
 */
export function useMDXComponents(
  components: MDXComponents = {},
): MDXComponents {
  return {
    h1: ({ children }) => (
      <h1 className="display text-4xl md:text-5xl font-semibold text-ink leading-[1.05] mt-12 mb-6 first:mt-0">
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 className="display text-2xl md:text-3xl font-semibold text-ink leading-tight mt-12 mb-4">
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="display text-xl md:text-2xl font-semibold text-ink mt-10 mb-3">
        {children}
      </h3>
    ),
    p: ({ children }) => (
      <p className="text-ink/85 leading-[1.75] text-lg mb-5">{children}</p>
    ),
    a: ({ children, href }) => (
      <a
        href={href}
        className="cobalt text-cobalt underline decoration-cobalt/30 underline-offset-4 hover:decoration-cobalt transition"
      >
        {children}
      </a>
    ),
    ul: ({ children }) => (
      <ul className="list-disc pl-6 text-ink/85 text-lg leading-[1.75] mb-6 space-y-2">
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="list-decimal pl-6 text-ink/85 text-lg leading-[1.75] mb-6 space-y-2">
        {children}
      </ol>
    ),
    li: ({ children }) => <li className="pl-1">{children}</li>,
    blockquote: ({ children }) => (
      <blockquote className="border-l-4 border-mustard pl-6 py-2 my-8 italic text-ink/75 display text-xl">
        {children}
      </blockquote>
    ),
    hr: () => (
      <hr className="border-0 border-t border-ink/10 my-10" />
    ),
    code: ({ children }) => (
      <code className="font-mono text-[0.9em] bg-ink/5 text-ink rounded px-1.5 py-0.5">
        {children}
      </code>
    ),
    pre: ({ children }) => (
      <pre className="font-mono text-sm bg-ink text-snow rounded-xl p-5 my-6 overflow-x-auto">
        {children}
      </pre>
    ),
    strong: ({ children }) => (
      <strong className="font-semibold text-ink">{children}</strong>
    ),
    em: ({ children }) => <em className="italic">{children}</em>,
    ...components,
  };
}
