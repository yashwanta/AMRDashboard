import { FormEvent, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { Bot, Send, Search, ShieldCheck } from 'lucide-react'
import { askSiteOps, getSiteOpsHistory } from '../api/client'
import type { SiteOpsAnswer } from '../types'

const prompts = [
  'Why did Springfield have OOM events?',
  'Summarize critical Proxmox events this week',
  'What robot disconnects happened recently?',
  'Which servers need review before patching?',
]

export default function AskSiteOpsPage() {
  const qc = useQueryClient()
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<SiteOpsAnswer | null>(null)
  const { data: history = [] } = useQuery({ queryKey: ['siteops-history'], queryFn: getSiteOpsHistory })

  const mutation = useMutation({
    mutationFn: askSiteOps,
    onSuccess: data => {
      setAnswer(data)
      qc.invalidateQueries({ queryKey: ['siteops-history'] })
    },
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    const text = question.trim()
    if (!text) return
    mutation.mutate(text)
  }

  function askPrompt(text: string) {
    setQuestion(text)
    mutation.mutate(text)
  }

  return (
    <div className="flex flex-col h-full bg-gray-900 text-gray-100">
      <div className="px-6 py-4 bg-gray-900 border-b border-gray-700">
        <h1 className="text-base font-semibold text-white">Ask SiteOps</h1>
        <p className="text-xs text-gray-400 mt-0.5">Grounded answers from ingested SiteOps events. Ollama + pgvector can be enabled in the next phase.</p>
      </div>

      <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-5">
        <section className="space-y-5">
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
            <div className="flex items-center gap-2 mb-4">
              <Bot size={18} className="text-blue-300" />
              <h2 className="font-semibold text-white">SiteOps Assistant</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
              {prompts.map(prompt => (
                <button
                  key={prompt}
                  onClick={() => askPrompt(prompt)}
                  className="text-left text-xs text-gray-300 bg-gray-900 border border-gray-700 hover:border-blue-500 rounded-md px-3 py-2 transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>

            <form onSubmit={submit} className="flex gap-2">
              <input
                className="input bg-gray-950 border-gray-700 text-white"
                value={question}
                onChange={e => setQuestion(e.target.value)}
                placeholder="Ask about OOM, VM kills, robot disconnects, backups, or patch readiness"
              />
              <button disabled={mutation.isPending} className="btn-primary flex items-center gap-2">
                <Send size={15} />
                {mutation.isPending ? 'Asking...' : 'Ask'}
              </button>
            </form>
          </div>

          <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-700 flex items-center gap-2">
              <ShieldCheck size={16} className="text-green-300" />
              <h2 className="font-semibold text-white text-sm">Answer</h2>
            </div>
            <div className="p-4 min-h-40">
              {mutation.isError && (
                <div className="text-sm text-red-300 bg-red-950/40 border border-red-800 rounded-md px-3 py-2">
                  {(mutation.error as any)?.response?.data?.error || 'Ask SiteOps failed'}
                </div>
              )}
              {!answer && !mutation.isPending && !mutation.isError && (
                <p className="text-sm text-gray-500">Ask a question to search the current event database.</p>
              )}
              {answer && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-100 leading-6">{answer.answer}</p>
                  <div>
                    <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-500 mb-2">
                      <Search size={13} />
                      Source events
                    </div>
                    <div className="space-y-2">
                      {answer.source_events.map(ev => (
                        <div key={ev.id} className="bg-gray-950 border border-gray-700 rounded-md p-3">
                          <div className="flex flex-wrap items-center gap-2 text-xs mb-1">
                            <span className="text-gray-300 font-medium">{ev.server_name}</span>
                            <span className="text-gray-500">{format(parseISO(ev.timestamp), 'MMM d, h:mm a')}</span>
                            <span className="text-blue-300">{ev.event_type.replace(/_/g, ' ')}</span>
                            <span className={ev.severity === 'critical' ? 'text-red-300' : 'text-gray-400'}>{ev.severity}</span>
                          </div>
                          <p className="text-xs text-gray-200">{ev.plain_english || ev.message}</p>
                          {ev.recommended_action && (
                            <p className="text-xs text-blue-200 mt-2">{ev.recommended_action}</p>
                          )}
                          {ev.raw_line && (
                            <details className="mt-2">
                              <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-300">Raw log</summary>
                              <pre className="mt-2 text-xs text-gray-400 whitespace-pre-wrap break-all font-mono bg-gray-900 border border-gray-800 rounded p-2">{ev.raw_line}</pre>
                            </details>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden h-fit">
          <div className="px-4 py-3 border-b border-gray-700">
            <h2 className="font-semibold text-white text-sm">Recent Questions</h2>
          </div>
          <div className="divide-y divide-gray-700/60">
            {history.length === 0 && <p className="text-sm text-gray-500 p-4">No questions yet.</p>}
            {history.map(item => (
              <button key={item.id} onClick={() => setQuestion(item.question)} className="w-full text-left p-4 hover:bg-gray-700/40 transition-colors">
                <div className="text-sm text-gray-200 line-clamp-2">{item.question}</div>
                <div className="text-xs text-gray-500 mt-1">{format(parseISO(item.created_at), 'MMM d, h:mm a')}</div>
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
  )
}
