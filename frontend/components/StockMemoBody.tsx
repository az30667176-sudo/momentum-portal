'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export function StockMemoBody({ markdown }: { markdown: string }) {
  return (
    <div className="prose-stock">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mt-12 mb-4 text-2xl font-bold text-black border-b border-gray-200 pb-2">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-10 mb-3 text-xl font-bold text-black border-l-4 border-emerald-600 pl-3">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-8 mb-3 text-lg font-bold text-black">{children}</h3>
          ),
          p: ({ children }) => (
            <p className="my-4 leading-8 text-black text-[15px]">{children}</p>
          ),
          strong: ({ children }) => <strong className="font-bold text-black">{children}</strong>,
          em: ({ children }) => <em className="italic text-black">{children}</em>,
          code: ({ children, className }) => {
            const isBlock = className?.includes('language-') || String(children).includes('\n')
            if (isBlock) {
              return (
                <pre className="my-6 overflow-x-auto rounded-lg bg-gray-50 border border-gray-200 p-4">
                  <code className="block font-mono text-[13px] leading-6 text-black whitespace-pre">
                    {children}
                  </code>
                </pre>
              )
            }
            return (
              <code className="bg-gray-100 rounded px-1.5 py-0.5 font-mono text-[13px] text-black">
                {children}
              </code>
            )
          },
          pre: ({ children }) => <>{children}</>,
          table: ({ children }) => (
            <div className="my-6 overflow-x-auto">
              <table className="w-full border-collapse text-[14px]">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-gray-50">{children}</thead>,
          th: ({ children }) => (
            <th className="border border-gray-300 px-3 py-2 text-left font-semibold text-black">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-gray-300 px-3 py-2 text-black align-top">{children}</td>
          ),
          ul: ({ children }) => (
            <ul className="my-4 ml-6 list-disc space-y-2 text-[15px] leading-7 text-black">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-4 ml-6 list-decimal space-y-2 text-[15px] leading-7 text-black">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="text-black">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="my-4 border-l-4 border-gray-300 pl-4 italic text-gray-700">
              {children}
            </blockquote>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-emerald-600 hover:underline"
            >
              {children}
            </a>
          ),
          hr: () => <hr className="my-10 border-gray-200" />,
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
}
